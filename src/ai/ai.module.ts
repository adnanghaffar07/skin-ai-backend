import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { percentToBasisPoints } from '../pricing/pricing.js';
import { AiRecommender, HttpAiRecommender } from './ai-recommender.js';
import { ProductIntakeRepository } from './product-intake.repository.js';
import { StubAiRecommender } from './stub-ai-recommender.js';

/** Injection token for the markup, in basis points (850 = 8.5%). */
export const MARKUP_BP = 'MARKUP_BP';

/**
 * Provides the AI recommender chosen by AI_SERVICE_MODE: the real service, the stand-in, or null (Clara's own rules
 * only). Also the markup and the repository that saves products the AI found.
 */
@Module({
  providers: [
    {
      provide: AiRecommender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): AiRecommender | null => {
        const mode = config.get('AI_SERVICE_MODE', { infer: true });
        if (mode === 'http') {
          return new HttpAiRecommender(
            config.get('AI_SERVICE_URL', { infer: true }) as string,
            config.get('AI_SERVICE_KEY', { infer: true }) as string,
            config.get('AI_TIMEOUT_MS', { infer: true }),
          );
        }
        return mode === 'stub' ? new StubAiRecommender() : null;
      },
    },
    {
      provide: MARKUP_BP,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        percentToBasisPoints(config.get('PRICE_MARKUP_PERCENT', { infer: true })),
    },
    ProductIntakeRepository,
  ],
  exports: [AiRecommender, MARKUP_BP, ProductIntakeRepository],
})
export class AiModule {}
