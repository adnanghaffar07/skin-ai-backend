import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The small part of Stripe that Clara uses, over plain HTTPS: create a Checkout Session (Stripe's own payment page)
 * and check that webhook events really come from Stripe. Card details never reach Clara.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export interface CheckoutLine {
  name: string;
  /** Unit price in cents. */
  unitCents: number;
  quantity: number;
  imageUrl?: string | null;
}

export interface CheckoutSessionInput {
  orderId: string;
  orderNumber: string;
  currency: string;
  email: string;
  lines: CheckoutLine[];
  /** Delivery fee in cents; left out when free. */
  shippingCents: number;
  shippingLabel: string;
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds when the payment page stops working (Stripe allows 30 minutes to 24 hours). */
  expiresAt: number;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/** Stripe's form encoding (`line_items[0][price_data][currency]=usd`). Pure, so it can be tested. */
export function checkoutSessionForm(input: CheckoutSessionInput): URLSearchParams {
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('client_reference_id', input.orderId);
  form.set('customer_email', input.email);
  form.set('success_url', input.successUrl);
  form.set('cancel_url', input.cancelUrl);
  form.set('expires_at', String(input.expiresAt));
  form.set('metadata[order_id]', input.orderId);
  form.set('metadata[order_number]', input.orderNumber);
  form.set('payment_intent_data[metadata][order_id]', input.orderId);
  form.set('payment_intent_data[description]', `Clara order #${input.orderNumber}`);
  const lines = input.shippingCents > 0
    ? [...input.lines, { name: input.shippingLabel, unitCents: input.shippingCents, quantity: 1 }]
    : input.lines;
  lines.forEach((line, i) => {
    form.set(`line_items[${i}][quantity]`, String(line.quantity));
    form.set(`line_items[${i}][price_data][currency]`, input.currency.toLowerCase());
    form.set(`line_items[${i}][price_data][unit_amount]`, String(line.unitCents));
    form.set(`line_items[${i}][price_data][product_data][name]`, line.name);
    if ('imageUrl' in line && line.imageUrl) {
      form.set(`line_items[${i}][price_data][product_data][images][0]`, line.imageUrl);
    }
  });
  return form;
}

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class StripeClient {
  constructor(
    private readonly secretKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async createCheckoutSession(input: CheckoutSessionInput, idempotencyKey: string): Promise<CheckoutSession> {
    const response = await this.fetchFn(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // Stripe returns the same session when the same order is sent twice.
        'Idempotency-Key': idempotencyKey,
      },
      body: checkoutSessionForm(input),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !body.id || !body.url) {
      throw new StripeError(body.error?.message ?? `Stripe returned ${response.status}`, response.status);
    }
    return { id: body.id, url: body.url };
  }
}

/**
 * Checks the `Stripe-Signature` header: HMAC-SHA256 of `${timestamp}.${raw body}` with the endpoint's signing secret,
 * and a timestamp within `toleranceSeconds` so an old event cannot be replayed.
 */
export function verifyStripeSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!header) {
    return false;
  }
  const parts = header.split(',').map((part) => part.split('='));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');
  if (!Number.isFinite(timestamp) || signatures.length === 0 || Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }
  const payload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`;
  const expected = Buffer.from(createHmac('sha256', secret).update(payload).digest('hex'), 'utf8');
  return signatures.some((signature) => {
    const given = Buffer.from(signature, 'utf8');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The events Clara acts on. */
export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      client_reference_id?: string | null;
      payment_status?: string;
      payment_intent?: string | null;
      amount_total?: number | null;
      currency?: string | null;
      metadata?: Record<string, string>;
    };
  };
}
