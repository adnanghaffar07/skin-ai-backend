import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../database/database.service.js';
import type { ObjectStorage } from '../storage/object-storage.js';
import type { AlertsService } from '../alerts/alerts.js';
import { RetentionController, RetentionService, retentionSettings, sameSecret } from './retention.js';
import type { OrdersService } from '../orders/orders.service.js';

function service(answer: (sql: string) => unknown[] = () => []) {
  const database = { query: vi.fn(async (sql: string, _params?: unknown[]) => answer(sql)) };
  const storage = { delete: vi.fn(async () => undefined) };
  return { database, storage, retention: new RetentionService(database as unknown as DatabaseService, storage as unknown as ObjectStorage) };
}

describe('retention', () => {
  it('does nothing until a period is set', async () => {
    const { database, retention } = service();
    expect(await retention.run({})).toMatchObject({ skipped: ['photos', 'scan_results', 'logs'] });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('reads only whole-day periods from 1 to 3650', () => {
    const env: Record<string, string> = { RETENTION_PHOTO_DAYS: '90', RETENTION_SCAN_DAYS: '0', RETENTION_LOG_DAYS: 'soon' };
    expect(retentionSettings(key => env[key])).toEqual({ photoDays: 90, scanDays: undefined, logDays: undefined });
  });

  it('deletes old photo files and their records', async () => {
    const { database, storage, retention } = service(sql => (sql.startsWith('select scan_id') ? [{ scan_id: 's1', object_key: 'u/s1.jpg' }] : []));
    const result = await retention.run({ photoDays: 30 });
    expect(storage.delete).toHaveBeenCalledWith('u/s1.jpg');
    expect(database.query).toHaveBeenCalledWith('delete from public.scan_images where scan_id = $1', ['s1']);
    expect(result.photos).toBe(1);
  });

  it('still removes the record when the file delete fails, and counts it', async () => {
    const { storage, retention } = service(sql => (sql.startsWith('select scan_id') ? [{ scan_id: 's1', object_key: 'k' }] : []));
    storage.delete.mockRejectedValueOnce(new Error('storage down'));
    expect(await retention.run({ photoDays: 30 })).toMatchObject({ photos: 1, photo_files_failed: 1 });
  });

  it('deletes old scan readings and logs by their own periods', async () => {
    const { database, retention } = service(sql => (sql.includes('delete from public.scan_results') ? [1, 1] : sql.includes('audit_events') ? [1] : sql.includes('analytics_events') ? [1, 1, 1] : []));
    expect(await retention.run({ scanDays: 365, logDays: 180 })).toMatchObject({ scan_results: 2, audit_events: 1, analytics_events: 3, skipped: ['photos'] });
    expect(database.query.mock.calls.find(([sql]) => sql.includes('scan_results'))?.[1]).toEqual([365]);
  });

  it('compares the cron secret safely', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abd', 'abc')).toBe(false);
    expect(sameSecret(undefined, 'abc')).toBe(false);
    expect(sameSecret('abc', undefined)).toBe(false);
  });

  it('hides the route without a secret and refuses a wrong one', async () => {
    const { retention } = service();
    const alerts = { dailySummary: vi.fn(async () => { throw new Error('mail down'); }) } as unknown as AlertsService;
    const orders = { syncPendingPayments: vi.fn(async () => ({ checked: 1, paid: 1, expired: 0 })), refreshLiveOffers: vi.fn(async () => ({ checked: 3, unavailable: 1, repriced: 0 })) } as unknown as OrdersService;
    const off = new RetentionController(retention, { get: () => undefined } as unknown as ConfigService, alerts, orders);
    await expect(off.run('Bearer x')).rejects.toMatchObject({ status: 404 });
    const on = new RetentionController(retention, { get: (key: string) => (key === 'CRON_SECRET' ? 'right' : undefined) } as unknown as ConfigService, alerts, orders);
    await expect(on.run('Bearer wrong')).rejects.toMatchObject({ status: 401 });
    // Every part runs, and one failing is reported without stopping the others.
    await expect(on.run('Bearer right')).resolves.toEqual({
      retention: expect.objectContaining({ skipped: ['photos', 'scan_results', 'logs'] }),
      pending_payments: { checked: 1, paid: 1, expired: 0 },
      live_offers: { checked: 3, unavailable: 1, repriced: 0 },
      daily_check: { error: 'daily check failed: mail down' },
    });
  });
});
