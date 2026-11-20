import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Same key = Resend sends it once, even if this is called again (it remembers keys for 24 hours). */
  idempotencyKey?: string;
  /** Short labels Resend shows in its dashboard, e.g. kind=order_shipped. */
  tags?: Record<string, string>;
}

export class EmailError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

/** Sends email through Resend's HTTP API (no SDK). With EMAIL_MODE=off it only logs what would have gone out. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<string>('EMAIL_MODE') === 'resend';
  }

  /** Returns Resend's message id, or null when sending is off. Throws EmailError when Resend refuses or cannot be reached. */
  async send(email: OutgoingEmail): Promise<string | null> {
    if (!this.enabled) {
      this.logger.log(`Email not sent (EMAIL_MODE=off): "${email.subject}"`);
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.get<string>('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
          ...(email.idempotencyKey ? { 'Idempotency-Key': email.idempotencyKey.slice(0, 256) } : {}),
        },
        body: JSON.stringify({
          from: this.config.get<string>('EMAIL_FROM'),
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(this.config.get<string>('EMAIL_REPLY_TO') ? { reply_to: this.config.get<string>('EMAIL_REPLY_TO') } : {}),
          ...(email.tags ? { tags: Object.entries(email.tags).map(([name, value]) => ({ name, value })) } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new EmailError(`Resend could not be reached: ${error instanceof Error ? error.message : 'unknown error'}`, null);
    } finally {
      clearTimeout(timer);
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!response.ok || !body.id) {
      // Resend's message says what is wrong (unverified domain, bad key...) and never contains the key itself.
      throw new EmailError(`Resend ${response.status}: ${body.message ?? body.name ?? 'no message id returned'}`, response.status);
    }
    return body.id;
  }
}
