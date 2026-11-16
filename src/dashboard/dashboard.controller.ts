import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { DashboardService } from './dashboard.service.js';
import { HomeDto, ProgressDto, SkinReportDto } from './dto/dashboard.dto.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('home')
  @ApiOperation({
    summary: 'Home: greeting, today\'s morning routine, empty scores',
    description: 'Scores stay empty until a validated assessment exists.',
  })
  @ApiOkResponse({ type: HomeDto })
  home(@CurrentUser() user: AuthenticatedUser): Promise<HomeDto> {
    return this.dashboard.home(user);
  }

  @Get('progress')
  @ApiOperation({ summary: 'Next scan date. "What changed" stays empty.' })
  @ApiOkResponse({ type: ProgressDto })
  progress(@CurrentUser() user: AuthenticatedUser): Promise<ProgressDto> {
    return this.dashboard.progress(user);
  }

  @Get('skin-report')
  @ApiOperation({ summary: 'Step counts and null trend fields' })
  @ApiOkResponse({ type: SkinReportDto })
  skinReport(@CurrentUser() user: AuthenticatedUser): Promise<SkinReportDto> {
    return this.dashboard.skinReport(user);
  }
}
