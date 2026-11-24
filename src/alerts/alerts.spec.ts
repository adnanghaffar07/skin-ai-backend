import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../database/database.service.js';
import type { EmailService } from '../email/email.service.js';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter.js';
import { ApiException } from '../common/http/api.exception.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { AlertsService } from './alerts.js';

function setup(env: Record<string, string> = { ALERT_EMAIL: 'team@example.com' }, answer: (sql: string) => unknown[] = () => []) {
  const database = { query: vi.fn(async (sql: string, _params?: unknown[]) => answer(sql)) };
  const email = { send: vi.fn(async (_email: unknown) => 'id') };
  const config = { get: (key: string) => env[key] };
  const alerts = new AlertsService(database as unknown as DatabaseService, email as unknown as EmailService, config as unknown as ConfigService);
  return { alerts, database, email };
}

describe('alerts', () => {
  it('only logs when no alert email is set', async () => {
    const { alerts, database, email } = setup({});
    await alerts.notify('server-error', 'Subject', ['line']);
    expect(database.query).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('emails when the throttle slot is free, and mentions held-back alerts', async () => {
    const { alerts, email } = setup(undefined, sql => (sql.includes('insert into public.ops_alerts') ? [{ held_back: 4 }] : []));
    await alerts.notify('server-error', 'Clara API: server error', ['GET /x answered 500.']);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'team@example.com', subject: 'Clara API: server error', text: expect.stringContaining('4 more like this') }));
  });

  it('holds the email back inside the throttle window', async () => {
    const { alerts, database, email } = setup(undefined, () => []);
    await alerts.notify('server-error', 'S', ['l']);
    expect(email.send).not.toHaveBeenCalled();
    expect(database.query).toHaveBeenLastCalledWith('update public.ops_alerts set held_back = held_back + 1 where key = $1', ['server-error']);
  });

  it('never throws when the database is down', async () => {
    const { alerts } = setup(undefined, () => {
      throw new Error('db down');
    });
    await expect(alerts.notify('k', 'S', ['l'])).resolves.toBeUndefined();
    await expect(alerts.authFailure()).resolves.toBeUndefined();
  });

  it('alerts once when refused tokens reach the threshold', async () => {
    let count = 0;
    const { alerts, email } = setup({ ALERT_EMAIL: 'team@example.com', ALERT_AUTH_FAILURES: '3' }, sql =>
      sql.includes('ops_counters') ? [{ count: ++count }] : sql.includes('insert into public.ops_alerts') ? [{ held_back: null }] : [],
    );
    for (let i = 0; i < 5; i += 1) {
      await alerts.authFailure();
    }
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0]).toMatchObject({ subject: 'Clara API: many refused sign-in tokens' });
  });

  it('escapes text in the html email', async () => {
    const { alerts, email } = setup(undefined, sql => (sql.includes('insert into public.ops_alerts') ? [{ held_back: 0 }] : []));
    await alerts.notify('k', 'S', ['<script>']);
    expect(email.send.mock.calls[0][0]).toMatchObject({ html: expect.stringContaining('&lt;script&gt;') });
  });

  it('sends a daily summary', async () => {
    const { alerts, email } = setup(undefined, () => [{ server_errors: 2, refused_tokens: 5, ai_failures: 0, ai_runs: 9, new_accounts: 3 }]);
    expect(await alerts.dailySummary()).toEqual({ sent: true, server_errors: 2, refused_tokens: 5, ai_failures: 0 });
    expect(email.send.mock.calls[0][0]).toMatchObject({ subject: 'Clara API daily check: needs a look', text: expect.stringContaining('AI service: 0 failed of 9 calls') });
  });
});

describe('error filter alerts', () => {
  it('answers only after the alert is done, and still answers when it hangs', async () => {
    vi.useFakeTimers();
    let answered = 0;
    const slow = { serverError: () => new Promise<void>(() => undefined), authFailure: async () => undefined };
    const result = new AllExceptionsFilter(slow).catch(new Error('boom'), host(() => (answered += 1)));
    expect(answered).toBe(0);
    await vi.advanceTimersByTimeAsync(3_000);
    await result;
    expect(answered).toBe(1);
    vi.useRealTimers();
  });

  const host = (status: (code: number) => void) =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ status: (code: number) => (status(code), { json: () => undefined }) }),
        getRequest: () => ({ method: 'GET', path: '/api/v1/me', header: () => undefined }),
      }),
    }) as never;

  it('reports server errors and refused tokens, nothing else', async () => {
    const listener = { serverError: vi.fn(async () => undefined), authFailure: vi.fn(async () => undefined) };
    const filter = new AllExceptionsFilter(listener);
    let answered = 0;
    const answer = () => (answered += 1);
    await filter.catch(new Error('boom'), host(answer));
    await filter.catch(new ApiException(401, ErrorCode.UNAUTHENTICATED, 'no'), host(answer));
    void filter.catch(new ApiException(404, ErrorCode.NOT_FOUND, 'no'), host(answer));
    expect(answered).toBe(3);
    expect(listener.serverError).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path: '/api/v1/me', status: 500, message: 'boom' }));
    expect(listener.authFailure).toHaveBeenCalledTimes(1);
  });
});
