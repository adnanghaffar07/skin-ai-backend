import { describe, expect, it, vi } from 'vitest';
import type { UsersService } from '../users/users.service.js';
import type { RoutinesRepository, StepRow } from './routines.repository.js';
import { routineDay, RoutinesService, toRoutine } from './routines.service.js';

const user = { id: 'u1', email: null, displayName: null };
const step = (over: Partial<StepRow>): StepRow => ({
  routine_id: 'r1',
  routine_date: '2026-11-11',
  step_id: 's1',
  period: 'morning',
  position: 1,
  step_type: 'cleanse',
  title: 'Cleanse',
  product_id: 'p1',
  product_name: 'Gentle Cleanser',
  duration_label: '1 min',
  amount_label: null,
  instruction: null,
  completed: false,
  ...over,
});

describe('toRoutine', () => {
  it('is empty when there is no active routine', () => {
    expect(toRoutine([])).toMatchObject({ routine_id: null, step_count: 0, morning: [], evening: [] });
  });
  it('splits periods and counts today\'s completions', () => {
    const out = toRoutine([
      step({ step_id: 'a', completed: true }),
      step({ step_id: 'b', period: 'evening' }),
    ]);
    expect(out.morning).toHaveLength(1);
    expect(out.evening).toHaveLength(1);
    expect(out).toMatchObject({ completed_count: 1, step_count: 2 });
  });
});

describe('RoutinesService.complete', () => {
  const build = (owns: boolean) => {
    const repo = {
      ownsActiveStep: vi.fn().mockResolvedValue(owns),
      complete: vi.fn().mockResolvedValue(undefined),
      uncomplete: vi.fn().mockResolvedValue(undefined),
      currentSteps: vi.fn().mockResolvedValue([step({ completed: true })]),
    };
    const users = { getMe: vi.fn().mockResolvedValue({}) };
    return {
      repo,
      service: new RoutinesService(users as unknown as UsersService, repo as unknown as RoutinesRepository),
    };
  };
  it('404s for a step that is not in the caller\'s active routine', async () => {
    const { service, repo } = build(false);
    await expect(service.complete(user, 's1')).rejects.toMatchObject({ status: 404 });
    expect(repo.complete).not.toHaveBeenCalled();
  });
  it('records the completion and returns counts', async () => {
    const { service } = build(true);
    expect(await service.complete(user, 's1')).toEqual({ step_id: 's1', completed_count: 1, step_count: 1 });
  });
});

describe('routineDay', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  it('means the server\'s today when no day is given', () => {
    expect(routineDay(undefined, now)).toBeNull();
    expect(routineDay('', now)).toBeNull();
  });
  it('accepts the person\'s own day, a day ahead of the server at most', () => {
    expect(routineDay('2026-11-24', now)).toBe('2026-11-24');
    expect(routineDay('2026-11-01', now)).toBe('2026-11-01');
    expect(() => routineDay('2026-11-26', now)).toThrow(/future/);
  });
  it('refuses impossible dates and days more than a year back', () => {
    expect(() => routineDay('2026-02-30', now)).toThrow(/real date/);
    expect(() => routineDay('2025-11-01', now)).toThrow(/year back/);
  });
});

describe('RoutinesService day-aware ticks', () => {
  const build = () => {
    const repo = {
      ownsActiveStep: vi.fn().mockResolvedValue(true),
      complete: vi.fn().mockResolvedValue(undefined),
      uncomplete: vi.fn().mockResolvedValue(undefined),
      currentSteps: vi.fn().mockResolvedValue([step({ completed: false })]),
    };
    const users = { getMe: vi.fn().mockResolvedValue({}) };
    return { repo, service: new RoutinesService(users as unknown as UsersService, repo as unknown as RoutinesRepository) };
  };
  const today = new Date().toISOString().slice(0, 10);
  it('ticks and reads back the given day', async () => {
    const { service, repo } = build();
    await service.complete(user, 's1', today);
    expect(repo.complete).toHaveBeenCalledWith('u1', 's1', today);
    expect(repo.currentSteps).toHaveBeenCalledWith('u1', today);
  });
  it('undoes a tick for the given day', async () => {
    const { service, repo } = build();
    expect(await service.uncomplete(user, 's1', today)).toEqual({ step_id: 's1', completed_count: 0, step_count: 1 });
    expect(repo.uncomplete).toHaveBeenCalledWith('u1', 's1', today);
    expect(repo.complete).not.toHaveBeenCalled();
  });
  it('checks the day before touching anything', async () => {
    const { service, repo } = build();
    await expect(service.complete(user, 's1', 'not-a-day')).rejects.toMatchObject({ status: 400 });
    expect(repo.ownsActiveStep).not.toHaveBeenCalled();
  });
});
