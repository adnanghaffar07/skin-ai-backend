import { AI_SCHEMA_VERSION, type AiProduct, type AiRecommendRequest } from '../ai/ai.types.js';
import { productKey, type SavedProduct } from '../ai/product-intake.repository.js';
import { ceilingFor, fitToBudget } from './budget.js';
import { budgetLimitations, CATEGORY_ORDER, ranked, wantedCategories, type Plan, type RankedProduct } from './ranking.js';
import type { ProfileContext } from './recommendations.repository.js';

/** How many products to ask the AI service for. */
export const AI_MAX_PRODUCTS = 12;

/** The person's answers as the AI service expects them. No name, email, birth date or ids. */
export function toAiRequest(profile: ProfileContext, market: string, currency: string, requestId: string): AiRecommendRequest {
  return {
    schema_version: AI_SCHEMA_VERSION,
    request_id: requestId,
    market,
    currency,
    profile: {
      age_range: profile.age_range,
      skin_type: profile.skin_type,
      concerns: profile.concerns,
      sensitivity_level: profile.sensitivity_level,
      primary_goal: profile.primary_goal,
      goal_codes: profile.goal_codes,
      current_routine: profile.routine_level,
      reaction_history: profile.reaction_history,
      reaction_details: profile.reaction_details,
      avoid_codes: profile.avoid_codes,
      monthly_budget: profile.budget_band,
      product_interests: profile.categories,
    },
    scan: null,
    limits: { max_products: AI_MAX_PRODUCTS, categories: wantedCategories(profile.categories) },
  };
}

export interface AiPlanProduct extends RankedProduct {
  /** The AI service's "why it's picked" sentence. */
  explanation: string | null;
}

export interface AiPlan extends Plan {
  products: AiPlanProduct[];
  best: AiPlanProduct[];
}

/**
 * The plan from the AI service's picks, in its order, after Clara's own safety rules. Whatever the AI says, a product
 * is left out when it is out of stock, contains something the person avoids, has unknown ingredients while they have an
 * avoid-list, or is a retinoid for someone under 18.
 */
export function planFromAi(found: AiProduct[], saved: SavedProduct[], profile: ProfileContext): AiPlan {
  const byKey = new Map(saved.map((item) => [item.key, item]));
  const limitations = new Set<string>();
  const eligible: AiPlanProduct[] = [];
  for (const product of found) {
    const row = byKey.get(productKey(product));
    if (!row) {
      continue;
    }
    if (!row.in_stock) {
      limitations.add('out_of_stock_removed');
      continue;
    }
    if (profile.avoid_codes.length > 0 && row.restriction_codes === null) {
      limitations.add('ingredient_data_missing');
      continue;
    }
    const restrictions = row.restriction_codes ?? [];
    if (restrictions.some((code) => profile.avoid_codes.includes(code))) {
      limitations.add('avoided_ingredient_removed');
      continue;
    }
    if (profile.age_range === 'under_18' && restrictions.includes('retinol')) {
      limitations.add('under_18_active_removed');
      continue;
    }
    eligible.push({
      id: row.product_id,
      variant_id: row.variant_id,
      name: row.name,
      brand: row.brand,
      category_code: row.category_code,
      currency_code: row.currency_code,
      amount: Number(row.amount),
      text: '',
      ingredient_count: row.restriction_codes === null ? 0 : 1,
      restriction_codes: restrictions,
      rank: eligible.length + 1,
      score: 0,
      reason_codes: ['source:ai', ...product.reason_codes],
      explanation: product.reason,
    });
  }
  for (const category of wantedCategories(profile.categories)) {
    if (!eligible.some((item) => item.category_code === category)) {
      limitations.add(`no_product_for_${category}`);
    }
  }
  // The AI's order is its ranking: each category's list is best first.
  const options = new Map<string, AiPlanProduct[]>();
  for (const product of eligible) {
    options.set(product.category_code, [...(options.get(product.category_code) ?? []), product]);
  }
  const ceiling = ceilingFor(profile.budget_band);
  const fit = fitToBudget(options, [...CATEGORY_ORDER], ceiling);
  budgetLimitations(fit).forEach((code) => limitations.add(code));
  // Within budget: the fitted routine first, then the AI's other picks that cost no more than the monthly budget.
  const inRoutine = new Set(fit.picks.map((item) => item.id));
  const extras = eligible.filter((item) => !inRoutine.has(item.id) && (ceiling === null || item.amount <= ceiling));
  return {
    products: ranked([...fit.picks, ...extras]),
    best: ranked(CATEGORY_ORDER.flatMap((category) => options.get(category)?.slice(0, 1) ?? [])),
    budget_ceiling: ceiling,
    limitations: [...limitations].sort(),
  };
}

/** The first pick of each category, in plan order: the products a routine is built from. */
export function routineProducts(products: RankedProduct[]): RankedProduct[] {
  const seen = new Set<string>();
  return products.filter((item) => !seen.has(item.category_code) && seen.add(item.category_code));
}
