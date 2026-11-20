import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { hookEmails, verifyStandardWebhook, type HookPayload } from './auth-email-hook.js';
import { EmailError, EmailService } from './email.service.js';
import { escapeHtml, renderEmail } from './layout.js';

const SECRET_BYTES = Buffer.from('a-test-secret-for-clara-hooks!!');
const SECRET = `v1,whsec_${SECRET_BYTES.toString('base64')}`;
const NOW = 1_800_000_000;

const sign = (raw: Buffer, id = 'msg_1', timestamp = String(NOW)) =>
  `v1,${createHmac('sha256', SECRET_BYTES).update(`${id}.${timestamp}.${raw.toString()}`).digest('base64')}`;

const payload = (type: string, over: Partial<HookPayload['email_data']> = {}, user: Partial<HookPayload['user']> = {}): HookPayload => ({
  user: { id: 'u1', email: 'ayesha@example.com', user_metadata: { display_name: 'Ayesha Khan' }, ...user },
  email_data: {
    token: '123456',
    token_hash: 'hash_a',
    redirect_to: 'https://clara-skin-api.vercel.app/api/v1/auth/confirmed',
    email_action_type: type,
    site_url: 'https://clara.test',
    token_new: '',
    token_hash_new: '',
    ...over,
  },
});

describe('Supabase hook signature', () => {
  const raw = Buffer.from('{"user":{}}');

  it('accepts a correct signature, also among several', () => {
    expect(verifyStandardWebhook(raw, { id: 'msg_1', timestamp: String(NOW), signature: sign(raw) }, SECRET, NOW)).toBe(true);
    expect(verifyStandardWebhook(raw, { id: 'msg_1', timestamp: String(NOW), signature: `v1,AAAA ${sign(raw)}` }, SECRET, NOW)).toBe(true);
  });

  it('refuses a changed body, a wrong id, an old timestamp or no signature', () => {
    expect(verifyStandardWebhook(Buffer.from('{"user":1}'), { id: 'msg_1', timestamp: String(NOW), signature: sign(raw) }, SECRET, NOW)).toBe(false);
    expect(verifyStandardWebhook(raw, { id: 'msg_2', timestamp: String(NOW), signature: sign(raw) }, SECRET, NOW)).toBe(false);
    const old = String(NOW - 600);
    expect(verifyStandardWebhook(raw, { id: 'msg_1', timestamp: old, signature: sign(raw, 'msg_1', old) }, SECRET, NOW)).toBe(false);
    expect(verifyStandardWebhook(raw, { id: 'msg_1', timestamp: String(NOW) }, SECRET, NOW)).toBe(false);
  });
});

describe('Supabase hook emails', () => {
  it('sends the sign-up link through Supabase verify, back to the confirmed page', () => {
    const [email] = hookEmails(payload('signup'), 'https://x.supabase.co');
    expect(email!.to).toBe('ayesha@example.com');
    expect(email!.subject).toBe('Confirm your email for Clara');
    expect(email!.html).toContain('Hi Ayesha,');
    expect(email!.text).toContain(
      'https://x.supabase.co/auth/v1/verify?token=hash_a&type=signup&redirect_to=https%3A%2F%2Fclara-skin-api.vercel.app%2Fapi%2Fv1%2Fauth%2Fconfirmed',
    );
  });

  it('sends a password reset link', () => {
    const [email] = hookEmails(payload('recovery'), 'https://x.supabase.co');
    expect(email!.subject).toBe('Reset your Clara password');
    expect(email!.text).toContain('type=recovery');
  });

  it('pairs the email-change tokens the way Supabase names them (reversed)', () => {
    const emails = hookEmails(
      payload('email_change', { token_hash: 'for_new', token_hash_new: 'for_current' }, { new_email: 'new@example.com' }),
      'https://x.supabase.co',
    );
    expect(emails.map((email) => [email.to, /token=([a-z_]+)/.exec(email.text)![1]])).toEqual([
      ['ayesha@example.com', 'for_current'],
      ['new@example.com', 'for_new'],
    ]);
  });

  it('sends nothing for an unknown kind', () => {
    expect(hookEmails(payload('something_else'), 'https://x.supabase.co')).toEqual([]);
  });
});

describe('email layout', () => {
  it('escapes names and keeps only https buttons', () => {
    expect(escapeHtml('<b>"Tom" & Co\'s</b>')).toBe('&lt;b&gt;&quot;Tom&quot; &amp; Co&#39;s&lt;/b&gt;');
    const email = renderEmail({ subject: 's', preheader: 'p', heading: '<script>', paragraphs: [], button: { label: 'Go', url: 'javascript:alert(1)' } });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('href="#"');
  });
});

describe('EmailService', () => {
  afterEach(() => vi.unstubAllGlobals());
  const service = (mode: string) =>
    new EmailService({
      get: (key: string) =>
        ({ EMAIL_MODE: mode, RESEND_API_KEY: 're_test', EMAIL_FROM: 'Clara <hello@clara.test>', EMAIL_REPLY_TO: 'team@clara.test' })[key],
    } as unknown as ConfigService);
  const email = { to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', idempotencyKey: 'k1', tags: { kind: 'test' } };

  it('posts to Resend with the key, sender, reply-to and idempotency key', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(service('resend').send(email)).resolves.toBe('msg_1');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer re_test', 'Idempotency-Key': 'k1' });
    expect(JSON.parse(init.body)).toMatchObject({
      from: 'Clara <hello@clara.test>',
      to: ['a@example.com'],
      reply_to: 'team@clara.test',
      tags: [{ name: 'kind', value: 'test' }],
    });
  });

  it("reports Resend's reason when it refuses", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Domain not verified' }), { status: 403 })));
    await expect(service('resend').send(email)).rejects.toThrow(new EmailError('Resend 403: Domain not verified', 403));
  });

  it('sends nothing while email is off', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(service('off').send(email)).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
