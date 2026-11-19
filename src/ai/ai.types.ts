/** The AI service contract, v1 (docs/AI_SERVICE_CONTRACT.md). */

export const AI_SCHEMA_VERSION = '1.0';

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

export interface AiRecommendRequest {
  schema_version: string;
  request_id: string;
  market: string;
  currency: string;
  profile: AiProfile;
  /** Always null in v1: see section 6 of the contract. */
  scan: null;
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
}

export type AiConfidence = 'high' | 'medium' | 'low';

export interface AiRecommendResponse {
  schema_version: string;
  model_version: string | null;
  confidence: AiConfidence;
  summary: string | null;
  limitations: string[];
  products: AiProduct[];
}

/** A product the response contained but Clara did not keep, and why. */
export interface DroppedProduct {
  index: number;
  external_id: string | null;
  reason: string;
}
