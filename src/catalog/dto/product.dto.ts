import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_LIMIT } from '../catalog-query.js';

export class ListProductsQueryDto {
  @ApiProperty({ required: false, example: 'cleanser' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiProperty({ required: false, example: 'cleanser' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string;

  @ApiProperty({ required: false, example: 'US', description: 'Falls back to the profile market.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/)
  market?: string;

  @ApiProperty({ required: false, example: 20, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  cursor?: string;
}

export class ProductPriceDto {
  @ApiProperty({ example: 'USD' }) currency_code!: string;
  @ApiProperty({ example: '24.00' }) amount!: string;
  @ApiProperty({ type: String, nullable: true, example: '30.00' })
  compare_at_amount!: string | null;
}

export class ProductSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() brand!: string;
  @ApiProperty({ example: 'cleanser' }) category_code!: string;
  @ApiProperty({ type: ProductPriceDto, nullable: true }) price!: ProductPriceDto | null;
  @ApiProperty({ type: Number, nullable: true, example: 4.6 }) rating_avg!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 128 }) rating_count!: number | null;
  @ApiProperty({ type: String, nullable: true }) image_url!: string | null;
  @ApiProperty({ type: String, nullable: true }) badge_code!: string | null;
  @ApiProperty({
    type: [String],
    example: ['dryness_dehydration'],
    description: 'Concerns the product text speaks to, using the questionnaire concern codes.',
  })
  concern_codes!: string[];
  @ApiProperty({
    type: [String],
    example: ['fragrance'],
    description: 'Avoid-list codes this product conflicts with (fragrance, retinol, essential_oils).',
  })
  restriction_codes!: string[];
  @ApiProperty({ type: [String], example: ['Retinol'], description: 'INCI names of highlighted ingredients.' })
  highlighted_ingredients!: string[];
  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: 'Whether a store Clara buys from has it in stock in this market. Null when Clara has no store offer on record.',
  })
  in_stock!: boolean | null;
  @ApiProperty({ description: 'A paid placement. The app labels it "Sponsored" so it is not mistaken for a personal match.' })
  sponsored!: boolean;
}

export class ProductListDto {
  @ApiProperty({ type: [ProductSummaryDto] }) items!: ProductSummaryDto[];
  @ApiProperty({ type: String, nullable: true }) next_cursor!: string | null;
}

export class ProductIngredientDto {
  @ApiProperty() inci_name!: string;
  @ApiProperty() display_name!: string;
  @ApiProperty() is_highlighted!: boolean;
}

export class ProductDetailDto extends ProductSummaryDto {
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) benefits!: string | null;
  @ApiProperty({ type: String, nullable: true }) how_to_use!: string | null;
  @ApiProperty({ type: String, nullable: true }) suitable_for!: string | null;
  @ApiProperty({ type: String, nullable: true }) cautions!: string | null;
  @ApiProperty({ type: [ProductIngredientDto] }) ingredients!: ProductIngredientDto[];
}
