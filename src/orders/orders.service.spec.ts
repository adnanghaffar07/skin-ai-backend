import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { UsersService } from '../users/users.service.js';
import type { CreateOrderDto } from './dto/order.dto.js';
import type { OrderableProduct, OrderRow, OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';
import type { StripeClient } from './stripe.js';

const user = { id: 'u1', email: null, displayName: null };
const SECRET = 'whsec_test';

const product = (id: string, amount: string, over: Partial<OrderableProduct> = {}): OrderableProduct => ({
  id,
  name: `Product ${id}`,
  brand: 'CeraVe',
  image_url: `https://img/${id}.jpg`,
  currency_code: 'USD',
  amount,
  retailer_name: 'Target',
  retailer_url: `https://target.com/${id}`,
  retailer_external_id: id,
  store_amount: '10.00',
  in_stock: true,
  ...over,
});

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o1',
  number: '100001',
  status: 'pending_payment',
  market_code: 'US',
  currency_code: 'USD',
  subtotal_amount: '50.86',
  shipping_option: 'express',
  shipping_amount: '6.00',
  total_amount: '56.86',
  contact_name: 'Jane Doe',
  contact_email: 'jane@example.com',
  contact_phone: '+1 555 010 0100',
  shipping_address: '1 Main St, Springfield, IL 62701',
  delivery_note: null,
  payment_session_id: null,
  payment_session_url: null,
  carrier: null,
  tracking_number: null,
  paid_at: null,
  ordered_from_store_at: null,
  shipped_at: null,
  delivered_at: null,
  cancelled_at: null,
  created_at: new Date('2026-11-21T10:00:00Z'),
  ...over,
});

const body = (over: Partial<CreateOrderDto> = {}): CreateOrderDto => ({
  items: [
    { product_id: 'a', quantity: 1 },
    { product_id: 'b', quantity: 1 },
    { product_id: 'a', quantity: 1 },
  ],
  shipping_option: 'express',
  market_code: 'US',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+1 555 010 0100',
  shipping_address: '1 Main St, Springfield, IL 62701',
  ...over,
});

function build(repo: Partial<Record<keyof OrdersRepository, unknown>> = {}, stripe: Partial<StripeClient> | null = {}) {
  const repository = {
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    loadProducts: vi.fn().mockResolvedValue([product('a', '19.52'), product('b', '11.82')]),
    create: vi.fn().mockResolvedValue(order()),
    itemsFor: vi.fn().mockResolvedValue([]),
    setPaymentSession: vi.fn().mockResolvedValue(undefined),
    findOrderTotal: vi.fn().mockResolvedValue([{ total_amount: '56.86', currency_code: 'USD' }]),
    markPaid: vi.fn().mockResolvedValue(true),
    markPaymentExpired: vi.fn().mockResolvedValue(true),
    ...repo,
  };
  const client = stripe
    ? { createCheckoutSession: vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }), ...stripe }
    : null;
  const config = { get: (key: string) => ({ STRIPE_WEBHOOK_SECRET: SECRET, PUBLIC_BASE_URL: 'https://api.test' })[key] };
  const service = new OrdersService(
    { getMe: vi.fn().mockResolvedValue({}) } as unknown as UsersService,
    repository as unknown as OrdersRepository,
    config as unknown as ConfigService,
    client as unknown as StripeClient | null,
  );
  return { service, repository, client };
}

describe('OrdersService.create', () => {
  it('needs an Idempotency-Key', async () => {
    await expect(build().service.create(user, undefined, body())).rejects.toMatchObject({ status: 400 });
  });

  it('answers 503 while payments are off', async () => {
    await expect(build({}, null).service.create(user, 'k', body())).rejects.toMatchObject({ status: 503 });
  });

  it("prices the order from Clara's catalogue and adds delivery, merging the same product", async () => {
    const { service, repository, client } = build();
    const created = await service.create(user, 'k', body());
    const saved = (repository.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // a: 2 x 19.52 = 39.04, b: 11.82 -> 50.86, express 6.00 -> 56.86
    expect(saved.items.map((i: { product: { id: string }; quantity: number; line: string }) => [i.product.id, i.quantity, i.line])).toEqual([
      ['a', 2, '39.04'],
      ['b', 1, '11.82'],
    ]);
    expect(saved).toMatchObject({ subtotal: '50.86', shipping: '6.00', total: '56.86', currency: 'USD' });
    expect(saved.items[0].product.retailer_url).toBe('https://target.com/a');
    expect(client!.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'o1', shippingCents: 600, successUrl: 'https://api.test/api/v1/payments/return?result=success&order=o1' }),
      'clara-order-o1',
    );
    expect(repository.setPaymentSession).toHaveBeenCalledWith('o1', 'cs_1', 'https://checkout.stripe.com/c/cs_1');
    expect(created.checkout_url).toBe('https://checkout.stripe.com/c/cs_1');
  });

  it('refuses products that are gone, have no price or are out of stock', async () => {
    const { service, repository } = build({
      loadProducts: vi.fn().mockResolvedValue([product('a', '19.52', { in_stock: false })]),
    });
    await expect(service.create(user, 'k', body())).rejects.toMatchObject({ status: 409 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('returns the same order and payment page for a repeated request', async () => {
    const existing = order({ payment_session_id: 'cs_1', payment_session_url: 'https://checkout.stripe.com/c/cs_1' });
    const { service, repository, client } = build({ findByIdempotencyKey: vi.fn().mockResolvedValue(existing) });
    const again = await service.create(user, 'k', body());
    expect(again.checkout_url).toBe('https://checkout.stripe.com/c/cs_1');
    expect(repository.create).not.toHaveBeenCalled();
    expect(client!.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('answers 502 when Stripe fails, leaving the order to retry with the same key', async () => {
    const { service } = build({}, { createCheckoutSession: vi.fn().mockRejectedValue(new Error('timeout')) });
    await expect(service.create(user, 'k', body())).rejects.toMatchObject({ status: 502 });
  });
});

describe('OrdersService.handleStripeEvent', () => {
  const event = (type: string, object: Record<string, unknown>) =>
    Buffer.from(JSON.stringify({ id: 'evt_1', type, data: { object: { id: 'cs_1', client_reference_id: 'o1', ...object } } }));
  const signed = (raw: Buffer) => {
    const t = Math.floor(Date.now() / 1000);
    return `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${raw.toString()}`).digest('hex')}`;
  };

  it('rejects an event without a valid signature', async () => {
    const raw = event('checkout.session.completed', { payment_status: 'paid', amount_total: 5686, currency: 'usd' });
    await expect(build().service.handleStripeEvent(raw, 't=1,v1=bad')).rejects.toMatchObject({ status: 400 });
  });

  it('marks the order paid when the amount matches', async () => {
    const { service, repository } = build();
    const raw = event('checkout.session.completed', { payment_status: 'paid', amount_total: 5686, currency: 'usd', payment_intent: 'pi_1' });
    await service.handleStripeEvent(raw, signed(raw));
    expect(repository.markPaid).toHaveBeenCalledWith('o1', 'cs_1', 'pi_1');
  });

  it('does not mark the order paid when the amount differs', async () => {
    const { service, repository } = build();
    const raw = event('checkout.session.completed', { payment_status: 'paid', amount_total: 100, currency: 'usd' });
    await service.handleStripeEvent(raw, signed(raw));
    expect(repository.markPaid).not.toHaveBeenCalled();
  });

  it('waits when the payment is not settled yet', async () => {
    const { service, repository } = build();
    const raw = event('checkout.session.completed', { payment_status: 'unpaid', amount_total: 5686, currency: 'usd' });
    await service.handleStripeEvent(raw, signed(raw));
    expect(repository.markPaid).not.toHaveBeenCalled();
  });

  it('cancels the order when the payment page expires', async () => {
    const { service, repository } = build();
    const raw = event('checkout.session.expired', {});
    await service.handleStripeEvent(raw, signed(raw));
    expect(repository.markPaymentExpired).toHaveBeenCalledWith('o1', 'cs_1');
  });
});
