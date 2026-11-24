import { createHmac, timingSafeEqual } from 'node:crypto';
import { Controller, HttpCode, Logger, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { EmailError, EmailService } from './email.service.js';
import { RenderedEmail, renderEmail } from './layout.js';

/**
 * Supabase's Send Email Hook: instead of mailing sign-up, password-reset and similar emails itself, Supabase posts each
 * one here and Clara sends it through Resend with Clara's own design. Supabase signs every call (Standard Webhooks).
 * https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
 */

const TOLERANCE_SECONDS = 5 * 60;

/** Checks the webhook-id / webhook-timestamp / webhook-signature headers against the hook secret (v1,whsec_<base64>). */
export function verifyStandardWebhook(
  raw: Buffer,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
  now = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }
  const key = Buffer.from(secret.replace(/^v1,whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(raw).digest();
  // The header may hold several space-separated "v1,<base64>" signatures (during a secret rotation).
  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) {
      return false;
    }
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export interface HookPayload {
  user: { id: string; email: string; new_email?: string; user_metadata?: { display_name?: string } };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
  };
}

export interface HookEmail extends RenderedEmail {
  to: string;
}

/** Supabase's own verify address: it checks the token, then sends the person on to redirect_to. */
export function verifyUrl(supabaseUrl: string, tokenHash: string, type: string, redirectTo: string): string {
  const params = new URLSearchParams({ token: tokenHash, type, ...(redirectTo ? { redirect_to: redirectTo } : {}) });
  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`;
}

const greeting = (payload: HookPayload) => {
  const name = payload.user.user_metadata?.display_name?.trim().split(/\s+/)[0];
  return name ? `Hi ${name},` : 'Hi,';
};

/** Which emails to send for one hook call. Usually one; a secure email change needs one to each address. */
const UNDELIVERABLE = 'That email address can’t receive email. Check it and try again.';

/** The rules the app uses too: no dot at the start or end of the name and never two in a row, a real-looking domain. */
export function isDeliverableAddress(address: string): boolean {
  const email = address.trim();
  const at = email.lastIndexOf('@');
  if (at <= 0 || email.length > 254 || email.indexOf('@') !== at) {
    return false;
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return (
    local.length <= 64 &&
    /^[A-Za-z0-9_%+'-]+(\.[A-Za-z0-9_%+'-]+)*$/.test(local) &&
    /^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(domain)
  );
}

/** Resend refused the recipient address (422 validation error about "to"), as opposed to a key or domain problem. */
export function isRecipientError(error: EmailError): boolean {
  return error.status === 422 && /`to`|\bto\b|recipient|email address/i.test(error.message);
}

export function hookEmails(payload: HookPayload, supabaseUrl: string): HookEmail[] {
  const { user, email_data: data } = payload;
  const link = (hash: string) => verifyUrl(supabaseUrl, hash, data.email_action_type, data.redirect_to);
  const hello = greeting(payload);
  const ignore = 'If this was not you, you can ignore this email.';
  switch (data.email_action_type) {
    case 'signup':
      return [
        {
          to: user.email,
          ...renderEmail({
            subject: 'Confirm your email for Clara',
            preheader: 'One tap to finish creating your Clara account.',
            heading: 'Confirm your email',
            paragraphs: [hello, 'Thanks for joining Clara. Tap the button to confirm your email, then sign in to the app to see your skin plan.'],
            button: { label: 'Confirm my email', url: link(data.token_hash) },
            footnote: `${ignore} The link works once and expires after 24 hours.`,
          }),
        },
      ];
    case 'recovery':
      return [
        {
          to: user.email,
          ...renderEmail({
            subject: 'Reset your Clara password',
            preheader: 'Choose a new password for your Clara account.',
            heading: 'Choose a new password',
            paragraphs: [hello, 'We got a request to reset the password for your Clara account. Tap the button to choose a new one.'],
            button: { label: 'Choose a new password', url: link(data.token_hash) },
            footnote: `${ignore} Your password stays the same until you choose a new one. The link works once and expires after 1 hour.`,
          }),
        },
      ];
    case 'magiclink':
      return [
        {
          to: user.email,
          ...renderEmail({
            subject: 'Your Clara sign-in link',
            preheader: 'Tap to sign in to Clara.',
            heading: 'Sign in to Clara',
            paragraphs: [hello, 'Tap the button to sign in.'],
            button: { label: 'Sign in', url: link(data.token_hash) },
            footnote: `${ignore} The link works once.`,
          }),
        },
      ];
    case 'invite':
      return [
        {
          to: user.email,
          ...renderEmail({
            subject: 'You are invited to Clara',
            preheader: 'Accept your invitation to Clara.',
            heading: 'You are invited to Clara',
            paragraphs: [hello, 'You have been invited to create a Clara account. Tap the button to accept.'],
            button: { label: 'Accept invitation', url: link(data.token_hash) },
          }),
        },
      ];
    case 'reauthentication':
      return [
        {
          to: user.email,
          ...renderEmail({
            subject: 'Your Clara confirmation code',
            preheader: `Your code is ${data.token}.`,
            heading: 'Confirm it is you',
            paragraphs: [hello, `Enter this code in the Clara app: ${data.token}`],
            footnote: ignore,
          }),
        },
      ];
    case 'email_change': {
      // Supabase's names are reversed for backward compatibility: token_hash_new goes to the CURRENT address,
      // token_hash to the NEW one. With secure email change off, only the new address gets an email.
      const emails: HookEmail[] = [];
      const change = (to: string, hash: string, current: boolean): HookEmail => ({
        to,
        ...renderEmail({
          subject: 'Confirm your new email for Clara',
          preheader: 'Confirm the change of email on your Clara account.',
          heading: 'Confirm your email change',
          paragraphs: [
            hello,
            current
              ? `Someone asked to change your Clara account email to ${user.new_email ?? 'a new address'}. Tap the button to approve it.`
              : 'Tap the button to confirm this as the new email for your Clara account.',
          ],
          button: { label: 'Confirm email change', url: link(hash) },
          footnote: current ? 'If this was not you, do not tap the button, and change your password.' : ignore,
        }),
      });
      if (data.token_hash_new) {
        emails.push(change(user.email, data.token_hash_new, true));
      }
      if (data.token_hash && user.new_email) {
        emails.push(change(user.new_email, data.token_hash, false));
      }
      return emails;
    }
    default:
      // Security notices (password changed, email changed, sign-in method added...), if turned on in Supabase.
      if (data.email_action_type.endsWith('_notification')) {
        const what = data.email_action_type.replace(/_notification$/, '').replace(/_/g, ' ');
        return [
          {
            to: user.email,
            ...renderEmail({
              subject: 'A change to your Clara account',
              preheader: `Security notice: ${what}.`,
              heading: 'A change to your account',
              paragraphs: [hello, `This is to let you know about a change to your Clara account: ${what}.`],
              footnote: 'If you did not make this change, reset your password in the Clara app straight away.',
            }),
          },
        ];
      }
      return [];
  }
}

@ApiExcludeController()
@Controller('auth')
export class AuthEmailHookController {
  private readonly logger = new Logger(AuthEmailHookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  /** Errors go back to Supabase in its { error: { http_code, message } } shape; it then fails the sign-up or reset. */
  @Public()
  @Post('email-hook')
  @HttpCode(200)
  async handle(@Req() request: RawBodyRequest<Request>, @Res() response: Response): Promise<void> {
    const fail = (status: number, message: string) => {
      response.status(status).json({ error: { http_code: status, message } });
    };
    const secret = this.config.get<string>('SUPABASE_EMAIL_HOOK_SECRET');
    const raw = request.rawBody;
    if (!secret || !raw) {
      return fail(503, 'Email hook is not set up.');
    }
    if (!this.email.enabled) {
      // Answering 200 here would tell Supabase the email went out when it did not.
      return fail(503, 'Email sending is turned off on the Clara API.');
    }
    const ok = verifyStandardWebhook(raw, {
      id: request.header('webhook-id'),
      timestamp: request.header('webhook-timestamp'),
      signature: request.header('webhook-signature'),
    }, secret);
    if (!ok) {
      return fail(401, 'Invalid signature.');
    }
    let payload: HookPayload;
    try {
      payload = JSON.parse(raw.toString('utf8')) as HookPayload;
    } catch {
      return fail(400, 'Invalid body.');
    }
    const emails = hookEmails(payload, this.config.get<string>('SUPABASE_URL')!);
    if (emails.length === 0) {
      this.logger.warn(`Email hook: nothing to send for ${payload.email_data?.email_action_type ?? 'unknown'}.`);
      response.status(200).json({});
      return;
    }
    // An address no mail server would take ("a..b@x.com"): say so plainly instead of trying and failing with a 502,
    // which Supabase would retry and then report as "too many emails".
    const bad = emails.find(email => !isDeliverableAddress(email.to));
    if (bad) {
      this.logger.warn(`Email hook (${payload.email_data.email_action_type}): address refused before sending.`);
      return fail(400, UNDELIVERABLE);
    }
    try {
      for (const [index, email] of emails.entries()) {
        await this.email.send({
          ...email,
          // Supabase retries a failed hook; the same webhook-id must not send the email twice.
          idempotencyKey: `auth-${request.header('webhook-id')}-${index}`,
          tags: { kind: `auth_${payload.email_data.email_action_type}`.slice(0, 64) },
        });
      }
    } catch (error) {
      const message = error instanceof EmailError ? error.message : 'Email could not be sent.';
      this.logger.error(`Email hook (${payload.email_data.email_action_type}) failed: ${message}`);
      // Resend refusing the address itself is the person's typo, not a server fault: no 5xx, so Supabase does not retry.
      if (error instanceof EmailError && isRecipientError(error)) {
        return fail(400, UNDELIVERABLE);
      }
      return fail(502, 'The email could not be sent. Please try again in a minute.');
    }
    response.status(200).json({});
  }
}
