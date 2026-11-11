import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { OnboardingFormController } from './onboarding-form.controller.js';
import { OnboardingRepository } from './onboarding.repository.js';
import { OnboardingService } from './onboarding.service.js';
import { QuestionnairesController } from './questionnaires.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [QuestionnairesController, OnboardingFormController],
  providers: [OnboardingRepository, OnboardingService],
})
export class OnboardingModule {}
