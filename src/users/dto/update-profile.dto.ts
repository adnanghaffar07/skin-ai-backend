import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Amelia Jane' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  display_name?: string;

  @ApiPropertyOptional({ example: '1996-05-14' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birth_date?: string;

  @ApiPropertyOptional({ example: 'Missouri' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  state_province?: string;

  @ApiPropertyOptional({ example: '91821 Mante Ranch' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address_line?: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  market_code?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;
}
