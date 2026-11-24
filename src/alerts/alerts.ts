import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service.js';
import { EmailService } from '../email/email.service.js';

/**
 * Monitoring and alerts (compliance plan). Emails ALERT_EMAIL through Resend when:
 *   - the API fails with a server error (5xx);
 *   - many requests are refused for a bad or missing sign-in token in a short time (ALERT_AUTH_FAILURES in 10 minutes,
 *     30 by default), which can mean someone is trying stolen or made-up tokens.
 * At most one email per kind every 15 minutes; the next one says how many were held back. Without ALERT_EMAIL nothing
 * is sent and the events are only logged. Password sign-in itself happens in Supabase Auth, whose own logs and rate
 * limits cover wrong passwords.
 * Alerting never throws: a problem here must not turn a request into a failure.
 */
export const THROTTLE_MINUTES = 15;
export const AUTH_WINDOW_MINUTES = 10;
const DEFAULT_AUTH_THRESHOLD = 30;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export type ServerErrorInfo = { method: string; path: string; status: number; requestId: string; message: string };

@Injectable()
export class AlertsService {
  private readonly logger = new Logger('Alerts');

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private get recipient(): string | null {
    const value = this.config.get<string>('ALERT_EMAIL')?.trim();
    return value && EMAIL.test(value) ? value : null;
  }

  private get authThreshold(): number {
    const value = Number(this.config.get('ALERT_AUTH_FAILURES'));
    return Number.isInteger(value) && value >= 3 ? value : DEFAULT_AUTH_THRESHOLD;
  }

  /** A 5xx from any route. Path only, never the query, body or headers. */
  serverError(info: ServerErrorInfo): Promise<void> {
    return this.notify(
      'server-error',
      `Clara API: server error on ${info.method} ${info.path}`,
      [`${info.method} ${info.path} answered ${info.status}.`, `Error: ${info.message}`, `Request id: ${info.requestId}`, 'Search the request id in the Vercel logs for details.'],
    );
  }

  /** A request refused for a bad or missing sign-in token; alerts once the window's count reaches the threshold. */
  async authFailure(): Promise<void> {
    try {
      const rows = await this.database.query<{ count: number }>(
        `insert into public.ops_counters (key, window_start, count) values ('auth-401', now(), 1)
         on conflict (key) do update set
           count = case when ops_counters.window_start < now() - make_interval(mins => $1) then 1 else ops_counters.count + 1 end,
           window_start = case when ops_counters.window_start < now() - make_interval(mins => $1) then now() else ops_counters.window_start end
         returning count`,
        [AUTH_WINDOW_MINUTES],
      );
      const count = rows[0]?.count ?? 0;
      if (count === this.authThreshold) {
        await this.notify('auth-failures', 'Clara API: many refused sign-in tokens', [
          `${count} requests were refused for a bad or missing sign-in token in the last ${AUTH_WINDOW_MINUTES} minutes.`,
          'This can be an app bug after a release, or someone trying tokens. Check the audit log (GET /api/v1/admin/audit?failed_only=true).',
        ]);
      }
    } catch (error) {
      this.logger.warn(`auth failure not counted: ${String(error)}`);
    }
  }

  /** Sends one email per `key` per THROTTLE_MINUTES. Returns whether it went out. */
  async notify(key: string, subject: string, lines: string[]): Promise<void> {
    this.logger.warn(`${subject} | ${lines.join(' | ')}`);
    const to = this.recipient;
    if (!to) {
      return;
    }
    try {
      // Claims the slot only when the last email of this kind is older than the throttle; held back counts the rest.
      const claimed = await this.database.query<{ held_back: number }>(
        `with previous as (select held_back from public.ops_alerts where key = $1)
         insert into public.ops_alerts (key, last_sent_at, held_back) values ($1, now(), 0)
         on conflict (key) do update set last_sent_at = now(), held_back = 0
           where ops_alerts.last_sent_at < now() - make_interval(mins => $2)
         returning (select held_back from previous) as held_back`,
        [key, THROTTLE_MINUTES],
      );
      if (claimed.length === 0) {
        await this.database.query('update public.ops_alerts set held_back = held_back + 1 where key = $1', [key]);
        return;
      }
      const held = claimed[0].held_back ?? 0;
      const body = [...lines, ...(held > 0 ? [`${held} more like this in the last ${THROTTLE_MINUTES} minutes were not emailed.`] : []), `Sent ${new Date().toISOString()}.`];
      await this.email.send({
        to,
        subject,
        text: body.join('\n\n'),
        html: body.map(line => `<p>${escapeHtml(line)}</p>`).join(''),
        tags: { kind: 'ops_alert' },
      });
    } catch (error) {
      this.logger.warn(`alert not sent: ${String(error)}`);
    }
  }

  /** The daily summary email (from the daily job): errors, refused tokens and AI failures in the last 24 hours. */
  async dailySummary(): Promise<{ sent: boolean; server_errors: number; refused_tokens: number; ai_failures: number }> {
    const rows = await this.database.query<{ server_errors: number; refused_tokens: number; ai_failures: number; ai_runs: number; new_accounts: number }>(
      `select
         (select count(*)::int from public.audit_events where created_at > now() - interval '1 day' and coalesce((metadata->>'status_code')::int, 0) >= 500) as server_errors,
         (select count(*)::int from public.audit_events where created_at > now() - interval '1 day' and (metadata->>'status_code')::int = 401) as refused_tokens,
         (select count(*)::int from public.ai_recommendation_runs where created_at > now() - interval '1 day' and status = 'failed') as ai_failures,
         (select count(*)::int from public.ai_recommendation_runs where created_at > now() - interval '1 day') as ai_runs,
         (select count(*)::int from public.users where created_at > now() - interval '1 day') as new_accounts`,
    );
    const day = rows[0] ?? { server_errors: 0, refused_tokens: 0, ai_failures: 0, ai_runs: 0, new_accounts: 0 };
    const to = this.recipient;
    if (to) {
      const lines = [
        `Server errors: ${day.server_errors}`,
        `Refused sign-in tokens: ${day.refused_tokens}`,
        `AI service: ${day.ai_failures} failed of ${day.ai_runs} calls`,
        `New accounts: ${day.new_accounts}`,
      ];
      try {
        await this.email.send({
          to,
          subject: `Clara API daily check: ${day.server_errors || day.ai_failures ? 'needs a look' : 'all clear'}`,
          text: `Last 24 hours\n\n${lines.join('\n')}`,
          html: `<p>Last 24 hours</p><ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
          tags: { kind: 'ops_daily' },
        });
      } catch (error) {
        this.logger.warn(`daily summary not sent: ${String(error)}`);
        return { sent: false, ...day };
      }
    }
    return { sent: !!to, server_errors: day.server_errors, refused_tokens: day.refused_tokens, ai_failures: day.ai_failures };
  }
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

@Global()
@Module({ providers: [AlertsService], exports: [AlertsService] })
export class AlertsModule {}
