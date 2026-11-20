import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { SaveDiaryEntryDto } from './dto/diary.dto.js';

export interface DiaryRow extends QueryResultRow {
  entry_date: string;
  skin_feel: number | null;
  concerns: string[];
  morning_routine_done: boolean | null;
  evening_routine_done: boolean | null;
  new_products: string | null;
  reaction: string | null;
  reaction_note: string | null;
  notes: string | null;
  updated_at: Date;
}

// entry_date goes out as text so the day never shifts with the server's time zone.
const COLUMNS = `to_char(entry_date, 'YYYY-MM-DD') as entry_date, skin_feel, concerns, morning_routine_done,
  evening_routine_done, new_products, reaction::text as reaction, reaction_note, notes, updated_at`;

@Injectable()
export class DiaryRepository {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string, from: string, to: string): Promise<DiaryRow[]> {
    return this.database.query<DiaryRow>(
      `select ${COLUMNS} from public.diary_entries
       where user_id = $1 and entry_date between $2::date and $3::date
       order by entry_date desc`,
      [userId, from, to],
    );
  }

  async find(userId: string, date: string): Promise<DiaryRow | null> {
    const rows = await this.database.query<DiaryRow>(
      `select ${COLUMNS} from public.diary_entries where user_id = $1 and entry_date = $2::date`,
      [userId, date],
    );
    return rows[0] ?? null;
  }

  /** Saves the whole day: fields left out of the body are cleared, so the app always sends the full entry. */
  async save(userId: string, date: string, entry: SaveDiaryEntryDto): Promise<DiaryRow> {
    const rows = await this.database.query<DiaryRow>(
      `
      insert into public.diary_entries
        (user_id, entry_date, skin_feel, concerns, morning_routine_done, evening_routine_done,
         new_products, reaction, reaction_note, notes)
      values ($1, $2::date, $3, $4::text[], $5, $6, $7, $8::public.diary_reaction, $9, $10)
      on conflict (user_id, entry_date) do update set
        skin_feel = excluded.skin_feel,
        concerns = excluded.concerns,
        morning_routine_done = excluded.morning_routine_done,
        evening_routine_done = excluded.evening_routine_done,
        new_products = excluded.new_products,
        reaction = excluded.reaction,
        reaction_note = excluded.reaction_note,
        notes = excluded.notes,
        updated_at = now()
      returning ${COLUMNS}
      `,
      [
        userId,
        date,
        entry.skin_feel ?? null,
        entry.concerns ?? [],
        entry.morning_routine_done ?? null,
        entry.evening_routine_done ?? null,
        entry.new_products ?? null,
        entry.reaction ?? null,
        entry.reaction && entry.reaction !== 'none' ? (entry.reaction_note ?? null) : null,
        entry.notes ?? null,
      ],
    );
    return rows[0]!;
  }

  async remove(userId: string, date: string): Promise<boolean> {
    const rows = await this.database.query(
      `delete from public.diary_entries where user_id = $1 and entry_date = $2::date returning id`,
      [userId, date],
    );
    return rows.length > 0;
  }

  /** Entry dates from the last year, newest first: enough to count any realistic streak. */
  async recentDates(userId: string, today: string): Promise<{ entry_date: string; skin_feel: number | null }[]> {
    return this.database.query(
      `select to_char(entry_date, 'YYYY-MM-DD') as entry_date, skin_feel from public.diary_entries
       where user_id = $1 and entry_date <= $2::date and entry_date > $2::date - 366
       order by entry_date desc`,
      [userId, today],
    );
  }
}
