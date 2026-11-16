import { describe, expect, it, vi } from 'vitest';
import type { RoutinesService } from '../routines/routines.service.js';
import type { UsersService } from '../users/users.service.js';
import type { DashboardRepository } from './dashboard.repository.js';
import { DashboardService, firstName } from './dashboard.service.js';

const user = { id: 'u1', email: null, displayName: null };

function build(scores: { captured_on: string; overall_score: number | null }[] = []) {
  return new DashboardService(
    { getMe: vi.fn().mockResolvedValue({ display_name: 'Amelia Rose' }) } as unknown as UsersService,
    {
      current: vi.fn().mockResolvedValue({
        morning: [{ completed: true }, { completed: false }],
        evening: [{ completed: false }],
      }),
    } as unknown as RoutinesService,
    {
      recentScores: vi.fn().mockResolvedValue(scores),
      nextScanOn: vi.fn().mockResolvedValue('2026-11-18'),
    } as unknown as DashboardRepository,
  );
}

describe('DashboardService', () => {
  it('greets by first name', () => {
    expect(firstName('Amelia Rose')).toBe('Amelia');
    expect(firstName(null)).toBeNull();
    expect(firstName('  ')).toBeNull();
  });
  it('home keeps scan and scores empty and counts morning steps', async () => {
    const home = await build().home(user);
    expect(home).toMatchObject({
      greeting_name: 'Amelia',
      latest_scan: null,
      focus: null,
      recent_scores: [],
      morning_routine: { completed_count: 1, step_count: 2 },
    });
  });
  it('progress has no changes and a null score without entries', async () => {
    expect(await build().progress(user)).toEqual({
      next_scan_on: '2026-11-18',
      latest: null,
      previous: null,
      overall_score: null,
      changes: [],
    });
  });
  it('skin report counts steps and leaves trends null', async () => {
    expect(await build().skinReport(user)).toMatchObject({
      morning_step_count: 2,
      evening_step_count: 1,
      hydration: null,
    });
  });
});
