import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { ScoreEntryDto } from './dto/dashboard.dto.js';

interface ScoreRow extends QueryResultRow {
  captured_on: string;
  overall_score: number | null;
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly database: DatabaseService) {}

  recentScores(userId: string, limit: number): Promise<ScoreEntryDto[]> {
    return this.database.query<ScoreRow>(
      `select captured_on::text as captured_on, overall_score
       from public.progress_entries where user_id = $1
       order by captured_on desc, created_at desc limit $2`,
      [userId, limit],
    );
  }

  async nextScanOn(userId: string): Promise<string | null> {
    const rows = await this.database.query<{ next_scan_on: string | null }>(
      `select next_scan_on::text as next_scan_on from public.user_preferences where user_id = $1`,
      [userId],
    );
    return rows[0]?.next_scan_on ?? null;
  }
}
