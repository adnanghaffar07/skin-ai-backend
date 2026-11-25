import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { checkoutSessionForm, StripeClient, StripeError, verifyStripeSignature } from './stripe.js';

const input = {
  orderId: 'o1',
  orderNumber: '100001',
  currency: 'USD',
  email: 'jane@example.com',
  lines: [
    { name: 'CeraVe Moisturizing Cream', unitCents: 1952, quantity: 2, imageUrl: 'https://img/cream.jpg' },
    { name: 'CeraVe Hydrating Toner', unitCents: 1182, quantity: 1, imageUrl: null },
  ],
  shippingCents: 600,
  shippingLabel: 'Express delivery',
  successUrl: 'https://api/success',
  cancelUrl: 'https://api/cancel',
  expiresAt: 1800000000,
};

const sign = (body: string, secret: string, t: number) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

describe('checkoutSessionForm', () => {
  it('sends each item at Clara\'s price, then delivery as its own line', () => {
    const form = checkoutSessionForm(input);
    expect(form.get('mode')).toBe('payment');
    expect(form.get('client_reference_id')).toBe('o1');
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('1952');
    expect(form.get('line_items[0][quantity]')).toBe('2');
    expect(form.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(form.get('line_items[0][price_data][product_data][images][0]')).toBe('https://img/cream.jpg');
    expect(form.has('line_items[1][price_data][product_data][images][0]')).toBe(false);
    expect(form.get('line_items[2][price_data][product_data][name]')).toBe('Express delivery');
    expect(form.get('line_items[2][price_data][unit_amount]')).toBe('600');
    expect(form.get('expires_at')).toBe('1800000000');
  });

  it('leaves free delivery out', () => {
    const form = checkoutSessionForm({ ...input, shippingCents: 0 });
    expect(form.has('line_items[2][quantity]')).toBe(false);
  });
});

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1"}';
  const now = 1800000000;

  it('accepts a correctly signed, recent event', () => {
    expect(verifyStripeSignature(body, sign(body, secret, now), secret, now)).toBe(true);
  });

  it('rejects a wrong secret, a changed body, a missing header and an old event', () => {
    expect(verifyStripeSignature(body, sign(body, 'whsec_other', now), secret, now)).toBe(false);
    expect(verifyStripeSignature('{"id":"evt_2"}', sign(body, secret, now), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, undefined, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, secret, now - 301), secret, now)).toBe(false);
  });
});

describe('StripeClient', () => {
  it('posts the session with the secret key and an idempotency key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }), { status: 200 }),
    );
    const session = await new StripeClient('sk_test_x', fetchFn).createCheckoutSession(input, 'clara-order-o1');
    expect(session).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk_test_x', 'Idempotency-Key': 'clara-order-o1' });
  });

  it('turns a Stripe error into a StripeError with its status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 }),
    );
    await expect(new StripeClient('sk_test_bad', fetchFn).createCheckoutSession(input, 'k')).rejects.toEqual(
      new StripeError('Invalid API Key', 401),
    );
  });
});

describe('StripeClient.getCheckoutSession', () => {
  it('reads the session with the secret key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'cs_1', status: 'complete', payment_status: 'paid' }), { status: 200 }));
    const session = await new StripeClient('sk_test_x', fetchFn as unknown as typeof fetch).getCheckoutSession('cs_1');
    expect(session).toMatchObject({ id: 'cs_1', payment_status: 'paid' });
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.stripe.com/v1/checkout/sessions/cs_1');
    expect(fetchFn.mock.calls[0]![1].headers).toEqual({ Authorization: 'Bearer sk_test_x' });
  });

  it('throws when Stripe refuses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'No such session' } }), { status: 404 }));
    await expect(new StripeClient('sk_test_x', fetchFn as unknown as typeof fetch).getCheckoutSession('cs_x')).rejects.toMatchObject({ status: 404 });
  });
});
