import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import type { DatabaseService } from '../database/database.service.js';
import { statusChangeProblem } from './admin-order-rules.js';
import { AdminOrdersService } from './admin-orders.service.js';
import type { OrderEmailsService } from './order-emails.js';
import type { AdminItemRow, OrderRow, OrdersRepository } from './orders.repository.js';

const admin = { id: 'admin1', email: 'team@clara.test', displayName: null };

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o1',
  number: '100001',
  status: 'paid',
  market_code: 'US',
  currency_code: 'USD',
  subtotal_amount: '30.38',
  shipping_option: 'standard',
  shipping_amount: '0.00',
  total_amount: '30.38',
  contact_name: 'Jane Doe',
  contact_email: 'jane@example.com',
  contact_phone: '+1 555 010 0100',
  shipping_address: '1 Main St, Springfield, IL 62701',
  delivery_note: null,
  payment_session_id: 'cs_1',
  payment_session_url: null,
  carrier: null,
  tracking_number: null,
  paid_at: new Date('2026-11-21T10:05:00Z'),
  ordered_from_store_at: null,
  shipped_at: null,
  delivered_at: null,
  cancelled_at: null,
  refunded_at: null,
  created_at: new Date('2026-11-21T10:00:00Z'),
  ...over,
});

const item = (over: Partial<AdminItemRow> = {}): AdminItemRow => ({
  order_id: 'o1',
  product_id: 'p1',
  product_name: 'Hydrating Cleanser',
  brand_name: 'CeraVe',
  image_url: null,
  quantity: 2,
  unit_amount: '15.19',
  line_amount: '30.38',
  retailer_name: 'Target',
  retailer_url: 'https://www.target.com/p/-/A-1',
  retailer_external_id: '1',
  store_unit_amount: '14.00',
  ...over,
});

function build(repo: Partial<Record<keyof OrdersRepository, unknown>> = {}) {
  const repository = {
    adminList: vi.fn().mockResolvedValue([order()]),
    adminFind: vi.fn().mockResolvedValue(order()),
    adminItems: vi.fn().mockResolvedValue([item()]),
    events: vi.fn().mockResolvedValue([]),
    changeStatus: vi.fn().mockResolvedValue(true),
    ...repo,
  };
  const emails = { send: vi.fn().mockResolvedValue('sent'), list: vi.fn().mockResolvedValue([]) };
  return {
    service: new AdminOrdersService(repository as unknown as OrdersRepository, emails as unknown as OrderEmailsService),
    repository,
    emails,
  };
}

describe('statusChangeProblem', () => {
  it('follows paid -> ordered -> shipped -> delivered', () => {
    expect(statusChangeProblem('paid', { to: 'ordered_from_store' })).toBeNull();
    expect(statusChangeProblem('ordered_from_store', { to: 'shipped', carrier: 'USPS', trackingNumber: '94001' })).toBeNull();
    expect(statusChangeProblem('shipped', { to: 'delivered' })).toBeNull();
  });

  it('refuses skipping steps, going back, and cancelling a paid order', () => {
    expect(statusChangeProblem('paid', { to: 'shipped', carrier: 'USPS', trackingNumber: '1' })).toMatch(/only become/);
    expect(statusChangeProblem('shipped', { to: 'paid' })).toMatch(/only become/);
    expect(statusChangeProblem('paid', { to: 'cancelled', note: 'x' })).toMatch(/only become/);
    expect(statusChangeProblem('refunded', { to: 'paid' })).toMatch(/no longer change/);
  });

  it('needs tracking to ship and a note to refund or cancel', () => {
    expect(statusChangeProblem('ordered_from_store', { to: 'shipped', carrier: 'USPS' })).toMatch(/tracking/);
    expect(statusChangeProblem('paid', { to: 'refunded', note: '  ' })).toMatch(/note/);
    expect(statusChangeProblem('pending_payment', { to: 'cancelled' })).toMatch(/note/);
    expect(statusChangeProblem('delivered', { to: 'refunded', note: 'Damaged' })).toBeNull();
  });
});

describe('AdminGuard', () => {
  const context = (user?: object) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
  const guard = (rows: object[]) => new AdminGuard({ query: vi.fn().mockResolvedValue(rows) } as unknown as DatabaseService);

  it('lets an active admin through', async () => {
    await expect(guard([{ role: 'admin', status: 'active', deleted_at: null }]).canActivate(context(admin))).resolves.toBe(true);
  });

  it('refuses customers, disabled admins and signed-out calls', async () => {
    await expect(guard([{ role: 'customer', status: 'active', deleted_at: null }]).canActivate(context(admin))).rejects.toMatchObject({ status: 403 });
    await expect(guard([{ role: 'admin', status: 'disabled', deleted_at: null }]).canActivate(context(admin))).rejects.toMatchObject({ status: 403 });
    await expect(guard([]).canActivate(context(admin))).rejects.toMatchObject({ status: 403 });
    await expect(guard([]).canActivate(context())).rejects.toMatchObject({ status: 401 });
  });
});

describe('AdminOrdersService', () => {
  it('shows what to buy where, the store cost and the margin', async () => {
    const { items, next_before } = await build().service.list({ status: 'paid' });
    expect(items[0]).toMatchObject({
      number: '100001',
      store_cost_total: '28.00',
      items_margin: '2.38',
      next_statuses: ['ordered_from_store', 'refunded'],
      items: [{ retailer_url: 'https://www.target.com/p/-/A-1', retailer_item_id: '1', store_unit_amount: '14.00', quantity: 2 }],
    });
    expect(next_before).toBeNull();
  });

  it('leaves the margin empty when a store price is missing, and shows a loss as negative', async () => {
    const missing = await build({ adminItems: vi.fn().mockResolvedValue([item({ store_unit_amount: null })]) }).service.list({});
    expect(missing.items[0]).toMatchObject({ store_cost_total: null, items_margin: null });
    const loss = await build({ adminItems: vi.fn().mockResolvedValue([item({ store_unit_amount: '16.00' })]) }).service.list({});
    expect(loss.items[0]!.items_margin).toBe('-1.62');
  });

  it('gives a next page cursor when the page is full', async () => {
    const page = await build().service.list({ limit: 1 });
    expect(page.next_before).toBe('2026-11-21T10:00:00.000Z');
  });

  it('answers 404 for an unknown order', async () => {
    await expect(build({ adminFind: vi.fn().mockResolvedValue(null) }).service.get('x')).rejects.toMatchObject({ status: 404 });
  });

  it('records who moved the order', async () => {
    const { service, repository } = build();
    await service.changeStatus(admin, 'o1', { status: 'ordered_from_store', note: 'Target order 102-555' });
    expect(repository.changeStatus).toHaveBeenCalledWith(
      'o1',
      'paid',
      expect.objectContaining({ to: 'ordered_from_store', note: 'Target order 102-555' }),
      'admin1',
    );
  });

  it('refuses a step that is not allowed, and a change someone else just made', async () => {
    const { service, repository } = build();
    await expect(service.changeStatus(admin, 'o1', { status: 'delivered' })).rejects.toMatchObject({ status: 409 });
    expect(repository.changeStatus).not.toHaveBeenCalled();
    const raced = build({ changeStatus: vi.fn().mockResolvedValue(false) });
    await expect(raced.service.changeStatus(admin, 'o1', { status: 'ordered_from_store' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('AdminOrdersService customer emails', () => {
  it('emails the customer when an order ships, but not when the team buys it from the store', async () => {
    const shipped = build({ adminFind: vi.fn().mockResolvedValue(order({ status: 'ordered_from_store' })) });
    await shipped.service.changeStatus(admin, 'o1', { status: 'shipped', carrier: 'USPS', tracking_number: '9400' });
    expect(shipped.emails.send).toHaveBeenCalledWith('o1', 'shipped');

    const bought = build();
    await bought.service.changeStatus(admin, 'o1', { status: 'ordered_from_store' });
    expect(bought.emails.send).not.toHaveBeenCalled();
  });

  it('resends only emails for steps the order has reached', async () => {
    const { service, emails } = build();
    await service.resendEmail('o1', 'paid');
    expect(emails.send).toHaveBeenCalledWith('o1', 'paid', true);
    await expect(service.resendEmail('o1', 'shipped')).rejects.toMatchObject({ status: 409 });
  });
});
