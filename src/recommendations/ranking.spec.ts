import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  type Candidate,
  type ProfileInput,
  wantedCategories,
} from './ranking.js';
import { buildRoutineSteps } from './routine-template.js';

const product = (over: Partial<Candidate> & { id: string }): Candidate => ({
  variant_id: `v-${over.id}`,
  name: `Product ${over.id}`,
  brand: 'Clara',
  category_code: 'cleansers',
  currency_code: 'USD',
  amount: 20,
  text: '',
  ingredient_count: 3,
  restriction_codes: [],
  ...over,
});

const profile: ProfileInput = {
  skin_type: 'dry',
  concerns: ['dryness_dehydration'],
  primary_goal: 'improve_hydration',
  goal_codes: [],
  avoid_codes: [],
  budget_band: null,
  categories: ['recommend_for_me'],
};

describe('wantedCategories', () => {
  it('uses the four core categories for recommend_for_me alone', () => {
    expect(wantedCategories(['recommend_for_me'])).toEqual([
      'cleansers',
      'moisturizers',
      'serums',
      'sunscreens',
    ]);
  });
  it('uses the selected categories otherwise', () => {
    expect(wantedCategories(['serums'])).toEqual(['serums']);
  });
});

describe('buildPlan', () => {
  it('picks one product per category, best concern match first', () => {
    const plan = buildPlan(
      [
        product({ id: 'a', text: 'plain wash' }),
        product({ id: 'b', text: 'deeply hydrating cleanser for dry skin' }),
        product({ id: 'c', category_code: 'moisturizers', text: 'rich moisture' }),
      ],
      profile,
    );
    expect(plan.products.map((p) => p.id)).toEqual(['b', 'c']);
    expect(plan.products[0].reason_codes).toContain('concern:dryness_dehydration');
    expect(plan.products.map((p) => p.rank)).toEqual([1, 2]);
  });

  it('drops products whose ingredients hit the avoid-list', () => {
    const plan = buildPlan(
      [
        product({ id: 'a', restriction_codes: ['fragrance'] }),
        product({ id: 'b' }),
      ],
      { ...profile, avoid_codes: ['fragrance'], categories: ['cleansers'] },
    );
    expect(plan.products.map((p) => p.id)).toEqual(['b']);
  });

  it('drops products without ingredient data when an avoid-code is set', () => {
    const plan = buildPlan([product({ id: 'a', ingredient_count: 0 })], {
      ...profile,
      avoid_codes: ['retinol'],
      categories: ['cleansers'],
    });
    expect(plan.products).toEqual([]);
    expect(plan.limitations).toContain('ingredient_data_missing');
  });

  it('keeps products without ingredient data when no avoid-code is set', () => {
    const plan = buildPlan([product({ id: 'a', ingredient_count: 0 })], {
      ...profile,
      categories: ['cleansers'],
    });
    expect(plan.products).toHaveLength(1);
  });

  it('breaks ties by price distance, then name, then id', () => {
    const base = { text: '', category_code: 'cleansers' };
    const plan = buildPlan(
      [
        product({ id: '2', ...base, name: 'B', amount: 12 }),
        product({ id: '1', ...base, name: 'A', amount: 40 }),
        product({ id: '3', ...base, name: 'A', amount: 12 }),
      ],
      { ...profile, concerns: [], goal_codes: [], primary_goal: null, skin_type: null, budget_band: '20_50', categories: ['cleansers'] },
    );
    expect(plan.products[0].id).toBe('3');
  });

  it('ignores price when the budget is no_budget', () => {
    const plan = buildPlan(
      [
        product({ id: '2', name: 'B', amount: 12 }),
        product({ id: '1', name: 'A', amount: 400 }),
      ],
      { ...profile, concerns: [], primary_goal: null, skin_type: null, budget_band: 'no_budget', categories: ['cleansers'] },
    );
    expect(plan.products[0].id).toBe('1');
  });

  it('reports categories with no product', () => {
    const plan = buildPlan([], { ...profile, categories: ['serums'] });
    expect(plan.limitations).toEqual(['no_product_for_serums']);
  });
});

describe('buildRoutineSteps', () => {
  const plan = buildPlan(
    ['cleansers', 'serums', 'moisturizers', 'sunscreens'].map((c) =>
      product({ id: c, category_code: c }),
    ),
    profile,
  );
  it('adds SPF in the morning only for users who already use sunscreen', () => {
    const without = buildRoutineSteps(plan.products, 'cleanser_moisturizer');
    const withSpf = buildRoutineSteps(plan.products, 'multi_product');
    expect(without.filter((s) => s.period === 'morning')).toHaveLength(3);
    expect(withSpf.filter((s) => s.period === 'morning')).toHaveLength(4);
  });
  it('numbers steps from 1 within each period', () => {
    const steps = buildRoutineSteps(plan.products, 'multi_product');
    expect(steps.filter((s) => s.period === 'evening').map((s) => s.position)).toEqual([1, 2, 3]);
  });
});

describe('buildPlan with a monthly budget', () => {
  const candidates = [
    product({ id: 'c-best', category_code: 'cleansers', amount: 30, text: 'for dry skin, hydrating' }),
    product({ id: 'c-cheap', category_code: 'cleansers', amount: 9, text: 'hydrating' }),
    product({ id: 'm-best', category_code: 'moisturizers', amount: 45, text: 'dry skin hydration' }),
    product({ id: 'm-cheap', category_code: 'moisturizers', amount: 14, text: 'hydration' }),
  ];
  const twoSteps = { ...profile, categories: ['cleansers', 'moisturizers'] };

  it('fits the picks to the budget and keeps the best picks apart', () => {
    const plan = buildPlan(candidates, { ...twoSteps, budget_band: '20_50' });
    expect(plan.budget_ceiling).toBe(50);
    expect(plan.products.map((p) => p.id)).toEqual(['c-best', 'm-cheap']);
    expect(plan.products.reduce((sum, p) => sum + p.amount, 0)).toBeLessThanOrEqual(50);
    expect(plan.best.map((p) => [p.id, p.rank])).toEqual([['c-best', 1], ['m-best', 2]]);
  });

  it('gives the same picks for both when there is no budget', () => {
    const plan = buildPlan(candidates, { ...twoSteps, budget_band: 'no_budget' });
    expect(plan.budget_ceiling).toBeNull();
    expect(plan.products.map((p) => p.id)).toEqual(plan.best.map((p) => p.id));
  });

  it('says when even the cheapest routine is over budget', () => {
    const plan = buildPlan(candidates, { ...twoSteps, budget_band: 'under_20' });
    expect(plan.products.map((p) => p.id)).toEqual(['c-cheap', 'm-cheap']);
    expect(plan.limitations).toContain('over_budget');
  });
});
