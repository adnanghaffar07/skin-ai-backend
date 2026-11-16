import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RoutineDto, StepCompletionDto } from './dto/routine.dto.js';
import { RoutinesService } from './routines.service.js';

@ApiTags('Routines')
@ApiBearerAuth()
@Controller('routines')
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get('current')
  @ApiOperation({
    summary: 'Morning and evening steps from the catalog',
    description: 'Empty lists until a recommendation has been created.',
  })
  @ApiOkResponse({ type: RoutineDto })
  current(@CurrentUser() user: AuthenticatedUser): Promise<RoutineDto> {
    return this.routines.current(user);
  }

  @Post('current/steps/:stepId/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark one step done for today',
    description: 'Idempotent per step and date. Returns the updated counts.',
  })
  @ApiOkResponse({ type: StepCompletionDto })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId', ParseUUIDPipe) stepId: string,
  ): Promise<StepCompletionDto> {
    return this.routines.complete(user, stepId);
  }
}
