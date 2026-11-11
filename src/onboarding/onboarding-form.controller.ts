import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  OnboardingFormResponseDto,
  SubmitOnboardingFormDto,
} from './dto/onboarding.dto.js';
import { OnboardingService } from './onboarding.service.js';

@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller('onboarding/form')
export class OnboardingFormController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post()
  @ApiOperation({
    summary: 'Save the whole onboarding form once',
    description:
      'Call this after sign-up, when every screen already has a value on the device. Going back and changing a selection does not call the API. The server stores each screen and projects the skin profile.',
  })
  @ApiBody({ type: SubmitOnboardingFormDto })
  @ApiCreatedResponse({ type: OnboardingFormResponseDto })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubmitOnboardingFormDto,
  ): Promise<OnboardingFormResponseDto> {
    return this.onboarding.submitForm(user, body);
  }

  @Get()
  @ApiOperation({
    summary: 'Read the saved onboarding form',
    description: 'Returns the latest form stored for the signed-in account.',
  })
  @ApiOkResponse({ type: OnboardingFormResponseDto })
  latest(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OnboardingFormResponseDto> {
    return this.onboarding.latestForm(user);
  }
}
