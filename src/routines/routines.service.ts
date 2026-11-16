import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { UsersService } from '../users/users.service.js';
import type {
  RoutineDto,
  RoutineStepDto,
  StepCompletionDto,
} from './dto/routine.dto.js';
import { RoutinesRepository, type StepRow } from './routines.repository.js';

export function toRoutine(rows: StepRow[]): RoutineDto {
  if (rows.length === 0) {
    return {
      routine_id: null,
      routine_date: null,
      completed_count: 0,
      step_count: 0,
      morning: [],
      evening: [],
    };
  }
  const steps = rows.filter((row) => row.step_id !== null);
  const toStep = (row: StepRow): RoutineStepDto => ({
    step_id: row.step_id,
    position: row.position,
    step_type: row.step_type,
    title: row.title,
    product_id: row.product_id,
    product_name: row.product_name,
    duration_label: row.duration_label,
    amount_label: row.amount_label,
    instruction: row.instruction,
    completed: row.completed,
  });
  return {
    routine_id: rows[0].routine_id,
    routine_date: rows[0].routine_date,
    completed_count: steps.filter((row) => row.completed).length,
    step_count: steps.length,
    morning: steps.filter((row) => row.period === 'morning').map(toStep),
    evening: steps.filter((row) => row.period === 'evening').map(toStep),
  };
}

@Injectable()
export class RoutinesService {
  constructor(
    private readonly users: UsersService,
    private readonly routines: RoutinesRepository,
  ) {}

  async current(user: AuthenticatedUser): Promise<RoutineDto> {
    await this.users.getMe(user);
    return toRoutine(await this.routines.currentSteps(user.id));
  }

  async complete(
    user: AuthenticatedUser,
    stepId: string,
  ): Promise<StepCompletionDto> {
    await this.users.getMe(user);
    if (!(await this.routines.ownsActiveStep(user.id, stepId))) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Routine step not found.');
    }
    await this.routines.complete(user.id, stepId);
    const routine = toRoutine(await this.routines.currentSteps(user.id));
    return {
      step_id: stepId,
      completed_count: routine.completed_count,
      step_count: routine.step_count,
    };
  }
}
