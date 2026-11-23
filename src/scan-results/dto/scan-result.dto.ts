import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const METRIC_IDS = ['redness', 'shine', 'darkCircles', 'blemishes'] as const;
export const METRIC_LEVELS = ['none', 'mild', 'moderate', 'high', 'unavailable'] as const;
export const PHOTO_ISSUES = [
  'too-dark', 'too-bright', 'uneven-light', 'blurry', 'face-small', 'face-cut-off', 'face-turned', 'face-tilted', 'multiple-faces', 'face-unclear',
] as const;

export class MetricReadingDto {
  @ApiProperty({ enum: METRIC_IDS }) @IsIn(METRIC_IDS) id!: string;
  @ApiProperty({ enum: METRIC_LEVELS }) @IsIn(METRIC_LEVELS) level!: string;
  @ApiProperty({ required: false, minimum: 0, maximum: 100 }) @IsOptional() @IsInt() @Min(0) @Max(100) score?: number;
  @ApiProperty({ example: 'Mild, on cheeks' }) @IsString() @MaxLength(120) note!: string;
  @ApiProperty({ required: false, description: 'Spots found (blemishes).' }) @IsOptional() @IsInt() @Min(0) @Max(500) count?: number;
}

export class SaveScanResultDto {
  @ApiProperty({ example: '2026-11-24T09:30:00.000Z' }) @IsISO8601() analysed_at!: string;
  @ApiProperty({ enum: ['device', 'server'], required: false }) @IsOptional() @IsIn(['device', 'server']) source?: string;
  @ApiProperty({ type: [MetricReadingDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MetricReadingDto)
  metrics!: MetricReadingDto[];
  @ApiProperty({ enum: PHOTO_ISSUES, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(PHOTO_ISSUES, { each: true })
  issues?: string[];
}

export class ScanResultDto {
  @ApiProperty({ example: 'scan-1795461200000' }) client_id!: string;
  @ApiProperty() analysed_at!: string;
  @ApiProperty({ enum: ['device', 'server'] }) source!: string;
  @ApiProperty({ type: [MetricReadingDto] }) metrics!: MetricReadingDto[];
  @ApiProperty({ type: [String] }) issues!: string[];
}

export class ScanResultListDto {
  @ApiProperty({ type: [ScanResultDto] }) items!: ScanResultDto[];
}
