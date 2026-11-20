import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AiRecommender } from '../ai/ai-recommender.js';
import { MARKUP_BP } from '../ai/ai.module.js';
import { ProductIntakeRepository } from '../ai/product-intake.repository.js';
import { UsersService } from '../users/users.service.js';
import { RecommendationsRepository } from './recommendations.repository.js';
import { RecommendationsService } from './recommendations.service.js';

/**
 * Builds the service through Nest, as the running server does. The plain unit tests construct it by hand, which is how
 * a missing injection (the product intake arriving as null, so the AI was never called) went unnoticed.
 */
describe('RecommendationsService wiring', () => {
  it('receives the AI recommender, the product intake and the markup from Nest', async () => {
    const ai = { provider: 'http', recommend: () => undefined };
    const intake = { save: () => undefined };
    const module = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: UsersService, useValue: {} },
        { provide: RecommendationsRepository, useValue: {} },
        { provide: AiRecommender, useValue: ai },
        { provide: ProductIntakeRepository, useValue: intake },
        { provide: MARKUP_BP, useValue: 850 },
      ],
    }).compile();
    const service = module.get(RecommendationsService) as unknown as Record<string, unknown>;
    expect(service.ai).toBe(ai);
    expect(service.intake).toBe(intake);
    expect(service.markupBp).toBe(850);
  });
});
