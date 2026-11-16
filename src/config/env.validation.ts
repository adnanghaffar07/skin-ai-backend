import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const DEFAULT_SUPABASE_URL =
  'https://awhulfitatettoqllejm.supabase.co';

export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  NODE_ENV!: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsUrl({ require_protocol: true, protocols: ['https'] })
  SUPABASE_URL!: string;

  @IsOptional()
  @IsString()
  @Matches(/^postgres(ql)?:\/\//)
  DATABASE_URL?: string;

  /** PEM text of the database CA. When set, the TLS certificate is verified. */
  @IsOptional()
  @IsString()
  DATABASE_SSL_CA?: string;

  /** Comma-separated browser origins allowed by CORS. Empty in production means CORS is off. */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  RATE_LIMIT_PER_MINUTE!: number;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(
    EnvironmentVariables,
    {
      NODE_ENV: config.NODE_ENV ?? 'development',
      PORT: config.PORT ?? 3000,
      SUPABASE_URL: config.SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
      DATABASE_URL: config.DATABASE_URL || undefined,
      DATABASE_SSL_CA: config.DATABASE_SSL_CA || undefined,
      CORS_ORIGINS: config.CORS_ORIGINS || undefined,
      RATE_LIMIT_PER_MINUTE: config.RATE_LIMIT_PER_MINUTE ?? 120,
    },
    { enableImplicitConversion: true },
  );
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }
  return validated;
}
