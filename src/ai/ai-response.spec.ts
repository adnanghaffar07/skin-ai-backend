import { describe, expect, it } from 'vitest';
import { parseAiResponse } from './ai-response.js';
import { restrictionCodesFor, restrictionCodesForAll } from './ingredient-restrictions.js';

const now = new Date('2026-11-25T10:00:00Z');

const item = (over: Record<string, unknown> = {}) => ({
  external_id: 'A-1',
  retailer: { name: 'Target', domain: 'www.Target.com' },
  url: 'https://www.target.com/p/a-1',
  name: 'Hydrating Cleanser',
  brand: 'CeraVe',
  category: 'cleansers',
  price: { amount: '15.99', currency: 'USD' },
  compare_at_price: null,
  in_stock: true,
  checked_at: '2026-11-25T09:00:00Z',
  image_url: 'https://img.example.com/a.jpg',
  ingredients: ['Aqua', 'Glycerin'],
  reason: 'Made for dry skin.',
  reason_codes: ['concern:dryness_dehydration'],
  ...over,
});

const body = (products: unknown[], over: Record<string, unknown> = {}) => ({ schema_version: '1.0', model_version: 'm1', confidence: 'high', summary: 'S', limitations: ['L'], products, ...over });

describe('parseAiResponse', () => {
  it('keeps a product that follows the contract, normalised', () => {
    const { response, dropped } = parseAiResponse(body([item()]), 'USD', now);
    expect(dropped).toEqual([]);
    expect(response).toMatchObject({ schema_version: '1.0', model_version: 'm1', confidence: 'high', summary: 'S', limitations: ['L'] });
    expect(response.products[0]).toMatchObject({
      external_id: 'A-1',
      retailer: { name: 'Target', domain: 'target.com' },
      price: { amount: '15.99', currency: 'USD' },
      checked_at: '2026-11-25T09:00:00.000Z',
      ingredients: ['Aqua', 'Glycerin'],
    });
  });

  it.each([
    ['a plain-http link', { url: 'http://target.com/p' }, 'url must be https'],
    ['another currency', { price: { amount: '10.00', currency: 'EUR' } }, 'price missing or not in USD'],
    ['a made-up category', { category: 'masks' }, 'unknown category masks'],
    ['a stale price', { checked_at: '2026-11-23T09:00:00Z' }, 'price is stale'],
    ['a future check time', { checked_at: '2026-11-26T09:00:00Z' }, 'checked_at is in the future'],
    ['a negative price', { price: { amount: '-1', currency: 'USD' } }, 'price missing or not in USD'],
    ['no stock flag', { in_stock: undefined }, 'missing in_stock'],
    ['no store', { retailer: { name: 'X', domain: 'not a domain' } }, 'missing or invalid retailer'],
  ])('drops a product with %s', (_label, over, reason) => {
    const { response, dropped } = parseAiResponse(body([item(over)]), 'USD', now);
    expect(response.products).toEqual([]);
    expect(dropped).toEqual([{ index: 0, external_id: 'A-1', reason }]);
  });

  it('drops the second copy of the same store product', () => {
    const { response, dropped } = parseAiResponse(body([item(), item({ name: 'Copy' })]), 'USD', now);
    expect(response.products).toHaveLength(1);
    expect(dropped[0].reason).toBe('duplicate');
  });

  it('treats an empty ingredient list as unknown, and drops a non-https image', () => {
    const { response } = parseAiResponse(body([item({ ingredients: [], image_url: 'http://x.com/a.jpg' })]), 'USD', now);
    expect(response.products[0].ingredients).toBeNull();
    expect(response.products[0].image_url).toBeNull();
  });

  it('accepts a numeric price', () => {
    const { response } = parseAiResponse(body([item({ price: { amount: 100, currency: 'USD' } })]), 'USD', now);
    expect(response.products[0].price.amount).toBe('100.00');
  });

  it('assumes low confidence when none is given', () => {
    expect(parseAiResponse(body([], { confidence: 'certain' }), 'USD', now).response.confidence).toBe('low');
  });

  it('rejects a response that is not usable at all', () => {
    expect(() => parseAiResponse('nope', 'USD', now)).toThrow(/not a JSON object/);
    expect(() => parseAiResponse(body([], { schema_version: '2.0' }), 'USD', now)).toThrow(/schema_version/);
    expect(() => parseAiResponse({ schema_version: '1.0', products: {} }, 'USD', now)).toThrow(/products/);
  });
});

describe('restrictionCodesFor', () => {
  it('finds fragrance, retinoids and essential oils by name', () => {
    expect(restrictionCodesFor('Parfum (Fragrance)')).toEqual(['fragrance']);
    expect(restrictionCodesFor('Retinyl Palmitate')).toEqual(['retinol']);
    expect(restrictionCodesFor('Lavandula Angustifolia (Lavender) Oil')).toEqual(['essential_oils']);
    expect(restrictionCodesFor('Melaleuca Alternifolia (Tea Tree) Leaf Oil')).toEqual(['essential_oils']);
  });

  it('leaves ordinary ingredients and retinol alternatives alone', () => {
    expect(restrictionCodesFor('Glycerin')).toEqual([]);
    expect(restrictionCodesFor('Bakuchiol')).toEqual([]);
    expect(restrictionCodesForAll(['Aqua', 'Parfum', 'Retinol', 'Parfum'])).toEqual(['fragrance', 'retinol']);
  });
});
