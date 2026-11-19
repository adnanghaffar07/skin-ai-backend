import { toCents } from '../pricing/pricing.js';
import {
  AI_CATEGORIES,
  type AiCategory,
  type AiConfidence,
  type AiProduct,
  type AiRecommendResponse,
  type DroppedProduct,
} from './ai.types.js';

/**
 * Checks an AI service response against the v1 contract. Whatever the service sends is treated as untrusted: a product
 * that breaks a rule is dropped (and reported), the rest are kept. Throws only when the response as a whole is unusable.
 */

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiResponseError';
  }
}

/** Older than this, a store price is treated as stale. */
export const STALE_PRICE_MS = 24 * 60 * 60 * 1000;
const MAX_PRODUCTS = 50;
const MAX_TEXT = 2000;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Trimmed text up to `max` characters, or null for anything that is not a non-empty string. */
function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const strings = (value: unknown, max = 200): string[] =>
  Array.isArray(value) ? value.map((item) => text(item, max)).filter((item): item is string => !!item) : [];

function httpsUrl(value: unknown): string | null {
  const url = text(value, 2048);
  if (!url) {
    return null;
  }
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** "www.Target.com" -> "target.com"; null unless it looks like a domain. */
function domain(value: unknown): string | null {
  const raw = text(value, 255)?.toLowerCase().replace(/^www\./, '');
  return raw && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(raw) ? raw : null;
}

function money(value: unknown, currency: string): { amount: string; currency: string } | null {
  if (!isObject(value) || value.currency !== currency) {
    return null;
  }
  const amount = typeof value.amount === 'number' ? value.amount.toFixed(2) : text(value.amount, 20);
  try {
    return amount !== null ? { amount: (toCents(amount) / 100).toFixed(2), currency } : null;
  } catch {
    return null;
  }
}

function product(raw: unknown, currency: string, now: Date): AiProduct | string {
  if (!isObject(raw)) {
    return 'not an object';
  }
  const externalId = text(raw.external_id, 255);
  const retailer = isObject(raw.retailer) ? raw.retailer : {};
  const retailerName = text(retailer.name, 120);
  const retailerDomain = domain(retailer.domain);
  const url = httpsUrl(raw.url);
  const name = text(raw.name, 160);
  const brand = text(raw.brand, 160);
  const category = raw.category;
  const price = money(raw.price, currency);
  const checkedAt = typeof raw.checked_at === 'string' ? new Date(raw.checked_at) : null;

  if (!externalId) return 'missing external_id';
  if (!retailerName || !retailerDomain) return 'missing or invalid retailer';
  if (!url) return 'url must be https';
  if (!name || !brand) return 'missing name or brand';
  if (!AI_CATEGORIES.includes(category as AiCategory)) return `unknown category ${String(category)}`;
  if (!price) return `price missing or not in ${currency}`;
  if (typeof raw.in_stock !== 'boolean') return 'missing in_stock';
  if (!checkedAt || Number.isNaN(checkedAt.getTime())) return 'missing checked_at';
  if (checkedAt.getTime() > now.getTime() + 5 * 60 * 1000) return 'checked_at is in the future';
  if (now.getTime() - checkedAt.getTime() > STALE_PRICE_MS) return 'price is stale';

  const ingredients = raw.ingredients === null || raw.ingredients === undefined ? null : strings(raw.ingredients, 160);
  return {
    external_id: externalId,
    retailer: { name: retailerName, domain: retailerDomain },
    url,
    name,
    brand,
    category: category as AiCategory,
    price,
    compare_at_price: money(raw.compare_at_price, currency),
    in_stock: raw.in_stock,
    checked_at: checkedAt.toISOString(),
    image_url: httpsUrl(raw.image_url),
    // An empty list says nothing about the product, so it counts as unknown.
    ingredients: ingredients && ingredients.length > 0 ? ingredients : null,
    description: text(raw.description),
    how_to_use: text(raw.how_to_use),
    cautions: text(raw.cautions),
    concern_codes: strings(raw.concern_codes, 64),
    reason: text(raw.reason, 300),
    reason_codes: strings(raw.reason_codes, 64),
  };
}

const CONFIDENCE: AiConfidence[] = ['high', 'medium', 'low'];

export function parseAiResponse(
  body: unknown,
  currency: string,
  now: Date = new Date(),
): { response: AiRecommendResponse; dropped: DroppedProduct[] } {
  if (!isObject(body)) {
    throw new AiResponseError('Response is not a JSON object.');
  }
  const schemaVersion = text(body.schema_version, 16);
  if (!schemaVersion || !schemaVersion.startsWith('1.')) {
    throw new AiResponseError(`Unsupported schema_version ${String(body.schema_version)}.`);
  }
  if (!Array.isArray(body.products)) {
    throw new AiResponseError('products must be a list.');
  }
  const dropped: DroppedProduct[] = [];
  const kept: AiProduct[] = [];
  const seen = new Set<string>();
  body.products.slice(0, MAX_PRODUCTS).forEach((raw, index) => {
    const result = product(raw, currency, now);
    const id = isObject(raw) ? text(raw.external_id, 255) : null;
    if (typeof result === 'string') {
      dropped.push({ index, external_id: id, reason: result });
      return;
    }
    const key = `${result.retailer.domain}|${result.external_id}`;
    if (seen.has(key)) {
      dropped.push({ index, external_id: id, reason: 'duplicate' });
      return;
    }
    seen.add(key);
    kept.push(result);
  });
  return {
    response: {
      schema_version: schemaVersion,
      model_version: text(body.model_version, 64),
      confidence: CONFIDENCE.includes(body.confidence as AiConfidence) ? (body.confidence as AiConfidence) : 'low',
      summary: text(body.summary, 300),
      limitations: strings(body.limitations, 300).slice(0, 10),
      products: kept,
    },
    dropped,
  };
}
