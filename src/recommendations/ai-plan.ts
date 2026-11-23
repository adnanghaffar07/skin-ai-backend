import { AI_SCHEMA_VERSION, type AiProduct, type AiRecommendRequest, type AiScan, type AiScanLevels } from '../ai/ai.types.js';
import { productKey, type SavedProduct } from '../ai/product-intake.repository.js';
import { ceilingFor, fitToBudget } from './budget.js';
import { budgetLimitations, CATEGORY_ORDER, ranked, wantedCategories, type Plan, type RankedProduct } from './ranking.js';
import type { ProfileContext } from './recommendations.repository.js';

/** How many products to ask the AI service for. */
export const AI_MAX_PRODUCTS = 12;

/** The person's answers as the AI service expects them. No name, email, birth date or ids. */
const SCAN_FEATURES = ['redness', 'shine', 'darkCircles', 'blemishes'];
const SCAN_LEVELS = ['none', 'mild', 'moderate', 'high'];
const PHOTO_ISSUES = /^[a-z][a-z-]{1,30}$/;

/**
 * The scan findings the app sent, checked and cut down to the contract's shape; anything else is dropped. Null when
 * nothing usable was sent, so the AI service treats the plan as questionnaire only.
 */
export function cleanScan(raw: unknown, now: Date = new Date()): AiScan | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const input = raw as Record<string, unknown>;
  const captured = typeof input.captured_at === 'string' ? new Date(input.captured_at) : null;
  if (!captured || Number.isNaN(captured.getTime()) || captured.getTime() > now.getTime() + 5 * 60 * 1000) {
    return null;
  }
  const findings = (Array.isArray(input.findings) ? input.findings : [])
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .filter(f => SCAN_FEATURES.includes(f.feature as string) && SCAN_LEVELS.includes(f.level as string))
    .map(f => ({
      feature: f.feature as string,
      level: f.level as string,
      score: typeof f.score === 'number' && Number.isFinite(f.score) ? Math.max(0, Math.min(100, Math.round(f.score))) : null,
    }));
  const unique = findings.filter((f, i) => findings.findIndex(o => o.feature === f.feature) === i);
  if (!unique.length) {
    return null;
  }
  const issues = (Array.isArray(input.photo_issues) ? input.photo_issues : []).filter(
    (issue): issue is string => typeof issue === 'string' && PHOTO_ISSUES.test(issue),
  );
  return { source: 'on_device', captured_at: captured.toISOString(), findings: unique, photo_issues: [...new Set(issues)].slice(0, 10) };
}

/**
 * The scan in the AI service's shape: { redness, shine, darkCircles, blemishes } with one level each. Null unless all
 * four were read, so a partial scan never reads as "none found" for the missing ones.
 */
export function scanLevels(scan: AiScan | null): AiScanLevels | null {
  if (!scan) {
    return null;
  }
  const level = (feature: string) => scan.findings.find(f => f.feature === feature)?.level;
  const redness = level('redness');
  const shine = level('shine');
  const darkCircles = level('darkCircles');
  const blemishes = level('blemishes');
  return redness && shine && darkCircles && blemishes ? { redness, shine, darkCircles, blemishes } : null;
}

export function toAiRequest(
  profile: ProfileContext,
  market: string,
  currency: string,
  requestId: string,
  scan: AiScan | null = null,
): AiRecommendRequest {
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
    scan: scanLevels(scan),
    limits: { max_products: AI_MAX_PRODUCTS, categories: wantedCategories(profile.categories) },
  };
}

export interface AiPlanProduct extends RankedProduct {
  /** The AI service's "why it's picked" sentence. */
  explanation: string | null;
  /** Morning/evening, how often and cautions, from the AI service; null when it gave none. */
  guidance: PlanGuidance | null;
}

export interface PlanGuidance {
  periods: ('morning' | 'evening')[];
  frequency: string | null;
  cautions: string[];
}

/** The AI's routine advice for a product, with the product's own caution first and the person's after it. */
export function guidanceOf(product: AiProduct): PlanGuidance | null {
  const cautions = [...(product.cautions ? [product.cautions] : []), ...product.person_cautions];
  if (!product.routine && !cautions.length) {
    return null;
  }
  return { periods: product.routine?.periods ?? [], frequency: product.routine?.frequency ?? null, cautions };
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
      guidance: guidanceOf(product),
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
