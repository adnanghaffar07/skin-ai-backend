import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { UsersService } from '../users/users.service.js';
import { checkClientId, ScanResultsService } from './scan-results.js';

const user = { id: 'u1', email: null, displayName: null };
const metrics = [{ id: 'redness', level: 'mild', score: 30, note: 'Mild, on cheeks' }];

function setup() {
  const database = {
    query: vi.fn(async (sql: string, params: unknown[]) =>
      sql.startsWith('insert')
        ? [{ client_id: params[1], analysed_at: new Date(params[2] as string), source: params[3], metrics: JSON.parse(params[4] as string), issues: JSON.parse(params[5] as string) }]
        : [],
    ),
  };
  const users = { getMe: vi.fn().mockResolvedValue({}) };
  return { database, service: new ScanResultsService(users as unknown as UsersService, database as unknown as DatabaseService) };
}

describe('scan results', () => {
  it('saves a scan by the phone\'s id and returns it', async () => {
    const { service, database } = setup();
    const saved = await service.save(user, 'scan-1795461200000', { analysed_at: '2026-11-24T09:30:00.000Z', metrics });
    expect(saved).toEqual({ client_id: 'scan-1795461200000', analysed_at: '2026-11-24T09:30:00.000Z', source: 'device', metrics, issues: [] });
    expect(database.query.mock.calls[0][1][0]).toBe('u1');
  });
  it('only lists and deletes the caller\'s own scans', async () => {
    const { service, database } = setup();
    await service.list(user);
    await service.remove(user, 'scan-1');
    for (const call of database.query.mock.calls) {
      expect(call[0]).toContain('user_id = $1');
      expect(call[1][0]).toBe('u1');
    }
  });
  it('refuses scan ids that are not plain', () => {
    expect(() => checkClientId('../x')).toThrow();
    expect(() => checkClientId('a'.repeat(65))).toThrow();
    expect(checkClientId('scan-1795461200000')).toBe('scan-1795461200000');
  });
});
