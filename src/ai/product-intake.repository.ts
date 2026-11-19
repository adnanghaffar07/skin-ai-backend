import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import { sellingPrice } from '../pricing/pricing.js';
import type { AiProduct } from './ai.types.js';
import { restrictionCodesFor, restrictionCodesForAll } from './ingredient-restrictions.js';

/** A product the AI found, as saved: Clara's own ids and price. */
export interface SavedProduct {
  /** `${retailer.domain}|${external_id}`, the key the AI product is known by. */
  key: string;
  product_id: string;
  variant_id: string;
  name: string;
  brand: string;
  category_code: string;
  /** Clara's price (store price plus markup), decimal string. */
  amount: string;
  currency_code: string;
  in_stock: boolean;
  /** Null when the ingredients are not known. */
  restriction_codes: string[] | null;
}

export const productKey = (product: Pick<AiProduct, 'retailer' | 'external_id'>) => `${product.retailer.domain}|${product.external_id}`;

const hash = (value: string, length: number) => createHash('sha256').update(value).digest('hex').slice(0, length);

/** "Clara Test Brand" -> "clara-test-brand" */
export function slugify(value: string, max: number): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, max).replace(/-+$/, '') || 'item';
}

/** Words the rule-based ranking and catalogue search recognise, for each questionnaire concern. */
const CONCERN_WORDS: Record<string, string> = {
  acne_breakouts: 'acne and breakouts',
  dark_spots: 'dark spots and uneven tone',
  dryness_dehydration: 'dry, dehydrated skin',
  fine_lines: 'fine lines and wrinkles',
  redness_sensitivity: 'redness and sensitive skin',
  uneven_texture: 'rough, uneven texture',
};

export function suitableFor(concernCodes: string[]): string | null {
  const words = concernCodes.map((code) => CONCERN_WORDS[code]).filter(Boolean);
  return words.length ? `Suitable for ${words.join('; ')}.` : null;
}

/** Stable identifiers for a found product: the same store product always maps to the same row. */
export function identifiersOf(product: Pick<AiProduct, 'retailer' | 'external_id'>) {
  const digest = hash(productKey(product), 24);
  return {
    slug: `ai-${slugify(product.retailer.domain, 40)}-${digest}`,
    sku: `AI-${digest.toUpperCase()}`,
  };
}

@Injectable()
export class ProductIntakeRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Saves (or updates) every product in one transaction and returns them with Clara's ids and prices. */
  save(products: AiProduct[], market: string, markupBp: number, source: 'ai' | 'stub'): Promise<SavedProduct[]> {
    return this.database.transaction(async (db) => {
      const saved: SavedProduct[] = [];
      for (const product of products) {
        saved.push(await this.saveOne(db, product, market, markupBp, source));
      }
      return saved;
    });
  }

  private async saveOne(db: Queryable, product: AiProduct, market: string, markupBp: number, source: 'ai' | 'stub'): Promise<SavedProduct> {
    const { slug, sku } = identifiersOf(product);
    const brandSlug = slugify(product.brand, 120);
    await db.query(`insert into public.brands (name, slug) values ($1, $2) on conflict (slug) do nothing`, [product.brand, brandSlug]);
    const [{ id: brandId }] = await db.query<{ id: string }>(`select id from public.brands where slug = $1`, [brandSlug]);

    const [{ id: productId }] = await db.query<{ id: string }>(
      `insert into public.products
         (brand_id, category_code, slug, name, description, benefits, how_to_use, suitable_for, cautions, status)
       values ($1, $2, $3, $4, $5, $5, $6, $7, $8, 'active')
       on conflict (slug) do update set
         brand_id = excluded.brand_id, category_code = excluded.category_code, name = excluded.name,
         description = excluded.description, benefits = excluded.benefits, how_to_use = excluded.how_to_use,
         suitable_for = excluded.suitable_for, cautions = excluded.cautions, status = 'active', deleted_at = null
       returning id`,
      [brandId, product.category, slug, product.name, product.description, product.how_to_use, suitableFor(product.concern_codes), product.cautions],
    );

    const [{ id: variantId }] = await db.query<{ id: string }>(
      `insert into public.product_variants (product_id, sku, name, status) values ($1, $2, 'Standard', 'active')
       on conflict (sku) do update set status = 'active'
       returning id`,
      [productId, sku],
    );

    await db.query(
      `insert into public.product_market_availability (product_id, market_code, badge_code, is_available)
       values ($1, $2, null, $3)
       on conflict (product_id, market_code) do update set is_available = excluded.is_available`,
      [productId, market, product.in_stock],
    );

    const amount = sellingPrice(product.price.amount, markupBp);
    const compareAt = product.compare_at_price ? sellingPrice(product.compare_at_price.amount, markupBp) : null;
    await this.setPrice(db, variantId, market, product.price.currency, amount, compareAt);

    await db.query(`delete from public.product_media where product_id = $1`, [productId]);
    if (product.image_url) {
      await db.query(`insert into public.product_media (product_id, url, alt_text, position) values ($1, $2, $3, 0)`, [productId, product.image_url, product.name]);
    }

    let restrictions: string[] | null = null;
    if (product.ingredients) {
      await this.setIngredients(db, productId, product.ingredients);
      restrictions = restrictionCodesForAll(product.ingredients);
    } else {
      // Unknown this time: keep what an earlier response said, if anything.
      const known = await db.query<{ code: string | null; count: number }>(
        `select r.restriction_code as code, count(*) over ()::int as count
         from public.product_ingredients pi
         left join public.ingredient_restrictions r on r.ingredient_id = pi.ingredient_id
         where pi.product_id = $1`,
        [productId],
      );
      restrictions = known.length ? [...new Set(known.map((row) => row.code).filter((code): code is string => !!code))].sort() : null;
    }

    await db.query(
      `insert into public.product_offers
         (product_id, market_code, retailer_name, retailer_domain, external_id, url, store_currency_code,
          store_amount, store_compare_at_amount, markup_bp, in_stock, checked_at, source)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (retailer_domain, external_id, market_code) do update set
         product_id = excluded.product_id, retailer_name = excluded.retailer_name, url = excluded.url,
         store_currency_code = excluded.store_currency_code, store_amount = excluded.store_amount,
         store_compare_at_amount = excluded.store_compare_at_amount, markup_bp = excluded.markup_bp,
         in_stock = excluded.in_stock, checked_at = excluded.checked_at, source = excluded.source`,
      [
        productId, market, product.retailer.name, product.retailer.domain, product.external_id, product.url,
        product.price.currency, product.price.amount, product.compare_at_price?.amount ?? null, markupBp,
        product.in_stock, product.checked_at, source,
      ],
    );

    return {
      key: productKey(product),
      product_id: productId,
      variant_id: variantId,
      name: product.name,
      brand: product.brand,
      category_code: product.category,
      amount,
      currency_code: product.price.currency,
      in_stock: product.in_stock,
      restriction_codes: restrictions,
    };
  }

  /** Closes the current price and starts a new one only when it changed, so price history is kept. */
  private async setPrice(db: Queryable, variantId: string, market: string, currency: string, amount: string, compareAt: string | null) {
    const current = await db.query<{ amount: string; compare_at_amount: string | null; currency_code: string }>(
      `select amount::text, compare_at_amount::text, currency_code from public.product_prices
       where variant_id = $1 and market_code = $2 and effective_to is null
       order by effective_from desc limit 1`,
      [variantId, market],
    );
    const same = current[0] && Number(current[0].amount) === Number(amount) && current[0].currency_code === currency &&
      (current[0].compare_at_amount === null ? compareAt === null : compareAt !== null && Number(current[0].compare_at_amount) === Number(compareAt));
    if (same) {
      return;
    }
    await db.query(`update public.product_prices set effective_to = now() where variant_id = $1 and market_code = $2 and effective_to is null`, [variantId, market]);
    await db.query(
      `insert into public.product_prices (variant_id, market_code, currency_code, amount, compare_at_amount) values ($1, $2, $3, $4, $5)`,
      [variantId, market, currency, amount, compareAt],
    );
  }

  /** Replaces the product's ingredient list, adding unknown ingredients and their avoid-list codes on the way. */
  private async setIngredients(db: Queryable, productId: string, ingredients: string[]) {
    const names = [...new Set(ingredients.map((name) => name.slice(0, 160)))];
    const slugs = names.map((name) => `${slugify(name, 100)}-${hash(name.toLowerCase(), 8)}`);
    await db.query(
      `insert into public.ingredients (inci_name, display_name, slug)
       select name, name, slug from unnest($1::text[], $2::text[]) as t(name, slug)
       on conflict do nothing`,
      [names, slugs],
    );
    const rows = await db.query<{ id: string; inci_name: string }>(`select id, inci_name from public.ingredients where inci_name = any($1::text[])`, [names]);
    const idOf = new Map(rows.map((row) => [row.inci_name, row.id]));

    const pairs = names.flatMap((name) => restrictionCodesFor(name).map((code) => [idOf.get(name), code] as const)).filter(([id]) => !!id);
    if (pairs.length) {
      await db.query(
        `insert into public.ingredient_restrictions (ingredient_id, restriction_code)
         select id, code from unnest($1::uuid[], $2::text[]) as t(id, code)
         on conflict do nothing`,
        [pairs.map(([id]) => id), pairs.map(([, code]) => code)],
      );
    }

    await db.query(`delete from public.product_ingredients where product_id = $1`, [productId]);
    const ids = names.map((name) => idOf.get(name)).filter((id): id is string => !!id);
    await db.query(
      `insert into public.product_ingredients (product_id, ingredient_id, position)
       select $1, id, ordinality - 1 from unnest($2::uuid[]) with ordinality as t(id, ordinality)
       on conflict do nothing`,
      [productId, ids],
    );
  }
}
