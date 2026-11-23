import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { OptionalAuth } from '../auth/optional-auth.decorator.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { DatabaseService } from '../database/database.service.js';
import { UsersModule } from '../users/users.module.js';
import { UsersService } from '../users/users.service.js';

/** The newest this many reviews of a product are returned. */
export const MAX_REVIEWS = 100;

export class WriteReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 }) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiProperty({ example: 'Gentle and does not dry my skin.' }) @IsString() @MinLength(2) @MaxLength(1000) body!: string;
}

export class ReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Amelia J.' }) author!: string;
  @ApiProperty() rating!: number;
  @ApiProperty() body!: string;
  @ApiProperty() created_at!: string;
  @ApiProperty() helpful_count!: number;
  @ApiProperty({ description: 'The caller marked it helpful.' }) helpful_by_me!: boolean;
  @ApiProperty({ description: 'The caller wrote it.' }) mine!: boolean;
}

export class ReviewListDto {
  @ApiProperty({ type: [ReviewDto] }) items!: ReviewDto[];
  @ApiProperty({ description: 'Reviews written in Clara.' }) count!: number;
  @ApiProperty({ type: Number, nullable: true, example: 4.5 }) average!: number | null;
}

/** "Amelia Jane" -> "Amelia J."; no name -> "Clara customer". Only the first name and an initial are ever shown. */
export function authorName(displayName: string | null): string {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return 'Clara customer';
  }
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

type Row = { id: string; display_name: string | null; rating: number; body: string; created_at: Date; helpful_count: number; helpful_by_me: boolean; mine: boolean };

@Injectable()
export class ReviewsService {
  constructor(
    private readonly users: UsersService,
    private readonly database: DatabaseService,
  ) {}

  async list(user: AuthenticatedUser | null, productId: string): Promise<ReviewListDto> {
    const viewer = user?.id ?? null;
    const rows = await this.database.query<Row>(
      `select r.id, p.display_name, r.rating, r.body, r.created_at,
              (select count(*)::int from public.product_review_votes v where v.review_id = r.id) as helpful_count,
              coalesce(exists (select 1 from public.product_review_votes v where v.review_id = r.id and v.user_id = $2), false) as helpful_by_me,
              coalesce(r.user_id = $2, false) as mine
       from public.product_reviews r
       left join public.user_profiles p on p.user_id = r.user_id
       where r.product_id = $1
       order by r.created_at desc
       limit ${MAX_REVIEWS}`,
      [productId, viewer],
    );
    const stats = await this.database.query<{ count: number; average: string | null }>(
      'select count(*)::int as count, round(avg(rating)::numeric, 1)::text as average from public.product_reviews where product_id = $1',
      [productId],
    );
    return {
      items: rows.map(row => ({
        id: row.id,
        author: authorName(row.display_name),
        rating: row.rating,
        body: row.body,
        created_at: new Date(row.created_at).toISOString(),
        helpful_count: row.helpful_count,
        helpful_by_me: row.helpful_by_me,
        mine: row.mine,
      })),
      count: stats[0]?.count ?? 0,
      average: stats[0]?.average ? Number(stats[0].average) : null,
    };
  }

  /** Writes the caller's review of a product, replacing their earlier one. */
  async write(user: AuthenticatedUser, productId: string, body: WriteReviewDto): Promise<ReviewListDto> {
    await this.users.getMe(user);
    const exists = await this.database.query('select 1 from public.products where id = $1', [productId]);
    if (!exists.length) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Product not found.');
    }
    await this.database.query(
      `insert into public.product_reviews (product_id, user_id, rating, body) values ($1, $2, $3, $4)
       on conflict (product_id, user_id) do update set rating = excluded.rating, body = excluded.body, updated_at = now()`,
      [productId, user.id, body.rating, body.body.trim()],
    );
    return this.list(user, productId);
  }

  async remove(user: AuthenticatedUser, productId: string): Promise<void> {
    await this.database.query('delete from public.product_reviews where product_id = $1 and user_id = $2', [productId, user.id]);
  }

  /** Marks (or unmarks) a review helpful. People cannot vote for their own. */
  async helpful(user: AuthenticatedUser, reviewId: string, on: boolean): Promise<void> {
    await this.users.getMe(user);
    if (!on) {
      await this.database.query('delete from public.product_review_votes where review_id = $1 and user_id = $2', [reviewId, user.id]);
      return;
    }
    const rows = await this.database.query<{ user_id: string }>('select user_id from public.product_reviews where id = $1', [reviewId]);
    if (!rows.length) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Review not found.');
    }
    if (rows[0].user_id === user.id) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'You can not mark your own review helpful.');
    }
    await this.database.query(
      'insert into public.product_review_votes (review_id, user_id) values ($1, $2) on conflict do nothing',
      [reviewId, user.id],
    );
  }
}

@ApiTags('Catalog')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('products/:id/reviews')
  @OptionalAuth()
  @ApiOperation({ summary: 'Reviews of a product written in Clara, newest first', description: 'Sign-in optional; with it, `mine` and `helpful_by_me` are filled in.' })
  @ApiOkResponse({ type: ReviewListDto })
  list(@CurrentUser({ optional: true }) user: AuthenticatedUser | null, @Param('id', ParseUUIDPipe) id: string): Promise<ReviewListDto> {
    return this.reviews.list(user, id);
  }

  @Put('products/:id/reviews')
  @ApiOperation({ summary: 'Write (or replace) my review of a product' })
  @ApiOkResponse({ type: ReviewListDto })
  write(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: WriteReviewDto): Promise<ReviewListDto> {
    return this.reviews.write(user, id, body);
  }

  @Delete('products/:id/reviews')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete my review of a product' })
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.reviews.remove(user, id);
  }

  @Put('reviews/:id/helpful')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark a review helpful' })
  @ApiNoContentResponse()
  async helpful(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.reviews.helpful(user, id, true);
  }

  @Delete('reviews/:id/helpful')
  @HttpCode(204)
  @ApiOperation({ summary: 'Take back a helpful mark' })
  @ApiNoContentResponse()
  async notHelpful(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.reviews.helpful(user, id, false);
  }
}

@Module({
  imports: [UsersModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
