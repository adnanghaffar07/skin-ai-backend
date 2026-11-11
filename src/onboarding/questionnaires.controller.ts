import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { ActiveQuestionnaireDto } from './dto/onboarding.dto.js';
import { OnboardingService } from './onboarding.service.js';

@ApiTags('Onboarding')
@Public()
@Controller('questionnaires')
export class QuestionnairesController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('onboarding/active')
  @ApiOperation({
    summary: 'Load the active onboarding questionnaire',
    description:
      'Optional. The app can keep these ten screens locally. Do not call this while the user moves between screens.',
  })
  @ApiOkResponse({ type: ActiveQuestionnaireDto })
  active(): Promise<ActiveQuestionnaireDto> {
    return this.onboarding.getActiveQuestionnaire();
  }
}
