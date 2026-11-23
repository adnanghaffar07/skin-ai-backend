/** The AI service contract, v1 (docs/AI_SERVICE_CONTRACT.md). */

export const AI_SCHEMA_VERSION = '1.1';

export const AI_CATEGORIES = ['cleansers', 'serums', 'moisturizers', 'sunscreens', 'exfoliants'] as const;
export type AiCategory = (typeof AI_CATEGORIES)[number];

export interface AiProfile {
  age_range: string | null;
  skin_type: string | null;
  concerns: string[];
  sensitivity_level: string | null;
  primary_goal: string | null;
  goal_codes: string[];
  current_routine: string | null;
  reaction_history: string | null;
  reaction_details: string | null;
  avoid_codes: string[];
  monthly_budget: string | null;
  product_interests: string[];
}

/** What the phone read from a face scan (contract section 6, option 1). The photo itself never leaves the phone. */
export interface AiScan {
  source: 'on_device';
  captured_at: string;
  findings: { feature: string; level: string; score: number | null }[];
  photo_issues: string[];
}

/** The scan as the AI service reads it (handover v1.1): one level per feature, sent only when all four were read. */
export type AiScanLevels = Record<'redness' | 'shine' | 'darkCircles' | 'blemishes', string>;

export interface AiRecommendRequest {
  schema_version: string;
  request_id: string;
  market: string;
  currency: string;
  profile: AiProfile;
  /** The newest face scan's levels when the app sent all four, otherwise null (questionnaire only). */
  scan: AiScanLevels | null;
  limits: { max_products: number; categories: string[] };
}

/** A product as Clara keeps it after checking the response. */
export interface AiProduct {
  external_id: string;
  retailer: { name: string; domain: string };
  url: string;
  name: string;
  brand: string;
  category: AiCategory;
  price: { amount: string; currency: string };
  compare_at_price: { amount: string; currency: string } | null;
  in_stock: boolean;
  checked_at: string;
  image_url: string | null;
  ingredients: string[] | null;
  description: string | null;
  how_to_use: string | null;
  cautions: string | null;
  concern_codes: string[];
  reason: string | null;
  reason_codes: string[];
  /** Morning/evening and how often (contract 4b); null when the AI did not say. */
  routine: AiRoutine | null;
  /** Cautions for this person (contract 4b), e.g. "Contains fragrance; you said fragrance stings." */
  person_cautions: string[];
}

export const AI_FREQUENCIES = ['daily', 'alternate_days', '2_3_per_week', 'weekly'] as const;
export type AiFrequency = (typeof AI_FREQUENCIES)[number];
export interface AiRoutine {
  periods: ('morning' | 'evening')[];
  frequency: AiFrequency | null;
}

/** Contract 4c: when true, Clara shows advice to see a professional above the products. */
export interface AiSafety {
  refer_to_professional: boolean;
  reason: string | null;
}

export type AiConfidence = 'high' | 'medium' | 'low';

export interface AiRecommendResponse {
  schema_version: string;
  model_version: string | null;
  confidence: AiConfidence;
  summary: string | null;
  limitations: string[];
  products: AiProduct[];
  safety: AiSafety;
}

/** A product the response contained but Clara did not keep, and why. */
export interface DroppedProduct {
  index: number;
  external_id: string | null;
  reason: string;
}
