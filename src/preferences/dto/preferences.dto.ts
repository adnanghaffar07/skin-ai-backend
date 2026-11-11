import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export const PREFERENCE_GOALS = [
  'hydration',
  'calm_redness',
  'even_tone',
  'clearer_skin',
] as const;

export const AVOID_CODES = ['fragrance', 'retinol', 'essential_oils'] as const;

export class UpdatePreferencesDto {
  @ApiProperty({
    type: [String],
    example: ['hydration', 'calm_redness', 'even_tone', 'clearer_skin'],
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(PREFERENCE_GOALS, { each: true })
  goal_codes!: string[];

  @ApiProperty({
    type: [String],
    example: ['fragrance', 'retinol', 'essential_oils'],
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(AVOID_CODES, { each: true })
  avoid_codes!: string[];

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  morning_time?: string;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  evening_time?: string;

  @ApiPropertyOptional({ example: '2026-10-28' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  next_scan_on?: string;
}

export class PreferencesResponseDto {
  @ApiProperty({ type: [String], example: ['hydration', 'calm_redness'] })
  goal_codes!: string[];

  @ApiProperty({ type: [String], example: ['fragrance'] })
  avoid_codes!: string[];

  @ApiProperty({ type: String, example: '08:00', nullable: true })
  morning_time!: string | null;

  @ApiProperty({ type: String, example: '21:00', nullable: true })
  evening_time!: string | null;

  @ApiProperty({ type: String, example: '2026-10-28', nullable: true })
  next_scan_on!: string | null;

  @ApiProperty({
    type: String,
    example: 'improve_hydration',
    nullable: true,
    description: 'Projected from questionnaire question 5. Not writable here.',
  })
  primary_goal!: string | null;

  @ApiProperty({ type: String, example: '20_50', nullable: true })
  monthly_budget_band!: string | null;

  @ApiProperty({ type: [String], example: ['serums', 'sunscreens'] })
  category_codes!: string[];
}
