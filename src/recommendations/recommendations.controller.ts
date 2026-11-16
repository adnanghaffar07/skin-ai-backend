import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  CreateRecommendationDto,
  RecommendationDto,
} from './dto/recommendation.dto.js';
import { RecommendationsService } from './recommendations.service.js';

@ApiTags('Recommendations')
@ApiBearerAuth()
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Build a self-reported product plan',
    description:
      'Uses saved answers, preferences and the catalog. No photo score and no AI wording. Also builds the active routine. The same Idempotency-Key returns the original plan.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: RecommendationDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreateRecommendationDto,
  ): Promise<RecommendationDto> {
    return this.recommendations.create(user, key, body);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Latest plan. The scan snapshot stays null.' })
  @ApiOkResponse({ type: RecommendationDto })
  latest(@CurrentUser() user: AuthenticatedUser): Promise<RecommendationDto> {
    return this.recommendations.latest(user);
  }
}
