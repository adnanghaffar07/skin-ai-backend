import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsUUID, Max, Min } from 'class-validator';
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES } from '../scan-rules.js';

export class CreateScanDto {
  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  @IsUUID()
  submission_id!: string;
}

export class UploadUrlDto {
  @ApiProperty({ example: 'image/jpeg', enum: IMAGE_CONTENT_TYPES })
  @IsIn(IMAGE_CONTENT_TYPES)
  content_type!: (typeof IMAGE_CONTENT_TYPES)[number];

  @ApiProperty({ example: 2401122, maximum: MAX_IMAGE_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_BYTES)
  byte_size!: number;
}

export class ScanDto {
  @ApiProperty({ example: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77' })
  id!: string;

  @ApiProperty({ example: 'awaiting_upload' })
  status!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  submitted_at!: string | null;

  @ApiProperty({ example: '2026-11-11T10:00:00.000Z' })
  created_at!: string;

  @ApiProperty({ example: false })
  has_image!: boolean;

  @ApiProperty({ example: false })
  analysis_available!: boolean;
}

export class ScanListDto {
  @ApiProperty({ type: [ScanDto] })
  items!: ScanDto[];
}

export class UploadUrlResponseDto {
  @ApiProperty() upload_url!: string;
  @ApiProperty({ example: 'PUT' }) method!: 'PUT';
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  headers!: Record<string, string>;
  @ApiProperty() expires_at!: string;
  @ApiProperty({ example: 'scans/<user>/<scan>/<id>.jpg' }) object_key!: string;
}

export class SubmitScanResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'ready_for_analysis' }) status!: string;
  @ApiProperty() submitted_at!: string;
  @ApiProperty({ example: false }) analysis_available!: boolean;
}

export class ScanResultDto {
  @ApiProperty() scan_id!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ example: 'not_ready' }) basis!: 'not_ready';
  @ApiProperty({ example: false }) analysis_available!: boolean;
  @ApiProperty({ type: String, nullable: true }) submitted_at!: string | null;
  @ApiProperty({ type: Object, nullable: true, example: null }) assessment!: null;
  @ApiProperty({ type: Object, nullable: true, example: null }) recommendations!: null;
  @ApiProperty({ type: Object, nullable: true, example: null }) routine!: null;
  @ApiProperty({ type: [String], example: [] }) sources!: string[];
  @ApiProperty() disclaimer!: string;
  @ApiProperty({ type: String, nullable: true, example: null })
  generated_at!: string | null;
}
