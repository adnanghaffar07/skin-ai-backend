import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';

export interface StepRow extends QueryResultRow {
  routine_id: string;
  routine_date: string;
  step_id: string;
  period: 'morning' | 'evening';
  position: number;
  step_type: string;
  title: string;
  product_id: string | null;
  product_name: string | null;
  duration_label: string | null;
  amount_label: string | null;
  instruction: string | null;
  completed: boolean;
}

@Injectable()
export class RoutinesRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Steps of the active routine with today's completion flag (database date, UTC). */
  currentSteps(userId: string): Promise<StepRow[]> {
    return this.database.query<StepRow>(
      `
      select r.id as routine_id, r.routine_date::text as routine_date,
             s.id as step_id, s.period::text as period, s.position, s.step_type::text as step_type,
             s.title, s.product_id, p.name as product_name,
             s.duration_label, s.amount_label, s.instruction,
             exists (
               select 1 from public.routine_step_completions c
               where c.step_id = s.id and c.completed_on = current_date
             ) as completed
      from public.skincare_routines r
      left join public.skincare_routine_steps s on s.routine_id = r.id
      left join public.products p on p.id = s.product_id
      where r.user_id = $1 and r.status = 'active'
      order by s.period, s.position
      `,
      [userId],
    );
  }

  /** True when the step belongs to the user's active routine. */
  async ownsActiveStep(userId: string, stepId: string): Promise<boolean> {
    const rows = await this.database.query(
      `select 1 from public.skincare_routine_steps s
       join public.skincare_routines r on r.id = s.routine_id
       where s.id = $1 and r.user_id = $2 and r.status = 'active'`,
      [stepId, userId],
    );
    return rows.length > 0;
  }

  async complete(userId: string, stepId: string): Promise<void> {
    await this.database.query(
      `insert into public.routine_step_completions (step_id, user_id, completed_on)
       values ($1, $2, current_date)
       on conflict (step_id, completed_on) do nothing`,
      [stepId, userId],
    );
  }
}
