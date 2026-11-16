import { describe, expect, it, vi } from 'vitest';
import type { UsersService } from '../users/users.service.js';
import type { CatalogRepository, ProductRow } from './catalog.repository.js';
import { CatalogService, concernCodesOf } from './catalog.service.js';

const user = { id: 'u1', email: null, displayName: null };

const row = (n: number): ProductRow => ({
  id: `id${n}`,
  name: `Product ${n}`,
  brand: 'Clara',
  category_code: 'cleanser',
  currency_code: 'USD',
  amount: '24.00',
  compare_at_amount: null,
  rating_avg: '4.6',
  rating_count: 10,
  image_url: null,
  badge_code: null,
  benefits: 'Helps dry skin and calms redness.',
  suitable_for: null,
  restriction_codes: ['fragrance'],
  highlighted_ingredients: [],
});

function build(repo: Partial<Record<keyof CatalogRepository, unknown>>) {
  const users = { getMe: vi.fn().mockResolvedValue({}) };
  return new CatalogService(
    users as unknown as UsersService,
    { marketOf: vi.fn().mockResolvedValue('US'), ...repo } as unknown as CatalogRepository,
  );
}

describe('CatalogService', () => {
  it('returns a next_cursor only when more rows exist', async () => {
    const service = build({
      list: vi.fn().mockResolvedValue([row(1), row(2), row(3)]),
    });
    const page = await service.list(user, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.next_cursor).not.toBeNull();
    expect(page.items[0].price).toEqual({
      currency_code: 'USD',
      amount: '24.00',
      compare_at_amount: null,
    });
    expect(page.items[0].rating_avg).toBe(4.6);
    expect(page.items[0].concern_codes).toEqual([
      'dryness_dehydration',
      'redness_sensitivity',
    ]);
    expect(page.items[0].restriction_codes).toEqual(['fragrance']);
  });

  it('derives concern codes from the name, benefits and suitable-for text', () => {
    expect(
      concernCodesOf({ name: 'Retinol Night Serum', benefits: 'Smooths texture and fine lines', suitable_for: null }),
    ).toEqual(['fine_lines', 'uneven_texture']);
    expect(concernCodesOf({ name: 'Plain', benefits: null, suitable_for: null })).toEqual([]);
  });

  it('has no next_cursor on the last page', async () => {
    const service = build({ list: vi.fn().mockResolvedValue([row(1)]) });
    expect((await service.list(user, { limit: 2 })).next_cursor).toBeNull();
  });

  it('asks for a market when neither query nor profile has one', async () => {
    const service = build({ marketOf: vi.fn().mockResolvedValue(null) });
    await expect(service.list(user, {})).rejects.toMatchObject({ status: 422 });
  });

  it('answers 404 for an unavailable product', async () => {
    const service = build({ get: vi.fn().mockResolvedValue(null) });
    await expect(service.get(user, 'x', 'US')).rejects.toMatchObject({ status: 404 });
  });

  it('shows a null price when the market has none', async () => {
    const service = build({
      get: vi.fn().mockResolvedValue({ ...row(1), amount: null, currency_code: null }),
      ingredients: vi.fn().mockResolvedValue([]),
    });
    expect((await service.get(user, 'id1', 'US')).price).toBeNull();
  });
});
