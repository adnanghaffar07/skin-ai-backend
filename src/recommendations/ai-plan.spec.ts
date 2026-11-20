import { describe, expect, it } from 'vitest';
import type { AiProduct } from '../ai/ai.types.js';
import type { SavedProduct } from '../ai/product-intake.repository.js';
import { cleanScan, planFromAi, routineProducts, toAiRequest } from './ai-plan.js';
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

describe('cleanScan', () => {
  const now = new Date('2026-11-21T10:00:00Z');
  const sent = {
    source: 'on_device',
    captured_at: '2026-11-21T09:10:00Z',
    findings: [
      { feature: 'redness', level: 'moderate', score: 62.4 },
      { feature: 'redness', level: 'high', score: 90 },
      { feature: 'shine', level: 'none', score: 250 },
      { feature: 'acne', level: 'high', score: 50 },
      { feature: 'blemishes', level: 'unavailable' },
    ],
    photo_issues: ['face-turned', 'face-turned', 'DROP TABLE'],
    photo: 'data:image/jpeg;base64,...',
  };

  it('keeps the known findings once each, rounds and caps scores, and drops anything else', () => {
    expect(cleanScan(sent, now)).toEqual({
      source: 'on_device',
      captured_at: '2026-11-21T09:10:00.000Z',
      findings: [
        { feature: 'redness', level: 'moderate', score: 62 },
        { feature: 'shine', level: 'none', score: 100 },
      ],
      photo_issues: ['face-turned'],
    });
  });

  it('is null without usable findings, a valid date, or with a date in the future', () => {
    expect(cleanScan(undefined, now)).toBeNull();
    expect(cleanScan({ ...sent, findings: [] }, now)).toBeNull();
    expect(cleanScan({ ...sent, captured_at: 'yesterday' }, now)).toBeNull();
    expect(cleanScan({ ...sent, captured_at: '2026-11-22T10:00:00Z' }, now)).toBeNull();
  });

  it('goes into the AI request as one level per feature (v1.1), only when all four were read', () => {
    const full = cleanScan(
      {
        captured_at: '2026-11-21T09:10:00Z',
        findings: [
          { feature: 'redness', level: 'none', score: 3 },
          { feature: 'shine', level: 'mild', score: 30 },
          { feature: 'darkCircles', level: 'none', score: 5 },
          { feature: 'blemishes', level: 'moderate', score: 55 },
        ],
      },
      now,
    );
    expect(toAiRequest(profile(), 'US', 'USD', 'r1', full).scan).toEqual({
      redness: 'none',
      shine: 'mild',
      darkCircles: 'none',
      blemishes: 'moderate',
    });
    // Two of four read: no scan rather than claiming "none" for the others.
    expect(toAiRequest(profile(), 'US', 'USD', 'r1', cleanScan(sent, now)).scan).toBeNull();
    expect(toAiRequest(profile(), 'US', 'USD', 'r1').scan).toBeNull();
    expect(toAiRequest(profile(), 'US', 'USD', 'r1').schema_version).toBe('1.1');
  });
});
