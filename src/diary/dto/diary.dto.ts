import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** The questionnaire's concern codes (Q3), so the diary and the profile speak the same language. */
export const DIARY_CONCERNS = [
  'acne_breakouts',
  'dark_spots',
  'dryness_dehydration',
  'fine_lines',
  'redness_sensitivity',
  'uneven_texture',
  'oiliness',
  'itching',
] as const;
export const DIARY_REACTIONS = ['none', 'mild', 'severe'] as const;
/** How bad a ticked concern was: 1 mild, 2 moderate, 3 strong. */
export const CONCERN_LEVELS = [1, 2, 3] as const;
export type DiaryReaction = (typeof DIARY_REACTIONS)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class SaveDiaryEntryDto {
  @ApiProperty({ required: false, nullable: true, minimum: 1, maximum: 5, description: 'How comfortable the skin feels: 1 very uncomfortable, 5 great.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(5)
  skin_feel?: number | null;

  @ApiProperty({ required: false, enum: DIARY_CONCERNS, isArray: true, description: 'What bothered the skin today.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DIARY_CONCERNS.length)
  @ArrayUnique()
  @IsIn(DIARY_CONCERNS, { each: true })
  concerns?: string[];

  @ApiProperty({
    required: false,
    type: Object,
    additionalProperties: { type: 'integer', enum: [...CONCERN_LEVELS] },
    example: { dryness_dehydration: 2 },
    description: 'How bad each ticked concern was: 1 mild, 2 moderate, 3 strong. Levels for concerns not ticked are dropped.',
  })
  @IsOptional()
  @IsObject()
  concern_levels?: Record<string, number>;

  @ApiProperty({ required: false, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean() morning_routine_done?: boolean | null;
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean() evening_routine_done?: boolean | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 300, example: 'Started the vitamin C serum' })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  new_products?: string | null;

  @ApiProperty({ required: false, nullable: true, enum: DIARY_REACTIONS })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(DIARY_REACTIONS)
  reaction?: DiaryReaction | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 500, example: 'Stinging around the nose' })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  reaction_note?: string | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class DiaryRangeQueryDto {
  @ApiProperty({ example: '2026-11-01', description: 'First day, inclusive.' })
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ example: '2026-11-30', description: 'Last day, inclusive. At most 92 days after from.' })
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to!: string;
}

export class DiarySummaryQueryDto {
  @ApiProperty({ example: '2026-11-20', description: "Today's date on the phone, so streaks follow the person's own day." })
  @Matches(DATE, { message: 'today must be YYYY-MM-DD' })
  today!: string;
}

export class DiaryEntryDto {
  @ApiProperty({ example: '2026-11-20' }) date!: string;
  @ApiProperty({ type: Number, nullable: true }) skin_feel!: number | null;
  @ApiProperty({ type: [String], enum: DIARY_CONCERNS }) concerns!: string[];
  @ApiProperty({ type: Object, additionalProperties: { type: 'integer' }, description: 'Level per ticked concern: 1 mild, 2 moderate, 3 strong.' })
  concern_levels!: Record<string, number>;
  @ApiProperty({ type: Boolean, nullable: true }) morning_routine_done!: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) evening_routine_done!: boolean | null;
  @ApiProperty({ type: String, nullable: true }) new_products!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: DIARY_REACTIONS }) reaction!: string | null;
  @ApiProperty({ type: String, nullable: true }) reaction_note!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Set when the entry reports a severe reaction: advice to stop new products and see a professional.',
  })
  advice!: string | null;
  @ApiProperty() updated_at!: string;
}

export class DiaryListDto {
  @ApiProperty({ type: [DiaryEntryDto], description: 'Newest day first.' }) items!: DiaryEntryDto[];
}

export class DiarySummaryDto {
  @ApiProperty() today_logged!: boolean;
  @ApiProperty({ description: 'Days in a row with an entry, ending today (or yesterday if today is not logged yet).' })
  streak_days!: number;
  @ApiProperty({ description: 'Entries in the 7 days ending today.' }) entries_last_7_days!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Average skin feel over those 7 days, one decimal.' })
  average_feel_last_7_days!: number | null;
  @ApiProperty({ type: String, nullable: true }) last_entry_date!: string | null;
}
