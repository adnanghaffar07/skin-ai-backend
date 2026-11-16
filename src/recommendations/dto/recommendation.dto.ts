import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsUUID, Matches } from 'class-validator';

export class CreateRecommendationDto {
  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  @IsUUID()
  submission_id!: string;

  @ApiProperty({ required: false, example: 'US', description: 'Falls back to the profile market.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/)
  market_code?: string;
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

export class RecommendationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'self_reported' }) basis!: string;
  @ApiProperty() rule_version!: string;
  @ApiProperty({ type: [String], example: [] }) limitations!: string[];
  @ApiProperty({ example: 'not_implemented' }) explanation_status!: 'not_implemented';
  @ApiProperty({ example: 'Calm and protect' }) morning_title!: string;
  @ApiProperty({ example: 'Repair and smooth' }) evening_title!: string;
  @ApiProperty({ type: [RecommendedProductDto] }) products!: RecommendedProductDto[];
  @ApiProperty({ type: Object, nullable: true, example: null }) snapshot!: null;
}
