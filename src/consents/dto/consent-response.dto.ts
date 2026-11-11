import { ApiProperty } from '@nestjs/swagger';
import { CONSENT_PURPOSES } from './create-consent.dto.js';

export class ConsentResponseDto {
  @ApiProperty({ example: 'b7e1c4a2-91d0-4f6a-8c33-0a1b2c3d4e5f' })
  id!: string;

  @ApiProperty({ example: 'facial_image_processing', enum: CONSENT_PURPOSES })
  purpose!: string;

  @ApiProperty({ example: '2026-10-28' })
  policy_version!: string;

  @ApiProperty({ example: true })
  granted!: boolean;

  @ApiProperty({ example: '2026-10-28T18:00:00.000Z' })
  granted_at!: string;

  @ApiProperty({ type: String, example: null, nullable: true })
  revoked_at!: string | null;

  @ApiProperty({ example: 'privacy_screen' })
  source!: string;
}

export class ConsentListDto {
  @ApiProperty({ type: [ConsentResponseDto] })
  items!: ConsentResponseDto[];
}
