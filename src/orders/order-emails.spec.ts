import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import { EmailError, type EmailService } from '../email/email.service.js';
import { OrderEmailsService, orderEmail, trackingUrl } from './order-emails.js';
import type { AdminItemRow, OrderRow, OrdersRepository } from './orders.repository.js';

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o1',
  number: '100001',
  status: 'paid',
  market_code: 'US',
  currency_code: 'USD',
  subtotal_amount: '30.38',
  shipping_option: 'express',
  shipping_amount: '6.00',
  total_amount: '36.38',
  contact_name: 'Jane <Doe>',
  contact_email: 'jane@example.com',
  contact_phone: '+1 555 010 0100',
  shipping_address: '1 Main St, Springfield, IL 62701',
  delivery_note: null,
  payment_session_id: 'cs_1',
  payment_session_url: null,
  carrier: 'USPS',
  tracking_number: '9400 1118',
  paid_at: new Date('2026-11-21T10:05:00Z'),
  ordered_from_store_at: null,
  shipped_at: null,
  delivered_at: null,
  cancelled_at: null,
  refunded_at: null,
  created_at: new Date('2026-11-21T10:00:00Z'),
  ...over,
});

const items: AdminItemRow[] = [
  {
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
  },
];

describe('order email content', () => {
  it('confirms payment with the items, totals and address, and escapes names', () => {
    const email = orderEmail('paid', order(), items);
    expect(email.subject).toBe('Your Clara order #100001 is confirmed');
    expect(email.text).toContain('CeraVe Hydrating Cleanser x 2  $30.38');
    expect(email.text).toContain('Express delivery: $6.00');
    expect(email.text).toContain('Total: $36.38');
    expect(email.html).toContain('Jane &lt;Doe&gt;');
    expect(email.html).not.toContain('Jane <Doe>');
    // The store's price and link are for the team only.
    expect(email.html).not.toContain('target.com');
    expect(email.html).not.toContain('14.00');
  });

  it('gives a tracking button for known carriers', () => {
    const email = orderEmail('shipped', order(), items);
    expect(email.text).toContain('Tracking number: 9400 1118');
    expect(email.text).toContain('Track my parcel: https://tools.usps.com/go/TrackConfirmAction?tLabels=9400%201118');
    expect(trackingUrl('Local courier', '1')).toBeNull();
    expect(trackingUrl('UPS', '1Z')).toBe('https://www.ups.com/track?tracknum=1Z');
  });

  it('states the refunded amount', () => {
    expect(orderEmail('refunded', order(), items).text).toContain('We refunded $36.38 for order #100001');
  });
});

function build({ claimed = [{ attempts: 1 }], enabled = true, send = vi.fn().mockResolvedValue('msg_1') } = {}) {
  const query = vi.fn().mockImplementation((sql: string) => Promise.resolve(sql.includes('insert into public.order_emails') ? claimed : []));
  const repo = { adminFind: vi.fn().mockResolvedValue(order()), adminItems: vi.fn().mockResolvedValue(items) };
  const email = { enabled, send };
  const service = new OrderEmailsService(
    { query } as unknown as DatabaseService,
    repo as unknown as OrdersRepository,
    email as unknown as EmailService,
  );
  const finalStatus = () => query.mock.calls.filter(([sql]) => String(sql).startsWith('update'))[0]?.[1][2];
  return { service, query, send, finalStatus };
}

describe('OrderEmailsService', () => {
  it('sends once, with a key per attempt, and records it as sent', async () => {
    const { service, send, finalStatus } = build();
    await expect(service.send('o1', 'shipped')).resolves.toBe('sent');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@example.com', idempotencyKey: 'order-o1-shipped-1' }));
    expect(finalStatus()).toBe('sent');
  });

  it('does not send again when it already went out', async () => {
    const { service, send } = build({ claimed: [] });
    await expect(service.send('o1', 'paid')).resolves.toBe('already_sent');
    expect(send).not.toHaveBeenCalled();
  });

  it('records a failure instead of throwing', async () => {
    const { service, finalStatus } = build({ send: vi.fn().mockRejectedValue(new EmailError('Resend 403: Domain not verified', 403)) });
    await expect(service.send('o1', 'paid')).resolves.toBe('failed');
    expect(finalStatus()).toBe('failed');
  });

  it('marks it skipped while email sending is off', async () => {
    const { service, send, finalStatus } = build({ enabled: false });
    await expect(service.send('o1', 'paid')).resolves.toBe('skipped');
    expect(send).not.toHaveBeenCalled();
    expect(finalStatus()).toBe('skipped');
  });
});
