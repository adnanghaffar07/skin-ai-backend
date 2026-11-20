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

export const AI_SERVICE_MODES = ['off', 'stub', 'http'] as const;
export const PAYMENTS_MODES = ['off', 'stripe'] as const;
export type PaymentsMode = (typeof PAYMENTS_MODES)[number];
export type AiServiceMode = (typeof AI_SERVICE_MODES)[number];

export const DEFAULT_SUPABASE_URL =
  'https://awhulfitatettoqllejm.supabase.co';
export const DEFAULT_PUBLIC_BASE_URL = 'https://clara-skin-api.vercel.app';

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

  /**
   * Where product recommendations come from. 'http' calls the AI service, 'stub' uses the built-in stand-in (development
   * only: it creates clearly marked test products), 'off' uses Clara's own rules. Defaults to 'http' when AI_SERVICE_URL
   * is set, otherwise 'off'.
   */
  @IsIn(AI_SERVICE_MODES)
  AI_SERVICE_MODE!: AiServiceMode;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'], require_tld: true })
  AI_SERVICE_URL?: string;

  @IsOptional()
  @IsString()
  AI_SERVICE_KEY?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  AI_TIMEOUT_MS!: number;

  /** Added to the store price to get Clara's price, in percent. */
  @Type(() => Number)
  @Min(0)
  @Max(100)
  PRICE_MARKUP_PERCENT!: number;

  /**
   * How orders are paid. 'stripe' sends the customer to Stripe Checkout (Stripe's own payment page); 'off' turns
   * checkout off. Defaults to 'stripe' when STRIPE_SECRET_KEY is set, otherwise 'off'.
   */
  @IsIn(PAYMENTS_MODES)
  PAYMENTS_MODE!: PaymentsMode;

  /** Stripe secret key: sk_test_... while testing, sk_live_... for real payments. */
  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  /** Signing secret of the Stripe webhook endpoint (whsec_...), used to check that events really come from Stripe. */
  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET?: string;

  /** Public address of this API, used for the pages Stripe sends the customer back to. */
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'], require_tld: false })
  PUBLIC_BASE_URL!: string;
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
      AI_SERVICE_MODE: config.AI_SERVICE_MODE || (config.AI_SERVICE_URL ? 'http' : 'off'),
      AI_SERVICE_URL: config.AI_SERVICE_URL || undefined,
      AI_SERVICE_KEY: config.AI_SERVICE_KEY || undefined,
      AI_TIMEOUT_MS: config.AI_TIMEOUT_MS ?? 30000,
      PRICE_MARKUP_PERCENT: config.PRICE_MARKUP_PERCENT ?? 8.5,
      PAYMENTS_MODE: config.PAYMENTS_MODE || (config.STRIPE_SECRET_KEY ? 'stripe' : 'off'),
      STRIPE_SECRET_KEY: config.STRIPE_SECRET_KEY || undefined,
      STRIPE_WEBHOOK_SECRET: config.STRIPE_WEBHOOK_SECRET || undefined,
      PUBLIC_BASE_URL: config.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL,
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
  if (validated.AI_SERVICE_MODE === 'http' && (!validated.AI_SERVICE_URL || !validated.AI_SERVICE_KEY)) {
    throw new Error('Environment validation failed: AI_SERVICE_MODE=http needs AI_SERVICE_URL and AI_SERVICE_KEY.');
  }
  // The stand-in creates test products in the database; it must never run against real customers.
  if (validated.AI_SERVICE_MODE === 'stub' && validated.NODE_ENV === 'production') {
    throw new Error('Environment validation failed: AI_SERVICE_MODE=stub is not allowed in production.');
  }
  if (
    validated.PAYMENTS_MODE === 'stripe' &&
    (!validated.STRIPE_SECRET_KEY?.startsWith('sk_') || !validated.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))
  ) {
    throw new Error(
      'Environment validation failed: PAYMENTS_MODE=stripe needs STRIPE_SECRET_KEY (sk_...) and STRIPE_WEBHOOK_SECRET (whsec_...).',
    );
  }
  return validated;
}
