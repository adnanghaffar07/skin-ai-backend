import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { RoutineDto, StepCompletionDto } from './dto/routine.dto.js';
import { RoutinesService } from './routines.service.js';

const DATE_QUERY = {
  name: 'date',
  required: false,
  description: 'YYYY-MM-DD, the person\'s own calendar day. Up to a day ahead of the server and a year back. Default: the server\'s today (UTC).',
};

@ApiTags('Routines')
@ApiBearerAuth()
@Controller('routines')
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get('current')
  @ApiOperation({
    summary: 'Morning and evening steps from the catalog',
    description: 'Empty lists until a recommendation has been created. `completed` is for `date` (the person\'s own day), or the server\'s today.',
  })
  @ApiQuery(DATE_QUERY)
  @ApiOkResponse({ type: RoutineDto })
  current(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string): Promise<RoutineDto> {
    return this.routines.current(user, date);
  }

  @Post('current/steps/:stepId/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark one step done for a day',
    description: 'Idempotent per step and date. Returns the updated counts for that day.',
  })
  @ApiQuery(DATE_QUERY)
  @ApiOkResponse({ type: StepCompletionDto })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Query('date') date?: string,
  ): Promise<StepCompletionDto> {
    return this.routines.complete(user, stepId, date);
  }

  @Delete('current/steps/:stepId/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Undo a step marked done for a day',
    description: 'Idempotent: undoing a step that was not done changes nothing. Returns the updated counts for that day.',
  })
  @ApiQuery(DATE_QUERY)
  @ApiOkResponse({ type: StepCompletionDto })
  uncomplete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Query('date') date?: string,
  ): Promise<StepCompletionDto> {
    return this.routines.uncomplete(user, stepId, date);
  }
}
