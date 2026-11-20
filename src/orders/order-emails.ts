import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { EmailError, EmailService } from '../email/email.service.js';
import { EMAIL_COLORS, escapeHtml, RenderedEmail, renderEmail } from '../email/layout.js';
import type { AdminItemRow, OrderRow } from './orders.repository.js';
import { OrdersRepository } from './orders.repository.js';

export const ORDER_EMAIL_KINDS = ['paid', 'shipped', 'delivered', 'refunded'] as const;
export type OrderEmailKind = (typeof ORDER_EMAIL_KINDS)[number];

const SHIPPING_LABEL: Record<string, string> = { standard: 'Standard delivery', express: 'Express delivery', next_day: 'Next day delivery' };

/** Tracking pages of the common US carriers; any other carrier gets the number only. */
export function trackingUrl(carrier: string | null, number: string | null): string | null {
  if (!carrier || !number) {
    return null;
  }
  const code = encodeURIComponent(number.trim());
  const name = carrier.toLowerCase();
  if (name.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${code}`;
  if (name.includes('ups')) return `https://www.ups.com/track?tracknum=${code}`;
  if (name.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${code}`;
  if (name.includes('dhl')) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${code}`;
  if (name.includes('amazon')) return `https://track.amazon.com/tracking/${code}`;
  return null;
}

export function money(amount: string, currency: string): string {
  return currency === 'USD' ? `$${amount}` : `${amount} ${currency}`;
}

/** The items, totals and delivery address, as an email table and as plain text. */
function orderBlock(order: OrderRow, items: AdminItemRow[]): { html: string; text: string } {
  const cell = `padding:8px 0;font-size:14px;line-height:20px;color:${EMAIL_COLORS.text};border-bottom:1px solid ${EMAIL_COLORS.line}`;
  const rows = items
    .map(
      (item) =>
        `<tr><td style="${cell}">${escapeHtml(item.brand_name)} ${escapeHtml(item.product_name)} &times; ${item.quantity}</td>` +
        `<td align="right" style="${cell};white-space:nowrap">${escapeHtml(money(item.line_amount, order.currency_code))}</td></tr>`,
    )
    .join('');
  const total = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:6px 0 0;font-size:14px;color:${bold ? EMAIL_COLORS.text : EMAIL_COLORS.muted}${bold ? ';font-weight:600' : ''}">${escapeHtml(label)}</td>` +
    `<td align="right" style="padding:6px 0 0;font-size:14px;color:${EMAIL_COLORS.text}${bold ? ';font-weight:600' : ''}">${escapeHtml(value)}</td></tr>`;
  const delivery = SHIPPING_LABEL[order.shipping_option] ?? 'Delivery';
  const html =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px">${rows}` +
    total('Items', money(order.subtotal_amount, order.currency_code)) +
    total(delivery, Number(order.shipping_amount) === 0 ? 'Free' : money(order.shipping_amount, order.currency_code)) +
    total('Total', money(order.total_amount, order.currency_code), true) +
    `</table><p style="margin:16px 0 0;font-size:13px;line-height:19px;color:${EMAIL_COLORS.muted}">Delivering to<br>` +
    `<span style="color:${EMAIL_COLORS.text}">${escapeHtml(order.contact_name)}<br>${escapeHtml(order.shipping_address)}</span></p>`;
  const text = [
    ...items.map((item) => `${item.brand_name} ${item.product_name} x ${item.quantity}  ${money(item.line_amount, order.currency_code)}`),
    `Items: ${money(order.subtotal_amount, order.currency_code)}`,
    `${delivery}: ${Number(order.shipping_amount) === 0 ? 'Free' : money(order.shipping_amount, order.currency_code)}`,
    `Total: ${money(order.total_amount, order.currency_code)}`,
    '',
    `Delivering to: ${order.contact_name}, ${order.shipping_address}`,
  ].join('\n');
  return { html, text };
}

/** The email for one step of an order. Exported so it can be tested and previewed. */
export function orderEmail(kind: OrderEmailKind, order: OrderRow, items: AdminItemRow[]): RenderedEmail {
  const first = order.contact_name.trim().split(/\s+/)[0];
  const hello = first ? `Hi ${first},` : 'Hi,';
  const number = `#${order.number}`;
  const footnote = 'Questions about your order? Reply to this email and the Clara team will help.';
  switch (kind) {
    case 'paid':
      return renderEmail({
        subject: `Your Clara order ${number} is confirmed`,
        preheader: `We received your payment of ${money(order.total_amount, order.currency_code)}.`,
        heading: 'Thank you for your order',
        paragraphs: [hello, `We received your payment for order ${number}. We are getting your products ready and will email you as soon as they ship.`],
        block: orderBlock(order, items),
        footnote,
      });
    case 'shipped': {
      const url = trackingUrl(order.carrier, order.tracking_number);
      return renderEmail({
        subject: `Your Clara order ${number} is on its way`,
        preheader: `Shipped with ${order.carrier ?? 'our carrier'}.`,
        heading: 'Your order is on its way',
        paragraphs: [
          hello,
          `Order ${number} has shipped with ${order.carrier ?? 'our carrier'}.`,
          `Tracking number: ${order.tracking_number ?? 'not available yet'}`,
        ],
        ...(url ? { button: { label: 'Track my parcel', url } } : {}),
        block: orderBlock(order, items),
        footnote,
      });
    }
    case 'delivered':
      return renderEmail({
        subject: `Your Clara order ${number} was delivered`,
        preheader: 'Your skincare has arrived.',
        heading: 'Your order has arrived',
        paragraphs: [
          hello,
          `Order ${number} was delivered. We hope you enjoy it.`,
          'Try new products one at a time, and note how your skin feels in the Clara diary so you can see what works for you.',
        ],
        footnote,
      });
    case 'refunded':
      return renderEmail({
        subject: `Refund for your Clara order ${number}`,
        preheader: `${money(order.total_amount, order.currency_code)} is on its way back to you.`,
        heading: 'Your refund is on its way',
        paragraphs: [
          hello,
          `We refunded ${money(order.total_amount, order.currency_code)} for order ${number} to the card you paid with.`,
          'Banks usually show it within 5 to 10 business days.',
        ],
        footnote,
      });
  }
}

export interface OrderEmailRow {
  kind: string;
  status: string;
  recipient: string;
  error: string | null;
  attempts: number;
  updated_at: Date;
}

/** Sends the customer an email when their order moves on. Never throws: a failed email must not undo a payment or a status change. */
@Injectable()
export class OrderEmailsService {
  private readonly logger = new Logger(OrderEmailsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly orders: OrdersRepository,
    private readonly email: EmailService,
  ) {}

  /**
   * Sends one kind of email for an order, once. `again` sends it even if it went out before (the team's resend button).
   * Returns the stored status, or null when there was nothing to send.
   */
  async send(orderId: string, kind: OrderEmailKind, again = false): Promise<string | null> {
    try {
      const order = await this.orders.adminFind(orderId);
      if (!order?.contact_email) {
        return null;
      }
      const claimed = await this.database.query<{ attempts: number }>(
        `
        insert into public.order_emails (order_id, kind, recipient) values ($1, $2, $3)
        on conflict (order_id, kind) do update
          set status = 'sending', attempts = public.order_emails.attempts + 1, recipient = excluded.recipient,
              error = null, updated_at = now()
          where $4::boolean or public.order_emails.status = 'failed'
        returning attempts
        `,
        [orderId, kind, order.contact_email, again],
      );
      if (claimed.length === 0) {
        return 'already_sent';
      }
      if (!this.email.enabled) {
        await this.finish(orderId, kind, 'skipped', null, 'Email sending is turned off (EMAIL_MODE=off).');
        return 'skipped';
      }
      const items = await this.orders.adminItems([orderId]);
      const message = orderEmail(kind, order, items);
      const id = await this.email.send({
        to: order.contact_email,
        ...message,
        idempotencyKey: `order-${orderId}-${kind}-${claimed[0]!.attempts}`,
        tags: { kind: `order_${kind}` },
      });
      await this.finish(orderId, kind, 'sent', id, null);
      return 'sent';
    } catch (error) {
      const reason = error instanceof EmailError ? error.message : error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Order ${orderId} ${kind} email failed: ${reason}`);
      await this.finish(orderId, kind, 'failed', null, reason).catch(() => {});
      return 'failed';
    }
  }

  list(orderId: string): Promise<OrderEmailRow[]> {
    return this.database.query<OrderEmailRow>(
      `select kind, status::text as status, recipient, error, attempts, updated_at
       from public.order_emails where order_id = $1 order by created_at`,
      [orderId],
    );
  }

  private async finish(orderId: string, kind: string, status: string, messageId: string | null, error: string | null) {
    await this.database.query(
      `update public.order_emails set status = $3::public.order_email_status, provider_message_id = $4,
         error = left($5, 500), updated_at = now() where order_id = $1 and kind = $2`,
      [orderId, kind, status, messageId, error],
    );
  }
}
