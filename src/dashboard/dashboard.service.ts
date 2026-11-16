import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { RoutinesService } from '../routines/routines.service.js';
import { UsersService } from '../users/users.service.js';
import { DashboardRepository } from './dashboard.repository.js';
import type { HomeDto, ProgressDto, SkinReportDto } from './dto/dashboard.dto.js';

export function firstName(displayName: string | null): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/**
 * Read-only views. Scores, "what changed" and trends stay empty on purpose until
 * a validated assessment exists (Phase 2).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly users: UsersService,
    private readonly routines: RoutinesService,
    private readonly dashboard: DashboardRepository,
  ) {}

  async home(user: AuthenticatedUser): Promise<HomeDto> {
    const me = await this.users.getMe(user);
    const routine = await this.routines.current(user);
    const steps = routine.morning;
    return {
      greeting_name: firstName(me.display_name),
      latest_scan: null,
      focus: null,
      morning_routine: {
        completed_count: steps.filter((step) => step.completed).length,
        step_count: steps.length,
        steps,
      },
      week: [],
      recent_scores: await this.dashboard.recentScores(user.id, 7),
    };
  }

  async progress(user: AuthenticatedUser): Promise<ProgressDto> {
    await this.users.getMe(user);
    const [latest, previous] = await this.dashboard.recentScores(user.id, 2);
    return {
      next_scan_on: await this.dashboard.nextScanOn(user.id),
      latest: latest ?? null,
      previous: previous ?? null,
      overall_score: latest?.overall_score ?? null,
      changes: [],
    };
  }

  async skinReport(user: AuthenticatedUser): Promise<SkinReportDto> {
    const me = await this.users.getMe(user);
    const routine = await this.routines.current(user);
    return {
      name: me.display_name,
      morning_step_count: routine.morning.length,
      evening_step_count: routine.evening.length,
      hydration: null,
      redness: null,
      uneven_tone: null,
    };
  }
}
