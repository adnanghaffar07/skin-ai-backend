import { describe, expect, it } from 'vitest';
import { ceilingFor, fitToBudget } from './budget.js';

type P = { id: string; category_code: string; amount: number };
const p = (id: string, category_code: string, amount: number): P => ({ id, category_code, amount });

const options = (items: P[]) => {
  const map = new Map<string, P[]>();
  for (const item of items) {
    map.set(item.category_code, [...(map.get(item.category_code) ?? []), item]);
  }
  return map;
};

const CATEGORIES = ['cleansers', 'exfoliants', 'serums', 'moisturizers', 'sunscreens'];

describe('ceilingFor', () => {
  it('maps the questionnaire budget to a monthly ceiling', () => {
    expect(ceilingFor('under_20')).toBe(20);
    expect(ceilingFor('20_50')).toBe(50);
    expect(ceilingFor('50_100')).toBe(100);
    expect(ceilingFor('100_plus')).toBeNull();
    expect(ceilingFor('no_budget')).toBeNull();
    expect(ceilingFor(null)).toBeNull();
  });
});

describe('fitToBudget', () => {
  it('keeps the best of each category when it already fits', () => {
    const fit = fitToBudget(options([p('c1', 'cleansers', 15), p('m1', 'moisturizers', 20)]), CATEGORIES, 50);
    expect(fit.picks.map((x) => x.id)).toEqual(['c1', 'm1']);
    expect(fit).toMatchObject({ total: 35, over: false, dropped: [] });
  });

  it('keeps the best of each category when there is no budget', () => {
    const fit = fitToBudget(options([p('c1', 'cleansers', 80), p('c2', 'cleansers', 5)]), CATEGORIES, null);
    expect(fit.picks.map((x) => x.id)).toEqual(['c1']);
    expect(fit.over).toBe(false);
  });

  it('swaps to cheaper options where that saves the most for the least fit given up', () => {
    const fit = fitToBudget(
      options([
        p('c1', 'cleansers', 20), p('c2', 'cleansers', 18),
        p('m1', 'moisturizers', 40), p('m2', 'moisturizers', 22),
      ]),
      CATEGORIES,
      50,
    );
    // Total 60: swapping the moisturiser saves 18 for one place, the cleanser only 2.
    expect(fit.picks.map((x) => x.id)).toEqual(['c1', 'm2']);
    expect(fit).toMatchObject({ total: 42, over: false });
  });

  it('drops the exfoliant, then the serum, before ever dropping an essential step', () => {
    const fit = fitToBudget(
      options([p('c1', 'cleansers', 8), p('e1', 'exfoliants', 9), p('s1', 'serums', 9), p('m1', 'moisturizers', 8)]),
      CATEGORIES,
      20,
    );
    expect(fit.picks.map((x) => x.id)).toEqual(['c1', 'm1']);
    expect(fit.dropped).toEqual(['exfoliants', 'serums']);
    expect(fit).toMatchObject({ total: 16, over: false });
  });

  it('says so when even the cheapest essentials cost more than the budget', () => {
    const fit = fitToBudget(options([p('c1', 'cleansers', 15), p('u1', 'sunscreens', 30)]), CATEGORIES, 20);
    expect(fit.picks.map((x) => x.id)).toEqual(['c1', 'u1']);
    expect(fit).toMatchObject({ total: 45, over: true });
  });

  it('counts cents exactly', () => {
    const fit = fitToBudget(options([p('c1', 'cleansers', 10.1), p('m1', 'moisturizers', 9.9)]), CATEGORIES, 20);
    expect(fit).toMatchObject({ total: 20, over: false });
  });
});
