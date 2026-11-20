/**
 * Which status changes the team may make, and what each one needs. Pure, so it can be tested.
 *
 * A paid order is never just "cancelled": the customer's money has to go back, so the team refunds it in Stripe and
 * then marks it refunded. Only an order that was never paid can be cancelled.
 */

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'ordered_from_store',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ADMIN_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['cancelled'],
  paid: ['ordered_from_store', 'refunded'],
  ordered_from_store: ['shipped', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

export interface StatusChange {
  to: OrderStatus;
  carrier?: string;
  trackingNumber?: string;
  note?: string;
}

/** Null when the change is allowed, otherwise the reason it is not. */
export function statusChangeProblem(from: OrderStatus, change: StatusChange): string | null {
  if (!ADMIN_TRANSITIONS[from].includes(change.to)) {
    const allowed = ADMIN_TRANSITIONS[from];
    return allowed.length
      ? `An order that is ${from} can only become ${allowed.join(' or ')}.`
      : `An order that is ${from} can no longer change.`;
  }
  if (change.to === 'shipped' && (!change.carrier?.trim() || !change.trackingNumber?.trim())) {
    return 'Add the carrier and tracking number when marking an order shipped.';
  }
  if ((change.to === 'refunded' || change.to === 'cancelled') && !change.note?.trim()) {
    return `Add a note saying why the order is ${change.to}.`;
  }
  return null;
}

/** The timestamp column each status sets. */
export const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  ordered_from_store: 'ordered_from_store_at',
  shipped: 'shipped_at',
  delivered: 'delivered_at',
  cancelled: 'cancelled_at',
  refunded: 'refunded_at',
};
