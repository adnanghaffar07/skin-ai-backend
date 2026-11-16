import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/** A real calendar date that is not in the future and not before 1900. */
@ValidatorConstraint({ name: 'plausibleBirthDate', async: false })
export class PlausibleBirthDate implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      date.getUTCFullYear() >= 1900 &&
      date.getTime() <= Date.now()
    );
  }

  defaultMessage(): string {
    return 'birth_date must be a real date between 1900-01-01 and today';
  }
}

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
  @Validate(PlausibleBirthDate)
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
