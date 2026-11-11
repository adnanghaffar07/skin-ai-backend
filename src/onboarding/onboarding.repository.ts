import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import type { Queryable } from '../database/database.service.js';
import { DatabaseService } from '../database/database.service.js';
import type {
  ActiveQuestionnaireDto,
  QuestionnaireQuestionDto,
} from './dto/onboarding.dto.js';

interface DefinitionRow extends QueryResultRow {
  id: string;
  key: string;
  version: number;
  locale: string;
  title: string;
  question_id: string;
  question_key: string;
  position: number;
  prompt: string;
  help_text: string | null;
  selection_mode: string;
  required: boolean;
  min_selections: number | null;
  max_selections: number | null;
  option_code: string;
  option_label: string;
  option_position: number;
}

export interface ActiveDefinition {
  id: string;
  key: string;
  version: number;
}

export interface StoredSession {
  id: string;
  userId: string | null;
  status: string;
  expiresAt: Date;
  submissionId: string;
  submissionStatus: string;
}

export interface StoredSubmission {
  id: string;
  definitionId: string;
  sessionId: string;
  userId: string | null;
  status: string;
  version: number;
  expiresAt: Date;
}

export interface StoredQuestion {
  id: string;
  key: string;
  selectionMode: string;
  minSelections: number | null;
  maxSelections: number | null;
  allowedCodes: string[];
}

interface QuestionProgress {
  key: string;
  required: boolean;
}

@Injectable()
export class OnboardingRepository {
  constructor(private readonly database: DatabaseService) {}

  async getActiveQuestionnaire(): Promise<ActiveQuestionnaireDto | null> {
    const rows = await this.database.query<DefinitionRow>(
      `
      select
        d.id, d.key, d.version, d.locale, d.title,
        q.id as question_id, q.key as question_key, q.position, q.prompt, q.help_text,
        q.selection_mode::text as selection_mode, q.required, q.min_selections, q.max_selections,
        o.code as option_code, o.label as option_label, o.position as option_position
      from public.questionnaire_definitions d
      join public.questionnaire_questions q on q.definition_id = d.id
      join public.questionnaire_options o on o.question_id = q.id
      where d.key = 'onboarding' and d.status = 'active'
      order by q.position, o.position
      `,
    );
    if (rows.length === 0) {
      return null;
    }
    const questions = new Map<string, QuestionnaireQuestionDto>();
    for (const row of rows) {
      let question = questions.get(row.question_id);
      if (!question) {
        question = {
          key: row.question_key,
          position: row.position,
          prompt: row.prompt,
          help_text: row.help_text,
          selection_mode: row.selection_mode,
          required: row.required,
          min_selections: row.min_selections,
          max_selections: row.max_selections,
          options: [],
        };
        questions.set(row.question_id, question);
      }
      question.options.push({
        code: row.option_code,
        label: row.option_label,
        position: row.option_position,
      });
    }
    const first = rows[0];
    return {
      id: first.id,
      key: first.key,
      version: first.version,
      locale: first.locale,
      title: first.title,
      questions: [...questions.values()],
    };
  }

  async getActiveDefinition(): Promise<ActiveDefinition | null> {
    const rows = await this.database.query<ActiveDefinition & QueryResultRow>(
      `
      select id, key, version
      from public.questionnaire_definitions
      where key = 'onboarding' and status = 'active'
      `,
    );
    return rows[0] ?? null;
  }

  async createSession(input: {
    userId: string | null;
    claimHash: string | null;
    definitionId: string;
    version: number;
  }): Promise<{ sessionId: string; submissionId: string }> {
    return this.database.transaction(async (db) => {
      const sessions = await db.query<{ id: string }>(
        `
        insert into public.onboarding_sessions (user_id, claim_token_hash, expires_at)
        values ($1, $2, now() + interval '7 days')
        returning id
        `,
        [input.userId, input.claimHash],
      );
      const sessionId = sessions[0].id;
      const submissions = await db.query<{ id: string }>(
        `
        insert into public.questionnaire_submissions
          (definition_id, onboarding_session_id, user_id, definition_snapshot)
        values ($1, $2, $3, $4::jsonb)
        returning id
        `,
        [
          input.definitionId,
          sessionId,
          input.userId,
          JSON.stringify({ key: 'onboarding', version: input.version }),
        ],
      );
      return { sessionId, submissionId: submissions[0].id };
    });
  }

  async findSessionByHash(hash: string): Promise<StoredSession | null> {
    const rows = await this.database.query<SessionRow>(
      `
      select
        s.id, s.user_id, s.status::text as status, s.expires_at,
        q.id as submission_id, q.status::text as submission_status
      from public.onboarding_sessions s
      join public.questionnaire_submissions q on q.onboarding_session_id = s.id
      where s.claim_token_hash = $1
      order by q.created_at desc
      limit 1
      `,
      [hash],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async attachUser(sessionId: string, userId: string): Promise<void> {
    await this.database.transaction(async (db) => {
      await db.query(
        `
        update public.onboarding_sessions
        set user_id = $2, updated_at = now()
        where id = $1 and (user_id is null or user_id = $2)
        `,
        [sessionId, userId],
      );
      await db.query(
        `
        update public.questionnaire_submissions
        set user_id = $2, updated_at = now()
        where onboarding_session_id = $1 and (user_id is null or user_id = $2)
        `,
        [sessionId, userId],
      );
    });
  }

  async findSubmission(id: string): Promise<StoredSubmission | null> {
    const rows = await this.database.query<SubmissionRow>(
      `
      select
        q.id, q.definition_id, q.onboarding_session_id, q.user_id,
        q.status::text as status, d.version, s.expires_at
      from public.questionnaire_submissions q
      join public.questionnaire_definitions d on d.id = q.definition_id
      join public.onboarding_sessions s on s.id = q.onboarding_session_id
      where q.id = $1
      `,
      [id],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      definitionId: row.definition_id,
      sessionId: row.onboarding_session_id,
      userId: row.user_id,
      status: row.status,
      version: row.version,
      expiresAt: new Date(row.expires_at),
    };
  }

  async findLatestForUser(userId: string): Promise<StoredSubmission | null> {
    const rows = await this.database.query<{ id: string }>(
      `
      select id from public.questionnaire_submissions
      where user_id = $1
      order by created_at desc
      limit 1
      `,
      [userId],
    );
    return rows[0] ? this.findSubmission(rows[0].id) : null;
  }

  async findQuestion(
    definitionId: string,
    key: string,
  ): Promise<StoredQuestion | null> {
    const rows = await this.database.query<QuestionRow>(
      `
      select
        q.id, q.key, q.selection_mode::text as selection_mode,
        q.min_selections, q.max_selections,
        coalesce(json_agg(o.code order by o.position) filter (where o.id is not null), '[]'::json) as codes
      from public.questionnaire_questions q
      left join public.questionnaire_options o on o.question_id = q.id
      where q.definition_id = $1 and q.key = $2
      group by q.id
      `,
      [definitionId, key],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      key: row.key,
      selectionMode: row.selection_mode,
      minSelections: row.min_selections,
      maxSelections: row.max_selections,
      allowedCodes: row.codes ?? [],
    };
  }

  async replaceAnswers(
    submissionId: string,
    questionId: string,
    optionCodes: string[],
  ): Promise<void> {
    await this.database.transaction(async (db) => {
      await db.query(
        `
        delete from public.questionnaire_answers
        where submission_id = $1 and question_id = $2
        `,
        [submissionId, questionId],
      );
      if (optionCodes.length === 0) {
        return;
      }
      await db.query(
        `
        insert into public.questionnaire_answers (submission_id, question_id, option_id)
        select $1, $2, o.id
        from public.questionnaire_options o
        where o.question_id = $2 and o.code = any($3::varchar[])
        `,
        [submissionId, questionId, optionCodes],
      );
    });
  }

  async progress(definitionId: string, submissionId: string): Promise<{
    answered: string[];
    requiredRemaining: string[];
  }> {
    const questions = await this.database.query<QuestionProgress & QueryResultRow>(
      `
      select key, required
      from public.questionnaire_questions
      where definition_id = $1
      order by position
      `,
      [definitionId],
    );
    const answeredRows = await this.database.query<{ key: string }>(
      `
      select distinct q.key
      from public.questionnaire_answers a
      join public.questionnaire_questions q on q.id = a.question_id
      where a.submission_id = $1
      `,
      [submissionId],
    );
    const answered = answeredRows.map((row) => row.key);
    const answeredSet = new Set(answered);
    return {
      answered,
      requiredRemaining: questions
        .filter((question) => question.required && !answeredSet.has(question.key))
        .map((question) => question.key),
    };
  }

  async listAnswers(submissionId: string): Promise<Record<string, string[]>> {
    const rows = await this.database.query<{ key: string; code: string }>(
      `
      select q.key, o.code
      from public.questionnaire_answers a
      join public.questionnaire_questions q on q.id = a.question_id
      join public.questionnaire_options o on o.id = a.option_id
      where a.submission_id = $1
      order by q.position, o.position
      `,
      [submissionId],
    );
    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
      grouped[row.key] ??= [];
      grouped[row.key].push(row.code);
    }
    return grouped;
  }

  async markCompleted(
    db: Queryable,
    submissionId: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await db.query<{ id: string; onboarding_session_id: string }>(
      `
      update public.questionnaire_submissions
      set status = 'completed', completed_at = now(), user_id = $2, updated_at = now()
      where id = $1 and status = 'draft'
      returning id, onboarding_session_id
      `,
      [submissionId, userId],
    );
    const row = rows[0];
    if (!row) {
      return false;
    }
    await db.query(
      `
      update public.onboarding_sessions
      set status = 'completed', user_id = $2, updated_at = now()
      where id = $1
      `,
      [row.onboarding_session_id, userId],
    );
    return true;
  }

  async project(
    db: Queryable,
    userId: string,
    submissionId: string,
    answers: Record<string, string[]>,
  ): Promise<void> {
    const single = (key: string) => answers[key]?.[0] ?? null;
    const concerns = answers.skin_concerns ?? [];
    const categories = (answers.product_interests ?? []).filter(
      (code) => code !== 'recommend_for_me',
    );
    await db.query(
      `
      insert into public.skin_profiles (
        user_id, source_submission_id, age_range, self_reported_skin_type,
        sensitivity_level, current_routine_level, reaction_history
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (user_id) do update set
        source_submission_id = excluded.source_submission_id,
        age_range = excluded.age_range,
        self_reported_skin_type = excluded.self_reported_skin_type,
        sensitivity_level = excluded.sensitivity_level,
        current_routine_level = excluded.current_routine_level,
        reaction_history = excluded.reaction_history,
        updated_at = now()
      `,
      [
        userId,
        submissionId,
        single('age_range'),
        single('skin_type'),
        single('sensitivity_level'),
        single('current_routine'),
        single('reaction_history'),
      ],
    );
    await db.query(
      `delete from public.skin_profile_concerns where user_id = $1`,
      [userId],
    );
    if (concerns.length > 0) {
      await db.query(
        `
        insert into public.skin_profile_concerns (user_id, concern_code)
        select $1, code from unnest($2::varchar[]) as code
        `,
        [userId, concerns],
      );
    }
    await db.query(
      `
      insert into public.user_preferences (user_id, primary_goal, monthly_budget_band, source_submission_id)
      values ($1, $2, $3, $4)
      on conflict (user_id) do update set
        primary_goal = excluded.primary_goal,
        monthly_budget_band = excluded.monthly_budget_band,
        source_submission_id = excluded.source_submission_id,
        updated_at = now()
      `,
      [userId, single('primary_goal'), single('monthly_budget'), submissionId],
    );
    await db.query(
      `delete from public.user_preference_categories where user_id = $1`,
      [userId],
    );
    if (categories.length > 0) {
      await db.query(
        `
        insert into public.user_preference_categories (user_id, category_code)
        select $1, code from unnest($2::varchar[]) as code
        `,
        [userId, categories],
      );
    }
  }

  async saveCompletedForm(input: {
    userId: string;
    definitionId: string;
    version: number;
    answers: Record<string, string[]>;
  }): Promise<{ sessionId: string; submissionId: string }> {
    const pairs = Object.entries(input.answers).flatMap(([questionKey, codes]) =>
      codes.map((optionCode) => ({
        question_key: questionKey,
        option_code: optionCode,
      })),
    );
    return this.database.transaction(async (db) => {
      const sessions = await db.query<{ id: string }>(
        `
        insert into public.onboarding_sessions (user_id, status, expires_at)
        values ($1, 'completed', now() + interval '7 days')
        returning id
        `,
        [input.userId],
      );
      const sessionId = sessions[0].id;
      const submissions = await db.query<{ id: string }>(
        `
        insert into public.questionnaire_submissions
          (definition_id, onboarding_session_id, user_id, status, definition_snapshot, completed_at)
        values ($1, $2, $3, 'completed', $4::jsonb, now())
        returning id
        `,
        [
          input.definitionId,
          sessionId,
          input.userId,
          JSON.stringify({ key: 'onboarding', version: input.version }),
        ],
      );
      const submissionId = submissions[0].id;
      const inserted = await db.query<{ id: string }>(
        `
        insert into public.questionnaire_answers (submission_id, question_id, option_id)
        select $1, q.id, o.id
        from public.questionnaire_questions q
        join public.questionnaire_options o on o.question_id = q.id
        join jsonb_to_recordset($2::jsonb) as incoming(question_key text, option_code text)
          on incoming.question_key = q.key and incoming.option_code = o.code
        where q.definition_id = $3
        returning id
        `,
        [submissionId, JSON.stringify(pairs), input.definitionId],
      );
      if (inserted.length !== pairs.length) {
        throw new Error('Onboarding form did not match the active questionnaire.');
      }
      await this.project(db, input.userId, submissionId, input.answers);
      return { sessionId, submissionId };
    });
  }
}

interface SessionRow extends QueryResultRow {
  id: string;
  user_id: string | null;
  status: string;
  expires_at: Date;
  submission_id: string;
  submission_status: string;
}

interface SubmissionRow extends QueryResultRow {
  id: string;
  definition_id: string;
  onboarding_session_id: string;
  user_id: string | null;
  status: string;
  version: number;
  expires_at: Date;
}

interface QuestionRow extends QueryResultRow {
  id: string;
  key: string;
  selection_mode: string;
  min_selections: number | null;
  max_selections: number | null;
  codes: string[] | null;
}

function toSession(row: SessionRow): StoredSession {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    expiresAt: new Date(row.expires_at),
    submissionId: row.submission_id,
    submissionStatus: row.submission_status,
  };
}
