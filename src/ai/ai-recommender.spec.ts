import { describe, expect, it, vi } from 'vitest';
import { HttpAiRecommender } from './ai-recommender.js';
import { identifiersOf, slugify, suitableFor } from './product-intake.repository.js';
import { StubAiRecommender } from './stub-ai-recommender.js';
import type { AiRecommendRequest } from './ai.types.js';

const request: AiRecommendRequest = {
  schema_version: '1.0',
  request_id: 'req-1',
  market: 'US',
  currency: 'USD',
  profile: {
    age_range: 'age_25_34',
    skin_type: 'dry',
    concerns: ['dryness_dehydration'],
    sensitivity_level: null,
    primary_goal: null,
    goal_codes: [],
    current_routine: null,
    reaction_history: null,
    reaction_details: null,
    avoid_codes: [],
    monthly_budget: null,
    product_interests: [],
  },
  scan: null,
  limits: { max_products: 8, categories: ['cleansers', 'serums', 'moisturizers', 'sunscreens'] },
};

const okBody = {
  schema_version: '1.0',
  model_version: 'm1',
  confidence: 'medium',
  products: [
    {
      external_id: 'A-1',
      retailer: { name: 'Target', domain: 'target.com' },
      url: 'https://target.com/p/a-1',
      name: 'Cleanser',
      brand: 'Brand',
      category: 'cleansers',
      price: { amount: '10.00', currency: 'USD' },
      in_stock: true,
      checked_at: new Date().toISOString(),
    },
  ],
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('HttpAiRecommender', () => {
  it('posts the request with the key and parses the answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, okBody));
    const ai = new HttpAiRecommender('https://ai.example.com/', 'secret', 1000, fetchMock);
    const result = await ai.recommend(request);
    expect(result.response.products.map((p) => p.external_id)).toEqual(['A-1']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ai.example.com/v1/recommendations');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret', 'X-Request-Id': 'req-1' });
    expect(JSON.parse(init.body)).toEqual(request);
  });

  it('retries once after a server error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(json(200, okBody));
    const ai = new HttpAiRecommender('https://ai.example.com', 'k', 1000, fetchMock);
    await expect(ai.recommend(request)).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a refused key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, { code: 'UNAUTHORIZED' }));
    const ai = new HttpAiRecommender('https://ai.example.com', 'k', 1000, fetchMock);
    await expect(ai.recommend(request)).rejects.toMatchObject({ code: 'AI_HTTP_401' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable service', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('aborted'));
    const ai = new HttpAiRecommender('https://ai.example.com', 'k', 1000, fetchMock);
    await expect(ai.recommend(request)).rejects.toMatchObject({ code: 'AI_UNREACHABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports an answer that breaks the contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { schema_version: '9.0', products: [] }));
    const ai = new HttpAiRecommender('https://ai.example.com', 'k', 1000, fetchMock);
    await expect(ai.recommend(request)).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
  });

  it('reports a body that is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    const ai = new HttpAiRecommender('https://ai.example.com', 'k', 1000, fetchMock);
    await expect(ai.recommend(request)).rejects.toMatchObject({ code: 'AI_BAD_JSON' });
  });
});

describe('StubAiRecommender', () => {
  it('answers in the contract shape with clearly marked test products', async () => {
    const result = await new StubAiRecommender().recommend(request);
    expect(result.dropped).toEqual([]);
    expect(result.response.products.length).toBeGreaterThan(0);
    for (const product of result.response.products) {
      expect(product.retailer.domain).toBe('example.com');
      expect(product.name).toMatch(/\(test\)$/);
      expect(request.limits.categories).toContain(product.category);
    }
    // The dry-skin cleanser comes before the acne one for a dry-skin profile.
    expect(result.response.products[0].external_id).toBe('TEST-CL-01');
  });
});

describe('product identifiers', () => {
  it('are the same for the same store product, and differ between stores', () => {
    const a = identifiersOf({ retailer: { name: 'T', domain: 'target.com' }, external_id: '1' });
    expect(identifiersOf({ retailer: { name: 'Target', domain: 'target.com' }, external_id: '1' })).toEqual(a);
    expect(identifiersOf({ retailer: { name: 'W', domain: 'walmart.com' }, external_id: '1' })).not.toEqual(a);
    expect(a.slug.length).toBeLessThanOrEqual(120);
    expect(a.sku.length).toBeLessThanOrEqual(64);
  });

  it('slugify keeps letters and digits only', () => {
    expect(slugify('La Roche-Posay™ Toleriane', 120)).toBe('la-roche-posay-toleriane');
    expect(slugify('***', 10)).toBe('item');
  });

  it('describes concerns in words the rule-based ranking recognises', () => {
    expect(suitableFor(['dryness_dehydration', 'unknown'])).toBe('Suitable for dry, dehydrated skin.');
    expect(suitableFor([])).toBeNull();
  });
});
