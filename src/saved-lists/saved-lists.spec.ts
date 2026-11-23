import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { UsersService } from '../users/users.service.js';
import { SavedListsService, tidy } from './saved-lists.js';

const user = { id: 'u1', email: null, displayName: null };
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';

describe('saved lists', () => {
  it('keeps each product once', () => {
    expect(tidy({ wishlist: [a, b, a], cart: [{ product_id: a, quantity: 2 }, { product_id: a, quantity: 5 }] })).toEqual({
      wishlist: [a, b],
      cart: [{ product_id: a, quantity: 2 }],
    });
  });
  it('is empty for a new account, and saves both lists for the caller only', async () => {
    const database = { query: vi.fn(async (sql: string, _params?: unknown[]) => (sql.startsWith('insert') ? [{ updated_at: new Date('2026-11-24T00:00:00Z') }] : [])) };
    const service = new SavedListsService({ getMe: vi.fn() } as unknown as UsersService, database as unknown as DatabaseService);
    expect(await service.get(user)).toEqual({ wishlist: [], cart: [], updated_at: null });
    await service.save(user, { wishlist: [a], cart: [{ product_id: b, quantity: 1 }] });
    expect(database.query.mock.calls[1][1]).toEqual(['u1', JSON.stringify([a]), JSON.stringify([{ product_id: b, quantity: 1 }])]);
  });
});
