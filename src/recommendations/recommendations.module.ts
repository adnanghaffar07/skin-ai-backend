import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { UsersModule } from '../users/users.module.js';
import { RecommendationsController } from './recommendations.controller.js';
import { RecommendationsRepository } from './recommendations.repository.js';
import { RecommendationsService } from './recommendations.service.js';

@Module({
  imports: [UsersModule, AiModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsRepository, RecommendationsService],
})
export class RecommendationsModule {}
