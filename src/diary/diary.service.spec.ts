import { describe, expect, it, vi } from 'vitest';
import type { UsersService } from '../users/users.service.js';
import type { DiaryRepository, DiaryRow } from './diary.repository.js';
import { DiaryService, SEVERE_REACTION_ADVICE, parseDay, streak } from './diary.service.js';

const user = { id: 'u1', email: null, displayName: null };
const NOW = new Date('2026-11-20T12:00:00Z');

const row = (over: Partial<DiaryRow> = {}): DiaryRow => ({
  entry_date: '2026-11-20',
  skin_feel: 4,
  concerns: ['dryness_dehydration'],
  morning_routine_done: true,
  evening_routine_done: null,
  new_products: null,
  reaction: 'none',
  reaction_note: null,
  notes: null,
  updated_at: NOW,
  ...over,
});

function build(repo: Partial<Record<keyof DiaryRepository, unknown>> = {}) {
  const repository = {
    list: vi.fn().mockResolvedValue([row()]),
    find: vi.fn().mockResolvedValue(row()),
    save: vi.fn().mockResolvedValue(row()),
    remove: vi.fn().mockResolvedValue(true),
    recentDates: vi.fn().mockResolvedValue([]),
    ...repo,
  };
  const service = new DiaryService({ getMe: vi.fn().mockResolvedValue({}) } as unknown as UsersService, repository as unknown as DiaryRepository);
  return { service, repository };
}

describe('diary dates', () => {
  it('refuses impossible dates', () => {
    expect(() => parseDay('2026-02-30')).toThrow();
    expect(() => parseDay('20-11-2026')).toThrow();
    expect(parseDay('2026-11-20')).toBe(Date.parse('2026-11-20T00:00:00Z'));
  });

  it('counts the streak up to today, or up to yesterday when today is not logged yet', () => {
    expect(streak(['2026-11-20', '2026-11-19', '2026-11-18', '2026-11-15'], '2026-11-20')).toBe(3);
    expect(streak(['2026-11-19', '2026-11-18'], '2026-11-20')).toBe(2);
    expect(streak(['2026-11-17'], '2026-11-20')).toBe(0);
    expect(streak(['2026-03-01', '2026-02-28'], '2026-03-01')).toBe(2);
  });
});

describe('DiaryService', () => {
  it('saves a day and shows professional-care advice only for a severe reaction', async () => {
    const calm = await build().service.save(user, '2026-11-20', { skin_feel: 4 }, NOW);
    expect(calm.advice).toBeNull();
    const severe = build({ save: vi.fn().mockResolvedValue(row({ reaction: 'severe', reaction_note: 'Swelling' })) });
    const saved = await severe.service.save(user, '2026-11-20', { reaction: 'severe', reaction_note: 'Swelling' }, NOW);
    expect(saved.advice).toBe(SEVERE_REACTION_ADVICE);
    expect(severe.repository.save).toHaveBeenCalledWith('u1', '2026-11-20', expect.objectContaining({ reaction: 'severe' }));
  });

  it('allows tomorrow (phone time zones) but not later, and up to a year back', async () => {
    const { service } = build();
    await expect(service.save(user, '2026-11-21', {}, NOW)).resolves.toBeDefined();
    await expect(service.save(user, '2026-11-23', {}, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(service.save(user, '2025-11-01', {}, NOW)).rejects.toMatchObject({ status: 400 });
  });

  it('limits the list to 92 days', async () => {
    const { service } = build();
    await expect(service.list(user, '2026-08-01', '2026-11-20')).rejects.toMatchObject({ status: 400 });
    await expect(service.list(user, '2026-11-20', '2026-11-01')).rejects.toMatchObject({ status: 400 });
    expect((await service.list(user, '2026-11-01', '2026-11-20')).items[0]!.date).toBe('2026-11-20');
  });

  it('answers 404 for a day without an entry', async () => {
    await expect(build({ find: vi.fn().mockResolvedValue(null) }).service.get(user, '2026-11-20')).rejects.toMatchObject({ status: 404 });
    await expect(build({ remove: vi.fn().mockResolvedValue(false) }).service.remove(user, '2026-11-20')).rejects.toMatchObject({ status: 404 });
  });

  it('summarises today, the streak and the last 7 days for the dashboard', async () => {
    const { service } = build({
      recentDates: vi.fn().mockResolvedValue([
        { entry_date: '2026-11-19', skin_feel: 3 },
        { entry_date: '2026-11-18', skin_feel: 4 },
        { entry_date: '2026-11-14', skin_feel: null },
        { entry_date: '2026-11-10', skin_feel: 1 },
      ]),
    });
    expect(await service.summary(user, '2026-11-20')).toEqual({
      today_logged: false,
      streak_days: 2,
      entries_last_7_days: 3,
      average_feel_last_7_days: 3.5,
      last_entry_date: '2026-11-19',
    });
  });
});
