import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { CONCERN_KEYWORDS } from '../recommendations/ranking.js';
import { UsersService } from '../users/users.service.js';
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  likePattern,
} from './catalog-query.js';
import { CatalogRepository, type ProductRow } from './catalog.repository.js';
import type {
  ListProductsQueryDto,
  ProductDetailDto,
  ProductListDto,
  ProductSummaryDto,
} from './dto/product.dto.js';

/** Concern codes whose keywords appear in the product's name, benefits or suitable-for text (the words the ranking uses). */
export function concernCodesOf(row: Pick<ProductRow, 'name' | 'benefits' | 'suitable_for'>): string[] {
  const text = `${row.name} ${row.benefits ?? ''} ${row.suitable_for ?? ''}`.toLowerCase();
  return Object.entries(CONCERN_KEYWORDS)
    .filter(([, words]) => words.some((word) => text.includes(word)))
    .map(([code]) => code);
}

type Plain<T> = { [K in keyof T]: T[K] };

function toSummary(row: ProductRow): Plain<ProductSummaryDto> {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category_code: row.category_code,
    price:
      row.amount && row.currency_code
        ? {
            currency_code: row.currency_code,
            amount: row.amount,
            compare_at_amount: row.compare_at_amount,
          }
        : null,
    rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
    rating_count: row.rating_count,
    image_url: row.image_url,
    badge_code: row.badge_code,
    concern_codes: concernCodesOf(row),
    restriction_codes: row.restriction_codes ?? [],
    highlighted_ingredients: row.highlighted_ingredients ?? [],
  };
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly users: UsersService,
    private readonly catalog: CatalogRepository,
  ) {}

  async list(
    user: AuthenticatedUser | null,
    query: ListProductsQueryDto,
  ): Promise<ProductListDto> {
    const market = await this.resolveMarket(user, query.market);
    const limit = clampLimit(query.limit);
    const rows = await this.catalog.list({
      market,
      q: query.q?.trim() ? likePattern(query.q.trim()) : undefined,
      category: query.category,
      cursor: decodeCursor(query.cursor),
      limit,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toSummary),
      next_cursor:
        rows.length > limit && last
          ? encodeCursor({ name: last.name, id: last.id })
          : null,
    };
  }

  async get(
    user: AuthenticatedUser | null,
    productId: string,
    market?: string,
  ): Promise<ProductDetailDto> {
    const resolved = await this.resolveMarket(user, market);
    const row = await this.catalog.get(resolved, productId);
    if (!row) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Product not found.');
    }
    return {
      ...toSummary(row),
      description: row.description ?? null,
      benefits: row.benefits ?? null,
      how_to_use: row.how_to_use ?? null,
      suitable_for: row.suitable_for ?? null,
      cautions: row.cautions ?? null,
      ingredients: await this.catalog.ingredients(row.id),
    };
  }

  private async resolveMarket(
    user: AuthenticatedUser | null,
    requested: string | undefined,
  ): Promise<string> {
    if (requested) {
      return requested;
    }
    // A guest has no profile to take the market from.
    if (!user) {
      throw new ApiException(
        422,
        ErrorCode.MARKET_REQUIRED,
        'Pass market when not signed in.',
      );
    }
    await this.users.getMe(user);
    const market = await this.catalog.marketOf(user.id);
    if (!market) {
      throw new ApiException(
        422,
        ErrorCode.MARKET_REQUIRED,
        'Pass market or set a market on the profile.',
      );
    }
    return market;
  }
}
