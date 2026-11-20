import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { fromCents, toCents } from '../pricing/pricing.js';
import { UsersService } from '../users/users.service.js';
import {
  CreatedOrderDto,
  CreateOrderDto,
  OrderDto,
  OrderListDto,
  PaymentsConfigDto,
  SHIPPING_OPTIONS,
  ShippingOption,
} from './dto/order.dto.js';
import { OrderEmailsService } from './order-emails.js';
import { OrderItemRow, OrderRow, OrdersRepository } from './orders.repository.js';
import { StripeClient, StripeError, StripeEvent, verifyStripeSignature } from './stripe.js';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

/** Delivery price for each option, in cents. Set by Clara, not by the app. */
export const SHIPPING_CENTS: Record<ShippingOption, number> = { standard: 0, express: 600, next_day: 1000 };
const SHIPPING_LABEL: Record<ShippingOption, string> = {
  standard: 'Standard delivery',
  express: 'Express delivery',
  next_day: 'Next day delivery',
};
/** How long Stripe's payment page stays open before an unpaid order is cancelled. */
const PAYMENT_WINDOW_SECONDS = 60 * 60;

const iso = (value: Date | null) => (value ? value.toISOString() : null);

/** The DTO classes are shapes for Swagger; the service builds plain objects. */
type Plain<T> = { [K in keyof T]: T[K] };

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly users: UsersService,
    private readonly repo: OrdersRepository,
    private readonly config: ConfigService,
    private readonly orderEmails: OrderEmailsService,
    @Optional() @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient | null = null,
  ) {}

  paymentsConfig(): PaymentsConfigDto {
    return {
      checkout_enabled: this.stripe !== null,
      provider: this.stripe ? 'stripe' : null,
      shipping_options: SHIPPING_OPTIONS.map((id) => ({ id, amount: fromCents(SHIPPING_CENTS[id]) })),
    };
  }

  async create(user: AuthenticatedUser, idempotencyKey: string | undefined, body: CreateOrderDto): Promise<CreatedOrderDto> {
    if (!idempotencyKey || idempotencyKey.length > 64) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Idempotency-Key header is required (max 64 characters).');
    }
    if (!this.stripe) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHECKOUT_UNAVAILABLE, 'Checkout is not available yet.');
    }
    await this.users.getMe(user);
    const existing = await this.repo.findByIdempotencyKey(user.id, idempotencyKey);
    if (existing) {
      return this.withCheckout(existing);
    }

    // The same product twice becomes one line.
    const quantities = new Map<string, number>();
    for (const item of body.items) {
      quantities.set(item.product_id, Math.min(10, (quantities.get(item.product_id) ?? 0) + item.quantity));
    }
    const products = await this.repo.loadProducts([...quantities.keys()], body.market_code);
    const byId = new Map(products.map((product) => [product.id, product]));
    const unavailable = [...quantities.keys()].filter((id) => {
      const product = byId.get(id);
      return !product?.amount || !product.currency_code || product.in_stock === false;
    });
    if (unavailable.length > 0) {
      throw new ApiException(409, ErrorCode.PRODUCT_UNAVAILABLE, 'Some products in the cart are no longer available.', [
        { product_ids: unavailable },
      ]);
    }
    const currencies = new Set(products.map((product) => product.currency_code));
    if (currencies.size !== 1) {
      throw new ApiException(409, ErrorCode.PRODUCT_UNAVAILABLE, 'The cart mixes currencies.');
    }

    const items = [...quantities].map(([id, quantity]) => {
      const product = byId.get(id)!;
      const unit = toCents(product.amount!);
      return { product, quantity, unitCents: unit, lineCents: unit * quantity };
    });
    const subtotalCents = items.reduce((sum, item) => sum + item.lineCents, 0);
    const shippingCents = SHIPPING_CENTS[body.shipping_option];
    const saved = await this.repo.create({
      userId: user.id,
      idempotencyKey,
      market: body.market_code,
      currency: [...currencies][0]!,
      subtotal: fromCents(subtotalCents),
      shippingOption: body.shipping_option,
      shipping: fromCents(shippingCents),
      total: fromCents(subtotalCents + shippingCents),
      contactName: body.full_name,
      contactEmail: body.email,
      contactPhone: body.phone,
      shippingAddress: body.shipping_address,
      deliveryNote: body.delivery_note || null,
      items: items.map((item) => ({
        product: item.product,
        quantity: item.quantity,
        unit: fromCents(item.unitCents),
        line: fromCents(item.lineCents),
      })),
    });
    const order = saved ?? (await this.repo.findByIdempotencyKey(user.id, idempotencyKey));
    if (!order) {
      throw new ApiException(409, ErrorCode.CONFLICT, 'Retry the request.');
    }
    return this.withCheckout(order);
  }

  async list(user: AuthenticatedUser): Promise<OrderListDto> {
    const orders = await this.repo.listForUser(user.id);
    return { items: await this.present(orders) };
  }

  async get(user: AuthenticatedUser, orderId: string): Promise<CreatedOrderDto> {
    const order = await this.repo.findForUser(user.id, orderId);
    if (!order) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Order not found.');
    }
    const [presented] = await this.present([order]);
    return { ...presented!, checkout_url: order.status === 'pending_payment' ? order.payment_session_url : null };
  }

  /**
   * Stripe tells Clara a payment finished (or that the payment page expired). The signature is checked first, and the
   * amount Stripe charged must match the order total before the order counts as paid.
   */
  async handleStripeEvent(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ received: true }> {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret || !rawBody || !verifyStripeSignature(rawBody, signature, secret)) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Invalid Stripe signature.');
    }
    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as StripeEvent;
    } catch {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Invalid event body.');
    }
    const session = event.data?.object;
    const orderId = session?.client_reference_id ?? session?.metadata?.order_id;
    if (!session || !orderId) {
      return { received: true };
    }
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (session.payment_status !== 'paid') {
          break;
        }
        const [order] = await this.repo.findOrderTotal(orderId);
        if (
          !order ||
          session.amount_total !== toCents(order.total_amount) ||
          session.currency?.toUpperCase() !== order.currency_code
        ) {
          this.logger.error(`Stripe ${event.id}: amount or currency does not match order ${orderId}; not marked paid.`);
          break;
        }
        const paid = await this.repo.markPaid(orderId, session.id, session.payment_intent ?? null);
        this.logger.log(paid ? `Order ${orderId} paid.` : `Order ${orderId}: payment event already handled.`);
        if (paid) {
          // Awaited so the serverless function does not stop before Resend answers; it never throws.
          await this.orderEmails.send(orderId, 'paid');
        }
        break;
      }
      case 'checkout.session.expired':
        if (await this.repo.markPaymentExpired(orderId, session.id)) {
          this.logger.log(`Order ${orderId} cancelled: payment page expired.`);
        }
        break;
      default:
        break;
    }
    return { received: true };
  }

  /** Opens (or reopens) Stripe's payment page for an order that is still waiting for payment. */
  private async withCheckout(order: OrderRow): Promise<CreatedOrderDto> {
    let url = order.status === 'pending_payment' ? order.payment_session_url : null;
    if (order.status === 'pending_payment' && !order.payment_session_id && this.stripe) {
      const [presented] = await this.present([order]);
      const base = this.config.get<string>('PUBLIC_BASE_URL');
      const back = (result: string) => `${base}/api/v1/payments/return?result=${result}&order=${order.id}`;
      try {
        const session = await this.stripe.createCheckoutSession(
          {
            orderId: order.id,
            orderNumber: order.number,
            currency: order.currency_code,
            email: order.contact_email,
            lines: presented!.items.map((item) => ({
              name: `${item.brand} ${item.name}`,
              unitCents: toCents(item.unit_amount),
              quantity: item.quantity,
              imageUrl: item.image_url,
            })),
            shippingCents: toCents(order.shipping_amount),
            shippingLabel: SHIPPING_LABEL[order.shipping_option as ShippingOption] ?? 'Delivery',
            successUrl: back('success'),
            cancelUrl: back('cancelled'),
            expiresAt: Math.floor(Date.now() / 1000) + PAYMENT_WINDOW_SECONDS,
          },
          `clara-order-${order.id}`,
        );
        await this.repo.setPaymentSession(order.id, session.id, session.url);
        url = session.url;
      } catch (error) {
        this.logger.error(`Stripe session for order ${order.id} failed: ${String(error)}`);
        throw new ApiException(
          HttpStatus.BAD_GATEWAY,
          ErrorCode.PAYMENT_PROVIDER_ERROR,
          error instanceof StripeError && error.status < 500
            ? 'The payment page could not be opened. Please try again.'
            : 'The payment service is not responding. Please try again in a moment.',
        );
      }
    }
    const [presented] = await this.present([order]);
    return { ...presented!, checkout_url: url };
  }

  private async present(orders: OrderRow[]): Promise<Plain<OrderDto>[]> {
    const items = await this.repo.itemsFor(orders.map((order) => order.id));
    const byOrder = new Map<string, OrderItemRow[]>();
    items.forEach((item) => byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), item]));
    return orders.map((order) => ({
      id: order.id,
      number: order.number,
      status: order.status,
      currency_code: order.currency_code,
      subtotal_amount: order.subtotal_amount,
      shipping_option: order.shipping_option,
      shipping_amount: order.shipping_amount,
      total_amount: order.total_amount,
      full_name: order.contact_name,
      email: order.contact_email,
      phone: order.contact_phone,
      shipping_address: order.shipping_address,
      delivery_note: order.delivery_note,
      carrier: order.carrier,
      tracking_number: order.tracking_number,
      paid_at: iso(order.paid_at),
      ordered_from_store_at: iso(order.ordered_from_store_at),
      shipped_at: iso(order.shipped_at),
      delivered_at: iso(order.delivered_at),
      cancelled_at: iso(order.cancelled_at),
      created_at: order.created_at.toISOString(),
      items: (byOrder.get(order.id) ?? []).map((item) => ({
        product_id: item.product_id,
        name: item.product_name,
        brand: item.brand_name,
        image_url: item.image_url,
        quantity: item.quantity,
        unit_amount: item.unit_amount,
        line_amount: item.line_amount,
      })),
    }));
  }
}
