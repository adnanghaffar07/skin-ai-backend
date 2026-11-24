import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { Cursor } from './catalog-query.js';

export interface ProductRow extends QueryResultRow {
  id: string;
  name: string;
  brand: string;
  category_code: string;
  currency_code: string | null;
  amount: string | null;
  compare_at_amount: string | null;
  rating_avg: string | null;
  rating_count: number | null;
  image_url: string | null;
  badge_code: string | null;
  benefits: string | null;
  suitable_for: string | null;
  restriction_codes: string[];
  highlighted_ingredients: string[];
  in_stock?: boolean | null;
  is_sponsored?: boolean;
  description?: string | null;
  how_to_use?: string | null;
  cautions?: string | null;
}

export interface IngredientRow extends QueryResultRow {
  inci_name: string;
  display_name: string;
  is_highlighted: boolean;
}

// Cheapest current price among active variants, latest rating snapshot, first image.
const SUMMARY_SELECT = `
  p.id, p.name, b.name as brand, p.category_code,
  price.currency_code, price.amount::text as amount, price.compare_at_amount::text as compare_at_amount,
  rating.rating_avg::float as rating_avg, rating.rating_count,
  (select m.url from public.product_media m where m.product_id = p.id order by m.position limit 1) as image_url,
  a.badge_code, p.benefits, p.suitable_for,
  coalesce((
    select array_agg(distinct r.restriction_code)
    from public.product_ingredients pi
    join public.ingredient_restrictions r on r.ingredient_id = pi.ingredient_id
    where pi.product_id = p.id
  ), '{}') as restriction_codes,
  coalesce((
    select array_agg(i.inci_name order by pi.position)
    from public.product_ingredients pi
    join public.ingredients i on i.id = pi.ingredient_id
    where pi.product_id = p.id and pi.is_highlighted
  ), '{}') as highlighted_ingredients,
  (select bool_or(o.in_stock) from public.product_offers o where o.product_id = p.id and o.market_code = $1) as in_stock,
  p.is_sponsored
`;

const SUMMARY_JOINS = `
  from public.products p
  join public.brands b on b.id = p.brand_id
  join public.product_market_availability a
    on a.product_id = p.id and a.market_code = $1 and a.is_available
  left join lateral (
    select pr.currency_code, pr.amount, pr.compare_at_amount
    from public.product_variants v
    join public.product_prices pr on pr.variant_id = v.id and pr.market_code = $1
    where v.product_id = p.id and v.status = 'active'
      and pr.effective_from <= now() and (pr.effective_to is null or pr.effective_to > now())
    order by pr.amount asc limit 1
  ) price on true
  left join lateral (
    select s.rating_avg, s.rating_count from public.product_rating_snapshots s
    where s.product_id = p.id order by s.captured_at desc limit 1
  ) rating on true
`;

@Injectable()
export class CatalogRepository {
  constructor(private readonly database: DatabaseService) {}

  async marketOf(userId: string): Promise<string | null> {
    const rows = await this.database.query<{ market_code: string | null }>(
      `select market_code from public.user_profiles where user_id = $1`,
      [userId],
    );
    return rows[0]?.market_code ?? null;
  }

  list(params: {
    market: string;
    q?: string;
    category?: string;
    cursor: Cursor | null;
    limit: number;
  }): Promise<ProductRow[]> {
    const args: unknown[] = [params.market];
    const where = [`p.status = 'active'`, `p.deleted_at is null`];
    if (params.q) {
      args.push(params.q);
      where.push(`p.name ilike $${args.length} escape '\\'`);
    }
    if (params.category) {
      args.push(params.category);
      where.push(`p.category_code = $${args.length}`);
    }
    if (params.cursor) {
      args.push(params.cursor.name, params.cursor.id);
      where.push(`(p.name, p.id) > ($${args.length - 1}, $${args.length}::uuid)`);
    }
    args.push(params.limit + 1);
    return this.database.query<ProductRow>(
      `select ${SUMMARY_SELECT} ${SUMMARY_JOINS}
       where ${where.join(' and ')}
       order by p.name asc, p.id asc
       limit $${args.length}`,
      args,
    );
  }

  async get(market: string, productId: string): Promise<ProductRow | null> {
    const rows = await this.database.query<ProductRow>(
      `select ${SUMMARY_SELECT}, p.description, p.how_to_use, p.cautions
       ${SUMMARY_JOINS}
       where p.id = $2 and p.status = 'active' and p.deleted_at is null`,
      [market, productId],
    );
    return rows[0] ?? null;
  }

  ingredients(productId: string): Promise<IngredientRow[]> {
    return this.database.query<IngredientRow>(
      `select i.inci_name, i.display_name, pi.is_highlighted
       from public.product_ingredients pi
       join public.ingredients i on i.id = pi.ingredient_id
       where pi.product_id = $1
       order by pi.position, i.inci_name`,
      [productId],
    );
  }
}
