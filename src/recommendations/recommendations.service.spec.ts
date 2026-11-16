import { describe, expect, it, vi } from 'vitest';
import type { UsersService } from '../users/users.service.js';
import type { RecommendationsRepository } from './recommendations.repository.js';
import { RecommendationsService } from './recommendations.service.js';

const user = { id: 'u1', email: null, displayName: null };
const body = { submission_id: '00000000-0000-0000-0000-000000000001' };
const profile = (over: Record<string, unknown> = {}) => ({
  submission_found: true,
  submission_completed: true,
  skin_type: 'dry',
  routine_level: 'cleanser_moisturizer',
  profile_market: 'US',
  primary_goal: null,
  budget_band: null,
  concerns: [],
  goal_codes: [],
  avoid_codes: [],
  categories: [],
  ...over,
});

function build(repo: Record<string, unknown>) {
  const users = { getMe: vi.fn().mockResolvedValue({}) };
  return new RecommendationsService(
    users as unknown as UsersService,
    {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      items: vi.fn().mockResolvedValue([]),
      ...repo,
    } as unknown as RecommendationsRepository,
  );
}

describe('RecommendationsService.create', () => {
  it('requires an Idempotency-Key of at most 64 characters', async () => {
    const service = build({});
    await expect(service.create(user, undefined, body)).rejects.toMatchObject({ status: 400 });
    await expect(service.create(user, 'k'.repeat(65), body)).rejects.toMatchObject({ status: 400 });
  });

  it('answers 404 when the submission is not this user\'s or does not exist', async () => {
    const service = build({ loadProfile: vi.fn().mockResolvedValue(profile({ submission_found: false, submission_completed: false })) });
    await expect(service.create(user, 'key', body)).rejects.toMatchObject({ status: 404 });
  });

  it('answers 422 when the submission exists but is not completed', async () => {
    const service = build({ loadProfile: vi.fn().mockResolvedValue(profile({ submission_completed: false })) });
    await expect(service.create(user, 'key', body)).rejects.toMatchObject({ status: 422 });
  });

  it('answers 422 when there is no market from the body or the profile', async () => {
    const service = build({ loadProfile: vi.fn().mockResolvedValue(profile({ profile_market: null })) });
    await expect(service.create(user, 'key', body)).rejects.toMatchObject({ status: 422 });
  });

  it('returns the first recommendation again for the same key without building another', async () => {
    const set = { id: 's1', basis: 'self_reported', rule_version: 'v', limitations: [] };
    const loadProfile = vi.fn();
    const service = build({ findByIdempotencyKey: vi.fn().mockResolvedValue(set), loadProfile });
    const result = await service.create(user, 'key', body);
    expect(result.id).toBe('s1');
    expect(loadProfile).not.toHaveBeenCalled();
  });
});
