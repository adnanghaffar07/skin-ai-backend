import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { UsersService } from '../users/users.service.js';
import { authorName, ReviewsService } from './reviews.js';

const user = { id: 'u1', email: null, displayName: null };

function setup(reviewOwner = 'someone-else', productExists = true) {
  const database = {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.startsWith('select 1 from public.products')) return productExists ? [{}] : [];
      if (sql.startsWith('select user_id from public.product_reviews')) return [{ user_id: reviewOwner }];
      if (sql.startsWith('select count')) return [{ count: 2, average: '4.5' }];
      if (sql.startsWith('select r.id')) return [{ id: 'r1', display_name: 'Amelia Jane', rating: 5, body: 'Lovely', created_at: new Date('2026-11-24T00:00:00Z'), helpful_count: 3, helpful_by_me: false, mine: true }];
      return [];
    }),
  };
  const users = { getMe: vi.fn().mockResolvedValue({}) };
  return { database, service: new ReviewsService(users as unknown as UsersService, database as unknown as DatabaseService) };
}

describe('reviews', () => {
  it('shows only a first name and an initial', () => {
    expect(authorName('Amelia Jane Smith')).toBe('Amelia S.');
    expect(authorName('Amelia')).toBe('Amelia');
    expect(authorName(null)).toBe('Clara customer');
  });
  it('lists reviews with the average and count', async () => {
    const list = await setup().service.list(null, 'p1');
    expect(list).toMatchObject({ count: 2, average: 4.5, items: [{ author: 'Amelia J.', rating: 5, helpful_count: 3, mine: true }] });
  });
  it('writes one review per person per product, for a real product', async () => {
    const { service, database } = setup();
    await service.write(user, 'p1', { rating: 4, body: '  Good  ' });
    const insert = database.query.mock.calls.find(call => String(call[0]).startsWith('insert into public.product_reviews'));
    expect(insert?.[1]).toEqual(['p1', 'u1', 4, 'Good']);
    await expect(setup('x', false).service.write(user, 'p1', { rating: 4, body: 'Good' })).rejects.toMatchObject({ status: 404 });
  });
  it('does not let people mark their own review helpful', async () => {
    await expect(setup('u1').service.helpful(user, 'r1', true)).rejects.toMatchObject({ status: 400 });
    const { service, database } = setup();
    await service.helpful(user, 'r1', true);
    expect(database.query.mock.calls.some(call => String(call[0]).startsWith('insert into public.product_review_votes'))).toBe(true);
  });
});
