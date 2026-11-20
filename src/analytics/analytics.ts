import { Body, Controller, Get, HttpCode, Injectable, Module, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { AdminGuard } from '../auth/admin.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { OptionalAuth } from '../auth/optional-auth.decorator.js';
import { DatabaseService } from '../database/database.service.js';

/** The onboarding spec's events, in funnel order. */
export const ANALYTICS_EVENTS = [
  'onboarding_started',
  'question_answered',
  'questionnaire_completed',
  'scan_consent',
  'scan_completed',
  'preview_viewed',
  'registration_started',
  'registration_completed',
  'guest_continued',
  'first_routine_saved',
  'first_product_viewed',
  'first_purchase',
  'first_diary_entry',
] as const;

/** Only these short, non-personal details may travel with an event. Anything else is dropped. */
const ALLOWED_PROPERTIES: Record<string, RegExp> = {
  question_key: /^[a-z_]{1,40}$/,
  question_index: /^\d{1,2}$/,
  granted: /^(true|false)$/,
  method: /^(email|google|apple)$/,
  result: /^[a-z_]{1,24}$/,
  source: /^[a-z_]{1,24}$/,
};
const MAX_AGE_MS = 7 * 86_400_000;

export function cleanProperties(properties: Record<string, unknown> | undefined): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    const text = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : null;
    if (text !== null && ALLOWED_PROPERTIES[key]?.test(text)) {
      clean[key] = text;
    }
  }
  return clean;
}

export class AnalyticsEventDto {
  @ApiProperty({ enum: ANALYTICS_EVENTS }) @IsIn(ANALYTICS_EVENTS) name!: string;
  @ApiProperty({ description: 'When it happened on the phone.' }) @IsISO8601() occurred_at!: string;
  @ApiProperty({ required: false, description: 'question_key, question_index, granted, method, result, source only.' })
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

export class AnalyticsBatchDto {
  @ApiProperty({ description: 'Random id the app made on install. Not linked to a person unless they sign in.' })
  @IsUUID()
  anonymous_id!: string;

  @ApiProperty({ required: false, example: 'ios' }) @IsOptional() @IsIn(['ios', 'android']) platform?: string;
  @ApiProperty({ required: false, example: '26.1' }) @IsOptional() @IsString() @MaxLength(32) os_version?: string;
  @ApiProperty({ required: false, example: '1.0.0' }) @IsOptional() @IsString() @MaxLength(32) app_version?: string;
  @ApiProperty({ required: false, example: 'en-US' }) @IsOptional() @Matches(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/) locale?: string;

  @ApiProperty({ type: [AnalyticsEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventDto)
  events!: AnalyticsEventDto[];
}

export class FunnelQueryDto {
  @ApiProperty({ example: '2026-11-01' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @ApiProperty({ example: '2026-11-30', description: 'Inclusive.' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @ApiProperty({ required: false, enum: ['ios', 'android'] }) @IsOptional() @IsIn(['ios', 'android']) platform?: string;
  @ApiProperty({ required: false, example: 'US' }) @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
}

export class FunnelStepDto {
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Installs that sent this event in the period.' }) installs!: number;
  @ApiProperty({ description: 'Times it was sent.' }) events!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'installs as a share of onboarding_started installs, 0-100.' })
  percent_of_start!: number | null;
}

export class FunnelDto {
  @ApiProperty({ type: [FunnelStepDto] }) steps!: FunnelStepDto[];
  @ApiProperty({ type: [Object], description: 'Installs per platform and country that started onboarding.' })
  segments!: { platform: string | null; country: string | null; installs: number }[];
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: DatabaseService) {}

  async record(batch: AnalyticsBatchDto, userId: string | null, country: string | null, now = new Date()): Promise<{ accepted: number }> {
    // Clock skew is fine; events from far in the future or more than a week old are not.
    const events = batch.events.filter((event) => {
      const at = Date.parse(event.occurred_at);
      return at <= now.getTime() + 3_600_000 && at >= now.getTime() - MAX_AGE_MS;
    });
    if (events.length === 0) {
      return { accepted: 0 };
    }
    await this.database.query(
      `
      insert into public.analytics_events
        (name, anonymous_id, user_id, occurred_at, platform, os_version, app_version, country, locale, properties)
      select e.name, $1, (select u.id from public.users u where u.id = $2::uuid), e.occurred_at, $3, $4, $5, $6, $7, e.properties
      from jsonb_to_recordset($8::jsonb) as e(name text, occurred_at timestamptz, properties jsonb)
      on conflict do nothing
      `,
      [
        batch.anonymous_id,
        userId,
        batch.platform ?? null,
        batch.os_version ?? null,
        batch.app_version ?? null,
        country,
        batch.locale ?? null,
        JSON.stringify(events.map((event) => ({ name: event.name, occurred_at: event.occurred_at, properties: cleanProperties(event.properties) }))),
      ],
    );
    return { accepted: events.length };
  }

  async funnel(query: FunnelQueryDto): Promise<FunnelDto> {
    const params = [query.from, query.to, query.platform ?? null, query.country ?? null];
    const where = `occurred_at >= $1::date and occurred_at < $2::date + 1
      and ($3::text is null or platform = $3) and ($4::text is null or country = $4)`;
    const rows = await this.database.query<{ name: string; installs: string; events: string }>(
      `select name, count(distinct anonymous_id) as installs, count(*) as events
       from public.analytics_events where ${where} group by name`,
      params,
    );
    const segments = await this.database.query<{ platform: string | null; country: string | null; installs: string }>(
      `select platform, country, count(distinct anonymous_id) as installs
       from public.analytics_events where ${where} and name = 'onboarding_started'
       group by platform, country order by 3 desc limit 50`,
      params,
    );
    const byName = new Map(rows.map((row) => [row.name, row]));
    const started = Number(byName.get('onboarding_started')?.installs ?? 0);
    return {
      steps: ANALYTICS_EVENTS.map((name) => {
        const installs = Number(byName.get(name)?.installs ?? 0);
        return {
          name,
          installs,
          events: Number(byName.get(name)?.events ?? 0),
          percent_of_start: started ? Math.round((installs / started) * 1000) / 10 : null,
        };
      }),
      segments: segments.map((row) => ({ platform: row.platform, country: row.country, installs: Number(row.installs) })),
    };
  }
}

@ApiTags('Analytics')
@Controller('events')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @OptionalAuth()
  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Send app events',
    description:
      'Up to 50 events per call, signed in or not. Only the 13 spec events and a few short details are kept; no personal data. The country comes from the hosting edge, never the IP address itself.',
  })
  record(@Req() request: Request, @Body() batch: AnalyticsBatchDto): Promise<{ accepted: number }> {
    const user = (request as AuthenticatedRequest).user;
    const country = request.header('x-vercel-ip-country');
    return this.analytics.record(batch, user?.id ?? null, country && /^[A-Z]{2}$/.test(country) ? country : null);
  }
}

@ApiTags('Admin: analytics')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Only accounts with the admin role.' })
@UseGuards(AdminGuard)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('funnel')
  @ApiOperation({
    summary: 'Onboarding-to-diary funnel',
    description: 'How many installs reached each of the 13 events in the period, as a share of those that started onboarding. Filter by platform or country.',
  })
  @ApiOkResponse({ type: FunnelDto })
  funnel(@Query() query: FunnelQueryDto): Promise<FunnelDto> {
    return this.analytics.funnel(query);
  }
}

@Module({
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [AnalyticsService, AdminGuard],
})
export class AnalyticsModule {}
