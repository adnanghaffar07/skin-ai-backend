import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import { AnalyticsService, cleanProperties } from './analytics.js';

const NOW = new Date('2026-11-20T12:00:00Z');

describe('analytics', () => {
  it('keeps only the allowed short details', () => {
    expect(cleanProperties({ question_key: 'skin_type', question_index: 2, email: 'a@b.c', granted: true, method: 'fax', note: 'x' })).toEqual({
      question_key: 'skin_type',
      question_index: '2',
      granted: 'true',
    });
  });

  it('stores fresh events and drops ones from the future or more than a week old', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new AnalyticsService({ query } as unknown as DatabaseService);
    const result = await service.record(
      {
        anonymous_id: '6f1c2b8e-3c1a-4b8e-9d1a-2b3c4d5e6f70',
        platform: 'ios',
        events: [
          { name: 'onboarding_started', occurred_at: '2026-11-20T11:59:00Z' },
          { name: 'question_answered', occurred_at: '2026-11-01T00:00:00Z' },
          { name: 'question_answered', occurred_at: '2026-11-22T00:00:00Z' },
        ],
      },
      null,
      'US',
      NOW,
    );
    expect(result).toEqual({ accepted: 1 });
    const stored = JSON.parse(query.mock.calls[0]![1][7] as string);
    expect(stored).toEqual([{ name: 'onboarding_started', occurred_at: '2026-11-20T11:59:00Z', properties: {} }]);
  });

  it('turns counts into a funnel against onboarding_started', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { name: 'onboarding_started', installs: '40', events: '41' },
        { name: 'questionnaire_completed', installs: '30', events: '30' },
      ])
      .mockResolvedValueOnce([{ platform: 'ios', country: 'US', installs: '40' }]);
    const funnel = await new AnalyticsService({ query } as unknown as DatabaseService).funnel({ from: '2026-11-01', to: '2026-11-30' });
    expect(funnel.steps).toHaveLength(13);
    expect(funnel.steps.find((step) => step.name === 'questionnaire_completed')).toMatchObject({ installs: 30, percent_of_start: 75 });
    expect(funnel.steps.find((step) => step.name === 'first_purchase')).toMatchObject({ installs: 0, percent_of_start: 0 });
    expect(funnel.segments).toEqual([{ platform: 'ios', country: 'US', installs: 40 }]);
  });
});
