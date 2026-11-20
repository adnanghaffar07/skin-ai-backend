import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { fromCents, toCents } from '../pricing/pricing.js';
import { ADMIN_TRANSITIONS, statusChangeProblem, type OrderStatus } from './admin-order-rules.js';
import {
  AdminOrderDetailDto,
  AdminOrderDto,
  AdminOrderListDto,
  AdminOrdersQueryDto,
  ChangeOrderStatusDto,
} from './dto/admin-order.dto.js';
import { AdminItemRow, OrderRow, OrdersRepository } from './orders.repository.js';

type Plain<T> = { [K in keyof T]: T[K] };
const iso = (value: Date | null) => (value ? value.toISOString() : null);

/** What Clara's team needs to fulfil orders: what to buy where, and moving each order along. */
@Injectable()
export class AdminOrdersService {
  constructor(private readonly repo: OrdersRepository) {}

  async list(query: AdminOrdersQueryDto): Promise<AdminOrderListDto> {
    const limit = query.limit ?? 50;
    const orders = await this.repo.adminList(query.status ?? null, limit, query.before ? new Date(query.before) : null);
    const items = await this.present(orders);
    return { items, next_before: orders.length === limit ? orders[orders.length - 1]!.created_at.toISOString() : null };
  }

  async get(orderId: string): Promise<AdminOrderDetailDto> {
    const order = await this.repo.adminFind(orderId);
    if (!order) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Order not found.');
    }
    const [presented] = await this.present([order]);
    const history = await this.repo.events(orderId);
    return {
      ...presented!,
      history: history.map((event) => ({
        from_status: event.from_status,
        to_status: event.to_status,
        note: event.note,
        by: event.actor_email,
        at: event.created_at.toISOString(),
      })),
    };
  }

  async changeStatus(admin: AuthenticatedUser, orderId: string, body: ChangeOrderStatusDto): Promise<AdminOrderDetailDto> {
    const order = await this.repo.adminFind(orderId);
    if (!order) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Order not found.');
    }
    const change = { to: body.status, carrier: body.carrier, trackingNumber: body.tracking_number, note: body.note };
    const problem = statusChangeProblem(order.status as OrderStatus, change);
    if (problem) {
      throw new ApiException(409, ErrorCode.CONFLICT, problem);
    }
    const changed = await this.repo.changeStatus(orderId, order.status as OrderStatus, change, admin.id);
    if (!changed) {
      throw new ApiException(409, ErrorCode.CONFLICT, 'Someone else changed this order just now. Reload it and try again.');
    }
    return this.get(orderId);
  }

  private async present(orders: OrderRow[]): Promise<Plain<AdminOrderDto>[]> {
    const items = await this.repo.adminItems(orders.map((order) => order.id));
    const byOrder = new Map<string, AdminItemRow[]>();
    items.forEach((item) => byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), item]));
    return orders.map((order) => {
      const lines = byOrder.get(order.id) ?? [];
      // Store cost is only known when every item has a store price.
      const known = lines.length > 0 && lines.every((line) => line.store_unit_amount !== null);
      const storeCents = known ? lines.reduce((sum, line) => sum + toCents(line.store_unit_amount!) * line.quantity, 0) : null;
      return {
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
        refunded_at: iso(order.refunded_at),
        created_at: order.created_at.toISOString(),
        store_cost_total: storeCents === null ? null : fromCents(storeCents),
        items_margin: storeCents === null ? null : signed(toCents(order.subtotal_amount) - storeCents),
        next_statuses: [...ADMIN_TRANSITIONS[order.status as OrderStatus]],
        items: lines.map((line) => ({
          product_id: line.product_id,
          name: line.product_name,
          brand: line.brand_name,
          image_url: line.image_url,
          quantity: line.quantity,
          unit_amount: line.unit_amount,
          line_amount: line.line_amount,
          retailer_name: line.retailer_name,
          retailer_url: line.retailer_url,
          retailer_item_id: line.retailer_external_id,
          store_unit_amount: line.store_unit_amount,
        })),
      };
    });
  }
}

/** Margin can be negative if the store raised its price; fromCents only takes positive cents. */
function signed(cents: number): string {
  return cents < 0 ? `-${fromCents(-cents)}` : fromCents(cents);
}
