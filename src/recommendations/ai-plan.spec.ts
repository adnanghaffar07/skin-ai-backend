import { describe, expect, it } from 'vitest';
import type { AiProduct } from '../ai/ai.types.js';
import type { SavedProduct } from '../ai/product-intake.repository.js';
import { planFromAi, routineProducts, toAiRequest } from './ai-plan.js';
import type { ProfileContext } from './recommendations.repository.js';

const profile = (over: Partial<ProfileContext> = {}): ProfileContext => ({
  submission_found: true,
  submission_completed: true,
  skin_type: 'dry',
  routine_level: 'cleanser_moisturizer',
  profile_market: 'US',
  primary_goal: 'improve_hydration',
  budget_band: '20_50',
  concerns: ['dryness_dehydration'],
  goal_codes: [],
  avoid_codes: [],
  categories: ['cleansers', 'moisturizers'],
  age_range: 'age_25_34',
  sensitivity_level: 'sometimes_sensitive',
  reaction_history: 'knows_ingredient',
  reaction_details: 'Fragrance stings',
  ...over,
});

const ai = (id: string, category = 'cleansers', reason: string | null = `Why ${id}`): AiProduct => ({
  external_id: id,
  retailer: { name: 'Target', domain: 'target.com' },
  url: `https://target.com/${id}`,
  name: id,
  brand: 'B',
  category: category as AiProduct['category'],
  price: { amount: '10.00', currency: 'USD' },
  compare_at_price: null,
  in_stock: true,
  checked_at: '2026-11-25T09:00:00.000Z',
  image_url: null,
  ingredients: ['Aqua'],
  description: null,
  how_to_use: null,
  cautions: null,
  concern_codes: [],
  reason,
  reason_codes: ['concern:dryness_dehydration'],
});

const saved = (id: string, over: Partial<SavedProduct> = {}): SavedProduct => ({
  key: `target.com|${id}`,
  product_id: `p-${id}`,
  variant_id: `v-${id}`,
  name: id,
  brand: 'B',
  category_code: 'cleansers',
  amount: '10.85',
  currency_code: 'USD',
  in_stock: true,
  restriction_codes: [],
  ...over,
});

describe('toAiRequest', () => {
  it('sends answers as codes and nothing that identifies the person', () => {
    const request = toAiRequest(profile(), 'US', 'USD', 'r1');
    expect(request.profile).toEqual({
      age_range: 'age_25_34',
      skin_type: 'dry',
      concerns: ['dryness_dehydration'],
      sensitivity_level: 'sometimes_sensitive',
      primary_goal: 'improve_hydration',
      goal_codes: [],
      current_routine: 'cleanser_moisturizer',
      reaction_history: 'knows_ingredient',
      reaction_details: 'Fragrance stings',
      avoid_codes: [],
      monthly_budget: '20_50',
      product_interests: ['cleansers', 'moisturizers'],
    });
    expect(request.limits.categories).toEqual(['cleansers', 'moisturizers']);
    expect(JSON.stringify(request)).not.toMatch(/user|email|birth|name/i);
  });
});

describe('planFromAi', () => {
  it('keeps the AI order, Clara prices and the AI reasons', () => {
    const plan = planFromAi([ai('a'), ai('b', 'moisturizers')], [saved('a'), saved('b', { category_code: 'moisturizers' })], profile());
    expect(plan.products.map((p) => [p.id, p.rank, p.amount, p.explanation])).toEqual([
      ['p-a', 1, 10.85, 'Why a'],
      ['p-b', 2, 10.85, 'Why b'],
    ]);
    expect(plan.products[0].reason_codes).toEqual(['source:ai', 'concern:dryness_dehydration']);
    expect(plan.limitations).toEqual([]);
  });

  it('removes what Clara must not show, whatever the AI says', () => {
    const found = [ai('stock'), ai('avoid'), ai('unknown'), ai('ok', 'moisturizers')];
    const rows = [
      saved('stock', { in_stock: false }),
      saved('avoid', { restriction_codes: ['fragrance'] }),
      saved('unknown', { restriction_codes: null }),
      saved('ok', { category_code: 'moisturizers' }),
    ];
    const plan = planFromAi(found, rows, profile({ avoid_codes: ['fragrance'] }));
    expect(plan.products.map((p) => p.id)).toEqual(['p-ok']);
    expect(plan.limitations).toEqual(['avoided_ingredient_removed', 'ingredient_data_missing', 'no_product_for_cleansers', 'out_of_stock_removed']);
  });

  it('shows a product with unknown ingredients when nothing is avoided', () => {
    const plan = planFromAi([ai('unknown')], [saved('unknown', { restriction_codes: null })], profile({ categories: ['cleansers'] }));
    expect(plan.products).toHaveLength(1);
  });

  it('holds back retinoids for under-18s', () => {
    const plan = planFromAi([ai('r')], [saved('r', { restriction_codes: ['retinol'] })], profile({ age_range: 'under_18', categories: ['cleansers'] }));
    expect(plan.products).toEqual([]);
    expect(plan.limitations).toContain('under_18_active_removed');
  });

  it('builds the routine from the first pick of each category', () => {
    const plan = planFromAi([ai('a'), ai('b'), ai('c', 'moisturizers')], [saved('a'), saved('b'), saved('c', { category_code: 'moisturizers' })], profile());
    expect(routineProducts(plan.products).map((p) => p.id)).toEqual(['p-a', 'p-c']);
  });
});

describe('planFromAi with a monthly budget', () => {
  it('builds the routine within budget and keeps the AI best picks above it', () => {
    const found = [ai('c-best'), ai('c-cheap'), ai('m-best', 'moisturizers'), ai('m-cheap', 'moisturizers')];
    const rows = [
      saved('c-best', { amount: '32.55' }),
      saved('c-cheap', { amount: '10.85' }),
      saved('m-best', { category_code: 'moisturizers', amount: '43.40' }),
      saved('m-cheap', { category_code: 'moisturizers', amount: '16.28' }),
    ];
    const plan = planFromAi(found, rows, profile({ budget_band: '20_50' }));
    expect(plan.budget_ceiling).toBe(50);
    expect(routineProducts(plan.products).map((p) => p.id)).toEqual(['p-c-best', 'p-m-cheap']);
    // Other picks priced within the monthly budget follow the routine; the $43.40 moisturiser fits on its own.
    expect(plan.products.map((p) => p.id)).toEqual(['p-c-best', 'p-m-cheap', 'p-c-cheap', 'p-m-best']);
    expect(plan.best.map((p) => p.id)).toEqual(['p-c-best', 'p-m-best']);
  });
});
