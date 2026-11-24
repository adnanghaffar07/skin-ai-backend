import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { UsersService } from '../users/users.service.js';
import { ShelfService } from './shelf.js';

const user = { id: 'u1', email: null, displayName: null };
const productId = '11111111-1111-4111-8111-111111111111';
const created = new Date('2026-11-25T00:00:00Z');

function setup(answer: (sql: string, params?: unknown[]) => unknown[]) {
  const database = { query: vi.fn(async (sql: string, params?: unknown[]) => answer(sql, params)) };
  const service = new ShelfService({ getMe: vi.fn() } as unknown as UsersService, database as unknown as DatabaseService);
  return { database, service };
}

const row = (extra: Record<string, unknown> = {}) => ({ id: 's1', product_id: null, name: 'My cleanser', brand: null, category_code: 'cleansers', note: null, image_url: null, created_at: created, ...extra });

describe('skincare shelf', () => {
  it('adds a product from elsewhere with its typed name and category', async () => {
    const { database, service } = setup(sql => (sql.includes('count(*)') ? [{ n: 0 }] : sql.startsWith('insert') ? [{ id: 's1' }] : [row()]));
    const item = await service.add(user, { name: ' My cleanser ', category_code: 'cleansers' });
    expect(item.name).toBe('My cleanser');
    const insert = database.query.mock.calls.find(([sql]) => sql.startsWith('insert'));
    expect(insert?.[1]).toEqual(['u1', null, 'My cleanser', null, 'cleansers', null]);
  });

  it('takes name, brand and category from the catalogue for a catalogue product', async () => {
    const { database, service } = setup(sql =>
      sql.includes('count(*)') ? [{ n: 0 }] : sql.includes('from public.products') ? [{ name: 'Jelly Cleanser', brand: 'Beste', category: 'cleansers' }] : sql.startsWith('insert') ? [{ id: 's1' }] : sql.includes('s.product_id = $2') ? [] : [row({ product_id: productId, name: 'Jelly Cleanser', brand: 'Beste' })],
    );
    await service.add(user, { product_id: productId, name: 'ignored' });
    const insert = database.query.mock.calls.find(([sql]) => sql.startsWith('insert'));
    expect(insert?.[1]).toEqual(['u1', productId, 'Jelly Cleanser', 'Beste', 'cleansers', null]);
  });

  it('returns the existing item instead of adding a catalogue product twice', async () => {
    const { database, service } = setup(sql =>
      sql.includes('count(*)') ? [{ n: 1 }] : sql.includes('from public.products') ? [{ name: 'Jelly Cleanser', brand: 'Beste', category: 'cleansers' }] : [row({ product_id: productId })],
    );
    const item = await service.add(user, { product_id: productId });
    expect(item.id).toBe('s1');
    expect(database.query.mock.calls.some(([sql]) => sql.startsWith('insert'))).toBe(false);
  });

  it('refuses an item with no name and no catalogue product', async () => {
    const { service } = setup(sql => (sql.includes('count(*)') ? [{ n: 0 }] : []));
    await expect(service.add(user, { category_code: 'serums' })).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a product that is not in the catalogue', async () => {
    const { service } = setup(sql => (sql.includes('count(*)') ? [{ n: 0 }] : []));
    await expect(service.add(user, { product_id: productId })).rejects.toMatchObject({ status: 404 });
  });

  it('deletes only from the caller’s shelf', async () => {
    const { database, service } = setup(() => []);
    await service.remove(user, 's1');
    expect(database.query.mock.calls[0]).toEqual(['delete from public.user_shelf_items where id = $2 and user_id = $1', ['u1', 's1']]);
  });
});
