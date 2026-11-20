import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, MaxLength } from 'class-validator';

export const CONSENT_PURPOSES = [
  'facial_image_processing',
  'camera_access',
  'photo_library',
  'terms_of_service',
  'ai_model_training',
] as const;

export class CreateConsentDto {
  @ApiProperty({ example: 'facial_image_processing', enum: CONSENT_PURPOSES })
  @IsIn(CONSENT_PURPOSES)
  purpose!: (typeof CONSENT_PURPOSES)[number];

  @ApiProperty({ example: '2026-10-28' })
  @IsString()
  @MaxLength(32)
  policy_version!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  granted!: boolean;

  @ApiProperty({ example: 'privacy_screen' })
  @IsString()
  @MaxLength(64)
  source!: string;
}
