import { ApiProperty } from '@nestjs/swagger';

export class SkinSummaryDto {
  @ApiProperty({ type: String, example: 'combination', nullable: true })
  self_reported_skin_type!: string | null;

  @ApiProperty({
    type: [String],
    example: ['dryness_dehydration', 'uneven_texture'],
  })
  concerns!: string[];

  @ApiProperty({ type: String, example: null, nullable: true })
  last_scan_at!: string | null;
}

export class OnboardingPointerDto {
  @ApiProperty({ example: 'completed' })
  status!: string;

  @ApiProperty({
    type: String,
    example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6',
    nullable: true,
  })
  submission_id!: string | null;
}

export class MeResponseDto {
  @ApiProperty({ example: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77' })
  id!: string;

  @ApiProperty({ type: String, example: 'ameliajane43@gmail.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: 'customer' })
  role!: string;

  @ApiProperty({ type: String, example: 'Amelia Jane', nullable: true })
  display_name!: string | null;

  @ApiProperty({ type: String, example: '1996-05-14', nullable: true })
  birth_date!: string | null;

  @ApiProperty({ type: String, example: 'Missouri', nullable: true })
  state_province!: string | null;

  @ApiProperty({ type: String, example: '91821 Mante Ranch', nullable: true })
  address_line!: string | null;

  @ApiProperty({ type: String, example: null, nullable: true })
  avatar_url!: string | null;

  @ApiProperty({ type: String, example: 'US', nullable: true })
  market_code!: string | null;

  @ApiProperty({ example: 'en' })
  locale!: string;

  @ApiProperty({ type: SkinSummaryDto })
  skin!: SkinSummaryDto;

  @ApiProperty({ type: OnboardingPointerDto })
  onboarding!: OnboardingPointerDto;
}
