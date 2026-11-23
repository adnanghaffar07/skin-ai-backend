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
import { parseDay } from '../diary/diary.service.js';
import { RoutinesRepository, type StepRow } from './routines.repository.js';

const DAY_MS = 86_400_000;

/**
 * The person's own calendar day (YYYY-MM-DD), checked like a diary date: the phone may be a day ahead of the server
 * (time zones), never more, and a forgotten tick can be added up to a year back. No day means the server's today.
 */
export function routineDay(date: string | undefined, now = new Date()): string | null {
  if (date === undefined || date === '') {
    return null;
  }
  const day = parseDay(date);
  if (day > now.getTime() + DAY_MS) {
    throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'You can not tick a routine step for a future day.');
  }
  if (day < now.getTime() - 366 * DAY_MS) {
    throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Routine steps can be ticked for up to a year back.');
  }
  return date;
}

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

  async current(user: AuthenticatedUser, date?: string): Promise<RoutineDto> {
    const day = routineDay(date);
    await this.users.getMe(user);
    return toRoutine(await this.routines.currentSteps(user.id, day));
  }

  complete(user: AuthenticatedUser, stepId: string, date?: string): Promise<StepCompletionDto> {
    return this.mark(user, stepId, date, true);
  }

  uncomplete(user: AuthenticatedUser, stepId: string, date?: string): Promise<StepCompletionDto> {
    return this.mark(user, stepId, date, false);
  }

  private async mark(
    user: AuthenticatedUser,
    stepId: string,
    date: string | undefined,
    done: boolean,
  ): Promise<StepCompletionDto> {
    const day = routineDay(date);
    await this.users.getMe(user);
    if (!(await this.routines.ownsActiveStep(user.id, stepId))) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Routine step not found.');
    }
    if (done) {
      await this.routines.complete(user.id, stepId, day);
    } else {
      await this.routines.uncomplete(user.id, stepId, day);
    }
    const routine = toRoutine(await this.routines.currentSteps(user.id, day));
    return {
      step_id: stepId,
      completed_count: routine.completed_count,
      step_count: routine.step_count,
    };
  }
}
