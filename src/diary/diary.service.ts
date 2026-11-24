import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { UsersService } from '../users/users.service.js';
import { DiaryRepository, DiaryRow } from './diary.repository.js';
import { DiaryEntryDto, DiaryListDto, DiarySummaryDto, SaveDiaryEntryDto } from './dto/diary.dto.js';

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 92;

/** Shown with any entry that reports a severe reaction. Clara suggests products; it does not treat reactions. */
export const SEVERE_REACTION_ADVICE =
  'Stop using any new or recently changed product. If you have swelling, blistering, burning that does not ease, or trouble breathing, get medical help now. Otherwise, please see a doctor or dermatologist before using it again.';

/** Parses YYYY-MM-DD as a calendar day (UTC midnight), refusing impossible dates like 2026-02-30. */
export function parseDay(value: string, field = 'date'): number {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new ApiException(400, ErrorCode.VALIDATION_ERROR, `${field} must be a real date as YYYY-MM-DD.`);
  }
  return time;
}

const dayString = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Days in a row with an entry, ending today, or yesterday when today is not logged yet. Dates are newest first. */
export function streak(dates: string[], today: string): number {
  const logged = new Set(dates);
  let day = parseDay(today);
  if (!logged.has(today)) {
    day -= DAY_MS;
  }
  let count = 0;
  while (logged.has(dayString(day))) {
    count += 1;
    day -= DAY_MS;
  }
  return count;
}

@Injectable()
export class DiaryService {
  constructor(
    private readonly users: UsersService,
    private readonly repo: DiaryRepository,
  ) {}

  async list(user: AuthenticatedUser, from: string, to: string): Promise<DiaryListDto> {
    const start = parseDay(from, 'from');
    const end = parseDay(to, 'to');
    if (end < start || (end - start) / DAY_MS >= MAX_RANGE_DAYS) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, `Ask for 1 to ${MAX_RANGE_DAYS} days, with from on or before to.`);
    }
    await this.users.getMe(user);
    const rows = await this.repo.list(user.id, from, to);
    return { items: rows.map(present) };
  }

  async get(user: AuthenticatedUser, date: string): Promise<DiaryEntryDto> {
    parseDay(date);
    const row = await this.repo.find(user.id, date);
    if (!row) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'No diary entry for that day.');
    }
    return present(row);
  }

  async save(user: AuthenticatedUser, date: string, body: SaveDiaryEntryDto, now = new Date()): Promise<DiaryEntryDto> {
    const day = parseDay(date);
    // The phone may be a day ahead of the server (time zones), never more.
    if (day > now.getTime() + DAY_MS) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'You can not write a diary entry for a future day.');
    }
    if (day < now.getTime() - 366 * DAY_MS) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Diary entries can be added or changed for up to a year back.');
    }
    await this.users.getMe(user);
    return present(await this.repo.save(user.id, date, body));
  }

  async remove(user: AuthenticatedUser, date: string): Promise<void> {
    parseDay(date);
    if (!(await this.repo.remove(user.id, date))) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'No diary entry for that day.');
    }
  }

  async summary(user: AuthenticatedUser, today: string): Promise<DiarySummaryDto> {
    const todayTime = parseDay(today, 'today');
    await this.users.getMe(user);
    const rows = await this.repo.recentDates(user.id, today);
    const weekStart = dayString(todayTime - 6 * DAY_MS);
    const week = rows.filter((row) => row.entry_date >= weekStart);
    const feels = week.map((row) => row.skin_feel).filter((feel): feel is number => feel !== null);
    return {
      today_logged: rows[0]?.entry_date === today,
      streak_days: streak(rows.map((row) => row.entry_date), today),
      entries_last_7_days: week.length,
      average_feel_last_7_days: feels.length ? Math.round((feels.reduce((a, b) => a + b, 0) / feels.length) * 10) / 10 : null,
      last_entry_date: rows[0]?.entry_date ?? null,
    };
  }
}

function present(row: DiaryRow): DiaryEntryDto {
  return {
    date: row.entry_date,
    skin_feel: row.skin_feel,
    concerns: row.concerns,
    concern_levels: row.concern_levels ?? {},
    morning_routine_done: row.morning_routine_done,
    evening_routine_done: row.evening_routine_done,
    new_products: row.new_products,
    reaction: row.reaction,
    reaction_note: row.reaction_note,
    notes: row.notes,
    advice: row.reaction === 'severe' ? SEVERE_REACTION_ADVICE : null,
    updated_at: row.updated_at.toISOString(),
  };
}
