import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  PreferencesResponseDto,
  UpdatePreferencesDto,
} from './dto/preferences.dto.js';
import { PreferencesService } from './preferences.service.js';

const example = {
  goal_codes: ['hydration', 'calm_redness', 'even_tone', 'clearer_skin'],
  avoid_codes: ['fragrance', 'retinol', 'essential_oils'],
  morning_time: '08:00',
  evening_time: '21:00',
  next_scan_on: '2026-10-28',
  primary_goal: 'improve_hydration',
  monthly_budget_band: '20_50',
  category_codes: ['serums', 'sunscreens'],
};

@ApiTags('Preferences')
@ApiBearerAuth()
@Controller('me')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Load skin preferences' })
  @ApiOkResponse({ type: PreferencesResponseDto, example })
  get(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PreferencesResponseDto> {
    return this.preferences.get(user);
  }

  @Put('preferences')
  @ApiOperation({
    summary: 'Save skin preferences',
    description:
      'Replaces the extra goals and the avoid-list. This does not change questionnaire history. Unknown codes are rejected.',
  })
  @ApiBody({ type: UpdatePreferencesDto })
  @ApiOkResponse({ type: PreferencesResponseDto, example })
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdatePreferencesDto,
  ): Promise<PreferencesResponseDto> {
    return this.preferences.replace(user, body);
  }
}
