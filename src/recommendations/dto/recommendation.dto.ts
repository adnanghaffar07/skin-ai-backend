import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsUUID, Matches } from 'class-validator';

export class CreateRecommendationDto {
  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  @IsUUID()
  submission_id!: string;

  @ApiProperty({ required: false, example: 'US', description: 'Falls back to the profile market.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/)
  market_code?: string;

  @ApiProperty({
    required: false,
    description:
      'What the phone read from the newest face scan (findings only, never the photo). Passed to the AI service; invalid parts are dropped.',
    example: {
      source: 'on_device',
      captured_at: '2026-11-21T09:10:00Z',
      findings: [{ feature: 'redness', level: 'moderate', score: 62 }],
      photo_issues: [],
    },
  })
  @IsOptional()
  @IsObject()
  scan?: Record<string, unknown>;
}

export class RecommendedProductDto {
  @ApiProperty() product_id!: string;
  @ApiProperty() variant_id!: string;
  @ApiProperty() rank!: number;
  @ApiProperty() name!: string;
  @ApiProperty() brand!: string;
  @ApiProperty({ example: 'cleansers' }) category_code!: string;
  @ApiProperty({ example: 'USD' }) currency_code!: string;
  @ApiProperty({ example: '24.00' }) amount!: string;
  @ApiProperty({ type: [String], example: ['category:cleansers', 'concern:dryness_dehydration'] })
  reason_codes!: string[];
  @ApiProperty({ type: String, nullable: true, example: null }) explanation!: string | null;
}

export class BudgetSummaryDto {
  @ApiProperty({ type: String, nullable: true, example: '50.00', description: 'Monthly budget ceiling from the questionnaire; null when no budget was set.' })
  ceiling!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'USD' }) currency_code!: string | null;
  @ApiProperty({ example: '42.10', description: 'Monthly cost of the routine built from `products` (first pick of each category).' })
  routine_total!: string;
  @ApiProperty({ example: '86.40', description: 'Monthly cost of the routine built from `best_products`.' })
  best_total!: string;
  @ApiProperty() within_budget!: boolean;
  @ApiProperty({ description: 'True when the best routine costs more than the budget, so the app labels it "above your budget".' })
  best_exceeds_budget!: boolean;
}

export class RecommendationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'ai_assisted', description: 'self_reported (Clara rules) or ai_assisted (AI service picks).' }) basis!: string;
  @ApiProperty() rule_version!: string;
  @ApiProperty({ type: [String], example: [] }) limitations!: string[];
  @ApiProperty({ type: String, nullable: true, description: 'One-line summary from the AI service; null for rule-based plans.' })
  summary!: string | null;
  @ApiProperty({ enum: ['ai', 'not_implemented'], description: "'ai' when products carry the AI service's explanation." })
  explanation_status!: 'ai' | 'not_implemented';
  @ApiProperty({ example: 'Calm and protect' }) morning_title!: string;
  @ApiProperty({ example: 'Repair and smooth' }) evening_title!: string;
  @ApiProperty({ type: [RecommendedProductDto], description: 'Picks within the monthly budget, best first. The routine is built from these.' })
  products!: RecommendedProductDto[];
  @ApiProperty({ type: [RecommendedProductDto], description: 'The best pick of each category regardless of price. May exceed the budget.' })
  best_products!: RecommendedProductDto[];
  @ApiProperty({ type: BudgetSummaryDto }) budget!: BudgetSummaryDto;
  @ApiProperty({ type: Object, nullable: true, example: null }) snapshot!: null;
}
