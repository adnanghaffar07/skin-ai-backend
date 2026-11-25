import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import { STATUS_TIMESTAMP, type OrderStatus, type StatusChange } from './admin-order-rules.js';

/** A product as it can be ordered right now: Clara's current price and where the team buys it. */
export interface OrderableProduct extends QueryResultRow {
  id: string;
  name: string;
  brand: string;
  image_url: string | null;
  currency_code: string | null;
  amount: string | null;
  retailer_name: string | null;
  retailer_url: string | null;
  retailer_external_id: string | null;
  store_amount: string | null;
  in_stock: boolean | null;
  /** Where the store offer came from: 'ai' offers can be rechecked live with the AI service. */
  offer_source: string | null;
  offer_checked_at: Date | null;
}

export interface OrderRow extends QueryResultRow {
  id: string;
  number: string;
  status: string;
  market_code: string;
  currency_code: string;
  subtotal_amount: string;
  shipping_option: string;
  shipping_amount: string;
  total_amount: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  shipping_address: string;
  delivery_note: string | null;
  payment_session_id: string | null;
  payment_session_url: string | null;
  carrier: string | null;
  tracking_number: string | null;
  paid_at: Date | null;
  ordered_from_store_at: Date | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  refunded_at: Date | null;
  created_at: Date;
}

export interface OrderItemRow extends QueryResultRow {
  order_id: string;
  product_id: string;
  product_name: string;
  brand_name: string;
  image_url: string | null;
  quantity: number;
  unit_amount: string;
  line_amount: string;
}

export interface NewOrder {
  userId: string;
  idempotencyKey: string;
  market: string;
  currency: string;
  subtotal: string;
  shippingOption: string;
  shipping: string;
  total: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  shippingAddress: string;
  deliveryNote: string | null;
  items: {
    product: OrderableProduct;
    quantity: number;
    unit: string;
    line: string;
  }[];
}

const ORDER_COLUMNS = `
  o.id, o.number::text as number, o.status, o.market_code, o.currency_code,
  o.subtotal_amount::text as subtotal_amount, o.shipping_option, o.shipping_amount::text as shipping_amount,
  o.total_amount::text as total_amount, o.contact_name, o.contact_email, o.contact_phone, o.shipping_address,
  o.delivery_note, o.payment_session_id, o.payment_session_url, o.carrier, o.tracking_number, o.paid_at, o.ordered_from_store_at,
  o.shipped_at, o.delivered_at, o.cancelled_at, o.refunded_at, o.created_at
`;

@Injectable()
export class OrdersRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Current price (cheapest active variant, as in the catalogue) and the freshest store offer for each product. */
  loadProducts(ids: string[], market: string): Promise<OrderableProduct[]> {
    return this.database.query<OrderableProduct>(
      `
      select p.id, p.name, b.name as brand,
        (select m.url from public.product_media m where m.product_id = p.id order by m.position limit 1) as image_url,
        price.currency_code, price.amount::text as amount,
        offer.retailer_name, offer.url as retailer_url, offer.external_id as retailer_external_id,
        offer.store_amount::text as store_amount, offer.in_stock,
        offer.source as offer_source, offer.checked_at as offer_checked_at
      from public.products p
      join public.brands b on b.id = p.brand_id
      join public.product_market_availability a on a.product_id = p.id and a.market_code = $2 and a.is_available
      left join lateral (
        select pr.currency_code, pr.amount
        from public.product_variants v
        join public.product_prices pr on pr.variant_id = v.id and pr.market_code = $2
        where v.product_id = p.id and v.status = 'active'
          and pr.effective_from <= now() and (pr.effective_to is null or pr.effective_to > now())
        order by pr.amount asc limit 1
      ) price on true
      left join lateral (
        select o.retailer_name, o.url, o.external_id, o.store_amount, o.in_stock, o.source, o.checked_at
        from public.product_offers o
        where o.product_id = p.id and o.market_code = $2
        order by o.in_stock desc, o.checked_at desc limit 1
      ) offer on true
      where p.id = any($1::uuid[]) and p.status = 'active' and p.deleted_at is null
      `,
      [ids, market],
    );
  }

  async findByIdempotencyKey(userId: string, key: string): Promise<OrderRow | null> {
    const rows = await this.database.query<OrderRow>(
      `select ${ORDER_COLUMNS} from public.orders o where o.user_id = $1 and o.idempotency_key = $2`,
      [userId, key],
    );
    return rows[0] ?? null;
  }

  /** Saves the order and its items together; returns null when the same Idempotency-Key raced in first. */
  create(order: NewOrder): Promise<OrderRow | null> {
    return this.database.transaction(async (db) => {
      const rows = await db.query<OrderRow>(
        `
        insert into public.orders (user_id, idempotency_key, market_code, currency_code, subtotal_amount, shipping_option,
          shipping_amount, total_amount, contact_name, contact_email, contact_phone, shipping_address, delivery_note,
          payment_provider)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'stripe')
        on conflict (user_id, idempotency_key) do nothing
        returning id
        `,
        [
          order.userId, order.idempotencyKey, order.market, order.currency, order.subtotal, order.shippingOption,
          order.shipping, order.total, order.contactName, order.contactEmail, order.contactPhone,
          order.shippingAddress, order.deliveryNote,
        ],
      );
      const id = rows[0]?.id;
      if (!id) {
        return null;
      }
      for (const item of order.items) {
        await db.query(
          `
          insert into public.order_items (order_id, product_id, product_name, brand_name, image_url, quantity,
            unit_amount, line_amount, retailer_name, retailer_url, retailer_external_id, store_unit_amount)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            id, item.product.id, item.product.name, item.product.brand, item.product.image_url, item.quantity,
            item.unit, item.line, item.product.retailer_name, item.product.retailer_url,
            item.product.retailer_external_id, item.product.store_amount,
          ],
        );
      }
      const saved = await db.query<OrderRow>(`select ${ORDER_COLUMNS} from public.orders o where o.id = $1`, [id]);
      return saved[0] ?? null;
    });
  }

  async setPaymentSession(orderId: string, sessionId: string, url: string): Promise<void> {
    await this.database.query(
      `update public.orders set payment_session_id = $2, payment_session_url = $3 where id = $1 and payment_session_id is null`,
      [orderId, sessionId, url],
    );
  }

  /** Marks a waiting order paid. Returns false when it was already paid (Stripe can send an event more than once). */
  async markPaid(orderId: string, sessionId: string, paymentIntentId: string | null): Promise<boolean> {
    const rows = await this.database.query(
      `
      with paid as (
        update public.orders set status = 'paid', paid_at = now(), payment_intent_id = $3,
          payment_session_id = coalesce(payment_session_id, $2)
        where id = $1 and status = 'pending_payment' and (payment_session_id is null or payment_session_id = $2)
        returning id
      )
      insert into public.order_status_events (order_id, from_status, to_status, note)
      select id, 'pending_payment', 'paid', 'Paid on Stripe' from paid
      returning order_id
      `,
      [orderId, sessionId, paymentIntentId],
    );
    return rows.length > 0;
  }

  /** The payment page expired without a payment: the order will not go ahead. */
  async markPaymentExpired(orderId: string, sessionId: string): Promise<boolean> {
    const rows = await this.database.query(
      `
      with expired as (
        update public.orders set status = 'cancelled', cancelled_at = now()
        where id = $1 and status = 'pending_payment' and payment_session_id = $2
        returning id
      )
      insert into public.order_status_events (order_id, from_status, to_status, note)
      select id, 'pending_payment', 'cancelled', 'Payment page expired without payment' from expired
      returning order_id
      `,
      [orderId, sessionId],
    );
    return rows.length > 0;
  }

  findOrderTotal(orderId: string): Promise<{ total_amount: string; currency_code: string }[]> {
    return this.database.query(`select total_amount::text, currency_code from public.orders where id = $1`, [orderId]);
  }

  /** Store offers found by the AI that Clara shows as in stock, least recently checked first. */
  listLiveOffers(limit = 200): Promise<{ product_id: string; market_code: string; external_id: string; store_amount: string; store_currency_code: string }[]> {
    return this.database.query(
      `select o.product_id, o.market_code, o.external_id, o.store_amount::text as store_amount, o.store_currency_code
       from public.product_offers o join public.products p on p.id = o.product_id
       where o.source = 'ai' and o.in_stock and p.status = 'active' and p.deleted_at is null
       order by o.checked_at limit $1`,
      [limit],
    );
  }

  /** Orders waiting for payment that have a Stripe page, from the last two days (Stripe's page lasts at most 24 hours). */
  listPendingPayments(limit = 50): Promise<OrderRow[]> {
    return this.database.query<OrderRow>(
      `select ${ORDER_COLUMNS} from public.orders o
       where o.status = 'pending_payment' and o.payment_session_id is not null and o.created_at > now() - interval '2 days'
       order by o.created_at limit $1`,
      [limit],
    );
  }

  listForUser(userId: string, limit = 50): Promise<OrderRow[]> {
    return this.database.query<OrderRow>(
      `select ${ORDER_COLUMNS} from public.orders o where o.user_id = $1 order by o.created_at desc limit $2`,
      [userId, limit],
    );
  }

  async findForUser(userId: string, orderId: string): Promise<OrderRow | null> {
    const rows = await this.database.query<OrderRow>(
      `select ${ORDER_COLUMNS} from public.orders o where o.user_id = $1 and o.id = $2`,
      [userId, orderId],
    );
    return rows[0] ?? null;
  }

  itemsFor(orderIds: string[]): Promise<OrderItemRow[]> {
    if (orderIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.database.query<OrderItemRow>(
      `
      select order_id, product_id, product_name, brand_name, image_url, quantity,
        unit_amount::text as unit_amount, line_amount::text as line_amount
      from public.order_items where order_id = any($1::uuid[]) order by created_at, product_name
      `,
      [orderIds],
    );
  }

  // ---- For the team (admin endpoints) ----

  /** Orders for the team, newest first, optionally of one status; `before` pages through older ones. */
  adminList(status: OrderStatus | null, limit: number, before: Date | null): Promise<OrderRow[]> {
    return this.database.query<OrderRow>(
      `
      select ${ORDER_COLUMNS} from public.orders o
      where ($1::public.order_status is null or o.status = $1::public.order_status)
        and ($2::timestamptz is null or o.created_at < $2::timestamptz)
      order by o.created_at desc limit $3
      `,
      [status, before, limit],
    );
  }

  async adminFind(orderId: string): Promise<OrderRow | null> {
    const rows = await this.database.query<OrderRow>(`select ${ORDER_COLUMNS} from public.orders o where o.id = $1`, [orderId]);
    return rows[0] ?? null;
  }

  /** Items with what the team needs to buy them: the store, its link and item number, and the store price. */
  adminItems(orderIds: string[]): Promise<AdminItemRow[]> {
    if (orderIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.database.query<AdminItemRow>(
      `
      select order_id, product_id, product_name, brand_name, image_url, quantity,
        unit_amount::text as unit_amount, line_amount::text as line_amount,
        retailer_name, retailer_url, retailer_external_id, store_unit_amount::text as store_unit_amount
      from public.order_items where order_id = any($1::uuid[]) order by created_at, product_name
      `,
      [orderIds],
    );
  }

  events(orderId: string): Promise<StatusEventRow[]> {
    return this.database.query<StatusEventRow>(
      `
      select e.from_status::text as from_status, e.to_status::text as to_status, e.note, e.created_at,
        u.email::text as actor_email
      from public.order_status_events e left join public.users u on u.id = e.actor_user_id
      where e.order_id = $1 order by e.created_at
      `,
      [orderId],
    );
  }

  /**
   * Moves an order from `from` to `change.to` and records who did it. Returns false when the order was no longer in
   * `from` (someone else changed it first), so nothing is overwritten.
   */
  changeStatus(orderId: string, from: OrderStatus, change: StatusChange, actorId: string): Promise<boolean> {
    const stamp = STATUS_TIMESTAMP[change.to];
    return this.database.transaction(async (db) => {
      const rows = await db.query(
        `
        update public.orders set status = $3::public.order_status,
          carrier = coalesce($4, carrier), tracking_number = coalesce($5, tracking_number)
          ${stamp ? `, ${stamp} = now()` : ''}
        where id = $1 and status = $2::public.order_status
        returning id
        `,
        [orderId, from, change.to, change.carrier?.trim() || null, change.trackingNumber?.trim() || null],
      );
      if (rows.length === 0) {
        return false;
      }
      await db.query(
        `insert into public.order_status_events (order_id, from_status, to_status, actor_user_id, note)
         values ($1, $2::public.order_status, $3::public.order_status, $4, $5)`,
        [orderId, from, change.to, actorId, change.note?.trim() || null],
      );
      return true;
    });
  }
}

export interface AdminItemRow extends OrderItemRow {
  retailer_name: string | null;
  retailer_url: string | null;
  retailer_external_id: string | null;
  store_unit_amount: string | null;
}

export interface StatusEventRow extends QueryResultRow {
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: Date;
  actor_email: string | null;
}
