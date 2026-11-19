import { describe, expect, it, vi } from 'vitest';
import { AiServiceError, type AiRecommender, type AiResult } from '../ai/ai-recommender.js';
import type { AiProduct } from '../ai/ai.types.js';
import type { ProductIntakeRepository, SavedProduct } from '../ai/product-intake.repository.js';
import type { UsersService } from '../users/users.service.js';
import type { RecommendationsRepository } from './recommendations.repository.js';
import { budgetSummary, RecommendationsService } from './recommendations.service.js';

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
  age_range: null,
  sensitivity_level: null,
  reaction_history: null,
  reaction_details: null,
  ...over,
});

function build(repo: Record<string, unknown>, ai: AiRecommender | null = null, intake: Partial<ProductIntakeRepository> | null = null) {
  const users = { getMe: vi.fn().mockResolvedValue({}) };
  return new RecommendationsService(
    users as unknown as UsersService,
    {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      items: vi.fn().mockResolvedValue([]),
      ...repo,
    } as unknown as RecommendationsRepository,
    ai,
    intake as ProductIntakeRepository | null,
    850,
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

describe('RecommendationsService.create with the AI service', () => {
  const set = { id: 's1', basis: 'ai_assisted', rule_version: 'ai:m1', limitations: [], summary: 'S' };
  const candidate = { id: 'rule-1', variant_id: 'rv', name: 'Rule Cleanser', brand: 'B', category_code: 'cleansers', currency_code: 'USD', amount: 9, text: 'dry skin', ingredient_count: 1, restriction_codes: [] };
  const found = (id: string): AiProduct => ({
    external_id: id, retailer: { name: 'Target', domain: 'target.com' }, url: `https://target.com/${id}`, name: id, brand: 'B',
    category: 'cleansers', price: { amount: '100.00', currency: 'USD' }, compare_at_price: null, in_stock: true,
    checked_at: new Date().toISOString(), image_url: null, ingredients: ['Aqua'], description: null, how_to_use: null,
    cautions: null, concern_codes: [], reason: 'Gentle for dry skin.', reason_codes: [],
  });
  const savedRow = (id: string, over: Partial<SavedProduct> = {}): SavedProduct => ({
    key: `target.com|${id}`, product_id: `p-${id}`, variant_id: `v-${id}`, name: id, brand: 'B', category_code: 'cleansers',
    amount: '108.50', currency_code: 'USD', in_stock: true, restriction_codes: [], ...over,
  });
  const result = (products: AiProduct[]): AiResult => ({
    response: { schema_version: '1.0', model_version: 'm1', confidence: 'medium', summary: 'S', limitations: ['From AI'], products },
    dropped: [],
    latencyMs: 12,
  });
  const ai = (recommend: AiRecommender['recommend']): AiRecommender => ({ provider: 'http', recommend }) as AiRecommender;

  function setup(recommend: AiRecommender['recommend'], savedRows: SavedProduct[]) {
    const repo = {
      loadProfile: vi.fn().mockResolvedValue(profile()),
      candidates: vi.fn().mockResolvedValue([candidate]),
      save: vi.fn().mockResolvedValue(set),
      recordAiRun: vi.fn().mockResolvedValue(undefined),
    };
    const intake = { save: vi.fn().mockResolvedValue(savedRows) };
    return { repo, intake, service: build(repo, ai(recommend), intake) };
  }

  it('saves the AI picks at Clara prices, with the reasons, and records the run', async () => {
    const { repo, intake, service } = setup(vi.fn().mockResolvedValue(result([found('a')])), [savedRow('a')]);
    const response = await service.create(user, 'key', body);
    expect(intake.save).toHaveBeenCalledWith([found('a')].map((p) => ({ ...p, checked_at: expect.any(String) })), 'US', 850, 'ai');
    const saved = repo.save.mock.calls[0][0];
    expect(saved).toMatchObject({ basis: 'ai_assisted', ruleVersion: 'ai:m1', summary: 'S' });
    expect(saved.plan.products[0]).toMatchObject({ id: 'p-a', amount: 108.5, explanation: 'Gentle for dry skin.' });
    expect(saved.plan.limitations).toContain('From AI');
    expect(saved.steps[0]).toMatchObject({ period: 'morning', product_id: 'p-a', step_type: 'cleanse' });
    expect(repo.candidates).not.toHaveBeenCalled();
    expect(repo.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded', setId: 's1', kept: 1, returned: 1, errorCode: null }));
    expect(response).toMatchObject({ summary: 'S', explanation_status: 'ai' });
  });

  it('falls back to Clara rules when the AI service fails', async () => {
    const { repo, service } = setup(vi.fn().mockRejectedValue(new AiServiceError('AI_UNREACHABLE', 'down')), []);
    await service.create(user, 'key', body);
    const saved = repo.save.mock.calls[0][0];
    expect(saved).toMatchObject({ basis: 'self_reported', summary: null });
    expect(saved.plan.products[0].id).toBe('rule-1');
    expect(saved.plan.limitations).toContain('ai_unavailable');
    expect(repo.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', errorCode: 'AI_UNREACHABLE' }));
  });

  it('falls back when nothing the AI found can be shown', async () => {
    const { repo, service } = setup(vi.fn().mockResolvedValue(result([found('a')])), [savedRow('a', { in_stock: false })]);
    await service.create(user, 'key', body);
    const saved = repo.save.mock.calls[0][0];
    expect(saved.basis).toBe('self_reported');
    expect(saved.plan.limitations).toContain('ai_no_usable_products');
    expect(repo.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded', kept: 0 }));
  });

  it('still answers when the run cannot be recorded', async () => {
    const { repo, service } = setup(vi.fn().mockResolvedValue(result([found('a')])), [savedRow('a')]);
    repo.recordAiRun.mockRejectedValue(new Error('db down'));
    await expect(service.create(user, 'key', body)).resolves.toMatchObject({ id: 's1' });
  });

  it('uses Clara rules only when no AI service is configured', async () => {
    const repo = { loadProfile: vi.fn().mockResolvedValue(profile()), candidates: vi.fn().mockResolvedValue([candidate]), save: vi.fn().mockResolvedValue({ ...set, basis: 'self_reported' }), recordAiRun: vi.fn() };
    await build(repo).create(user, 'key', body);
    expect(repo.save.mock.calls[0][0]).toMatchObject({ basis: 'self_reported' });
    expect(repo.recordAiRun).not.toHaveBeenCalled();
  });
});

describe('budgetSummary', () => {
  const item = (category_code: string, amount: string) => ({ product_id: category_code, variant_id: 'v', rank: 1, name: 'n', brand: 'b', category_code, currency_code: 'USD', amount, reason_codes: [], explanation: null, tier: 'budget' as const });

  it('totals the routine and the best routine against the ceiling', () => {
    const summary = budgetSummary('50.00', [item('cleansers', '10.85'), item('cleansers', '9.00'), item('moisturizers', '16.28')], [item('cleansers', '32.55'), item('moisturizers', '43.40')]);
    expect(summary).toEqual({ ceiling: '50.00', currency_code: 'USD', routine_total: '27.13', best_total: '75.95', within_budget: true, best_exceeds_budget: true });
  });

  it('never marks anything above budget when there is no budget', () => {
    expect(budgetSummary(null, [item('cleansers', '80.00')], [item('cleansers', '80.00')])).toMatchObject({ within_budget: true, best_exceeds_budget: false });
  });
});
