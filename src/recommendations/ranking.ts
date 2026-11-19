import { ceilingFor, fitToBudget } from './budget.js';

export const RULE_VERSION = '2026-11-11';

export const CORE_CATEGORIES = [
  'cleansers',
  'moisturizers',
  'serums',
  'sunscreens',
] as const;
export const CATEGORY_ORDER = [
  'cleansers',
  'exfoliants',
  'serums',
  'moisturizers',
  'sunscreens',
] as const;

export interface Candidate {
  id: string;
  variant_id: string;
  name: string;
  brand: string;
  category_code: string;
  currency_code: string;
  amount: number;
  text: string;
  ingredient_count: number;
  restriction_codes: string[];
}

export interface ProfileInput {
  skin_type: string | null;
  concerns: string[];
  primary_goal: string | null;
  goal_codes: string[];
  avoid_codes: string[];
  budget_band: string | null;
  categories: string[];
}

export interface RankedProduct extends Candidate {
  rank: number;
  score: number;
  reason_codes: string[];
}

export interface Plan {
  /** The picks within the person's monthly budget (all of the best picks when there is no budget). */
  products: RankedProduct[];
  /** The best pick of each category regardless of price. Shown under the budget picks, marked as above budget. */
  best: RankedProduct[];
  /** The monthly ceiling the picks were fitted to; null when the person set no budget. */
  budget_ceiling: number | null;
  limitations: string[];
}

// Products carry no structured concern tags yet, so fit is judged by matching
// words in the product name, benefits and suitable-for text.
export const CONCERN_KEYWORDS: Record<string, string[]> = {
  acne_breakouts: ['acne', 'breakout', 'blemish', 'pore'],
  dark_spots: ['dark spot', 'pigment', 'brighten', 'even tone', 'discolor'],
  dryness_dehydration: ['dry', 'hydrat', 'moisture'],
  fine_lines: ['fine line', 'wrinkle', 'firming', 'anti-aging'],
  redness_sensitivity: ['redness', 'sensitive', 'calm', 'soothe'],
  uneven_texture: ['texture', 'smooth', 'exfoliat', 'rough'],
};

const GOAL_TO_CONCERN: Record<string, string> = {
  reduce_breakouts: 'acne_breakouts',
  improve_hydration: 'dryness_dehydration',
  improve_dark_spots: 'dark_spots',
  reduce_fine_lines: 'fine_lines',
};

const SKIN_TYPE_KEYWORDS: Record<string, string[]> = {
  oily: ['oily'],
  dry: ['dry'],
  combination: ['combination'],
  normal: ['normal', 'all skin'],
};

// Per-product ideal price is a quarter of the monthly band ceiling.
const BUDGET_IDEAL_PRICE: Record<string, number> = {
  under_20: 5,
  '20_50': 12.5,
  '50_100': 25,
};

/** Limitations explaining how the budget shaped the plan. */
export function budgetLimitations(fit: { over: boolean; dropped: string[] }): string[] {
  return [...(fit.over ? ['over_budget'] : []), ...fit.dropped.map((category) => `budget_left_out_${category}`)];
}

/** Numbers each list 1, 2, 3... in order. */
export const ranked = <T extends RankedProduct>(items: T[]): T[] => items.map((item, index) => ({ ...item, rank: index + 1 }));

const matches = (text: string, words: string[]): boolean =>
  words.some((word) => text.includes(word));

export function wantedCategories(selected: string[]): string[] {
  const real = selected.filter((c) => c !== 'recommend_for_me');
  return real.length > 0 ? real : [...CORE_CATEGORIES];
}

export function isEligible(
  product: Candidate,
  avoidCodes: string[],
): 'ok' | 'restricted' | 'ingredient_data_missing' {
  if (avoidCodes.length === 0) {
    return 'ok';
  }
  if (product.ingredient_count === 0) {
    return 'ingredient_data_missing';
  }
  return product.restriction_codes.some((code) => avoidCodes.includes(code))
    ? 'restricted'
    : 'ok';
}

function score(product: Candidate, profile: ProfileInput): {
  score: number;
  reasons: string[];
} {
  const text = product.text.toLowerCase();
  const reasons: string[] = [`category:${product.category_code}`];
  let total = 0;
  for (const concern of new Set(profile.concerns)) {
    if (matches(text, CONCERN_KEYWORDS[concern] ?? [])) {
      total += 3;
      reasons.push(`concern:${concern}`);
    }
  }
  const goals = new Set<string>(profile.goal_codes);
  if (profile.primary_goal) {
    goals.add(profile.primary_goal);
  }
  for (const goal of goals) {
    const concern = GOAL_TO_CONCERN[goal] ?? goal;
    if (matches(text, CONCERN_KEYWORDS[concern] ?? [])) {
      total += goal === profile.primary_goal ? 2 : 1;
      reasons.push(`goal:${goal}`);
    }
  }
  const typeWords = SKIN_TYPE_KEYWORDS[profile.skin_type ?? ''];
  if (typeWords && matches(text, typeWords)) {
    total += 1;
    reasons.push(`skin_type:${profile.skin_type}`);
  }
  return { score: total, reasons };
}

function priceDistance(amount: number, band: string | null): number {
  const ideal = band ? BUDGET_IDEAL_PRICE[band] : undefined;
  return ideal === undefined ? 0 : Math.abs(amount - ideal);
}

export function buildPlan(candidates: Candidate[], profile: ProfileInput): Plan {
  const limitations = new Set<string>();
  const wanted = wantedCategories(profile.categories);
  const eligible: RankedProduct[] = [];
  for (const product of candidates) {
    if (!wanted.includes(product.category_code)) {
      continue;
    }
    const verdict = isEligible(product, profile.avoid_codes);
    if (verdict === 'ingredient_data_missing') {
      limitations.add('ingredient_data_missing');
    }
    if (verdict !== 'ok') {
      continue;
    }
    const { score: s, reasons } = score(product, profile);
    eligible.push({ ...product, rank: 0, score: s, reason_codes: reasons });
  }
  eligible.sort(
    (a, b) =>
      b.score - a.score ||
      priceDistance(a.amount, profile.budget_band) -
        priceDistance(b.amount, profile.budget_band) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  const options = new Map<string, RankedProduct[]>();
  for (const product of eligible) {
    options.set(product.category_code, [...(options.get(product.category_code) ?? []), product]);
  }
  const best = ranked(CATEGORY_ORDER.flatMap((category) => options.get(category)?.slice(0, 1) ?? []));
  const ceiling = ceilingFor(profile.budget_band);
  const fit = fitToBudget(options, [...CATEGORY_ORDER], ceiling);
  budgetLimitations(fit).forEach((code) => limitations.add(code));
  for (const category of wanted) {
    if (!options.has(category)) {
      limitations.add(`no_product_for_${category}`);
    }
  }
  return { products: ranked(fit.picks), best, budget_ceiling: ceiling, limitations: [...limitations].sort() };
}
