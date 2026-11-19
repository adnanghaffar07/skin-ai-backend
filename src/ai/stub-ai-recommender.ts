import { parseAiResponse } from './ai-response.js';
import { AiRecommender, type AiResult } from './ai-recommender.js';
import { AI_SCHEMA_VERSION, type AiRecommendRequest } from './ai.types.js';

/**
 * A stand-in for the AI service, for development and tests before the real one exists. It answers in exactly the
 * contract's shape, so everything after it (checking, saving, pricing, routines) runs for real.
 * Every product is marked as a test product and links to example.com; env validation refuses this mode in production.
 */

interface StubItem {
  id: string;
  name: string;
  category: string;
  price: string;
  compare?: string;
  concerns: string[];
  ingredients: string[] | null;
  in_stock?: boolean;
  reason: string;
}

const ITEMS: StubItem[] = [
  { id: 'TEST-CL-01', name: 'Hydrating Cream Cleanser (test)', category: 'cleansers', price: '15.99', concerns: ['dryness_dehydration', 'redness_sensitivity'], ingredients: ['Aqua', 'Glycerin', 'Ceramide NP', 'Hyaluronic Acid'], reason: 'A gentle, fragrance-free cleanser for dry or easily irritated skin.' },
  { id: 'TEST-CL-02', name: 'Clarifying Gel Cleanser (test)', category: 'cleansers', price: '12.49', concerns: ['acne_breakouts'], ingredients: ['Aqua', 'Salicylic Acid', 'Glycerin', 'Parfum'], reason: 'Contains salicylic acid, often used for breakout-prone skin.' },
  { id: 'TEST-SE-01', name: 'Niacinamide 10% Serum (test)', category: 'serums', price: '9.90', concerns: ['acne_breakouts', 'uneven_texture', 'dark_spots'], ingredients: ['Aqua', 'Niacinamide', 'Zinc PCA'], reason: 'Niacinamide is widely used for uneven tone and texture.' },
  { id: 'TEST-SE-02', name: 'Hyaluronic Hydration Serum (test)', category: 'serums', price: '24.00', compare: '29.00', concerns: ['dryness_dehydration', 'fine_lines'], ingredients: ['Aqua', 'Sodium Hyaluronate', 'Panthenol'], reason: 'Draws in moisture for skin that feels tight or dry.' },
  { id: 'TEST-SE-03', name: 'Retinol Night Serum (test)', category: 'serums', price: '38.00', concerns: ['fine_lines', 'uneven_texture'], ingredients: ['Aqua', 'Squalane', 'Retinol'], reason: 'A retinol serum for fine lines; start slowly.' },
  { id: 'TEST-MO-01', name: 'Barrier Repair Moisturizer (test)', category: 'moisturizers', price: '18.75', concerns: ['dryness_dehydration', 'redness_sensitivity'], ingredients: ['Aqua', 'Glycerin', 'Ceramide NP', 'Cholesterol'], reason: 'Supports a comfortable, well-moisturised skin barrier.' },
  { id: 'TEST-MO-02', name: 'Oil-Free Gel Moisturizer (test)', category: 'moisturizers', price: '21.00', concerns: ['acne_breakouts'], ingredients: null, reason: 'A light gel texture for oily or combination skin.' },
  { id: 'TEST-SU-01', name: 'Mineral Sunscreen SPF 50 (test)', category: 'sunscreens', price: '100.00', concerns: ['dark_spots', 'fine_lines', 'redness_sensitivity'], ingredients: ['Zinc Oxide', 'Titanium Dioxide', 'Glycerin'], reason: 'Daily broad-spectrum protection helps keep dark spots from darkening.' },
  { id: 'TEST-EX-01', name: 'Gentle AHA Exfoliant (test)', category: 'exfoliants', price: '27.50', concerns: ['uneven_texture', 'dark_spots'], ingredients: ['Aqua', 'Lactic Acid', 'Lavandula Angustifolia Oil'], in_stock: false, reason: 'A mild acid exfoliant for rough texture, once or twice a week.' },
];

export class StubAiRecommender extends AiRecommender {
  readonly provider = 'stub' as const;

  constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  recommend(request: AiRecommendRequest): Promise<AiResult> {
    const started = Date.now();
    const at = this.now();
    const wanted = new Set(request.profile.concerns);
    const products = ITEMS.filter((item) => request.limits.categories.includes(item.category))
      .map((item, index) => ({ item, index, fit: item.concerns.filter((concern) => wanted.has(concern)).length }))
      .sort((a, b) => b.fit - a.fit || a.index - b.index)
      .slice(0, request.limits.max_products)
      .map(({ item }) => ({
        external_id: item.id,
        retailer: { name: 'Example Store (test)', domain: 'example.com' },
        url: `https://example.com/products/${item.id.toLowerCase()}`,
        name: item.name,
        brand: 'Clara Test Brand',
        category: item.category,
        price: { amount: item.price, currency: request.currency },
        compare_at_price: item.compare ? { amount: item.compare, currency: request.currency } : null,
        in_stock: item.in_stock ?? true,
        checked_at: at.toISOString(),
        image_url: null,
        ingredients: item.ingredients,
        description: `${item.name}. A test product from the stand-in AI service.`,
        how_to_use: 'Test product: follow the directions on the pack.',
        cautions: 'Test product. Patch test before first use.',
        concern_codes: item.concerns,
        reason: item.reason,
        reason_codes: item.concerns.filter((concern) => wanted.has(concern)).map((concern) => `concern:${concern}`),
      }));
    const body = {
      schema_version: AI_SCHEMA_VERSION,
      model_version: 'stub-1',
      confidence: 'medium',
      summary: 'Test picks from the stand-in AI service.',
      limitations: ['These are test products from the stand-in AI service, not real store listings.'],
      products,
    };
    return Promise.resolve({ ...parseAiResponse(body, request.currency, at), latencyMs: Date.now() - started });
  }
}
