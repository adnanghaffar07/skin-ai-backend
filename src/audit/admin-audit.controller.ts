import { Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard.js';
import { DatabaseService } from '../database/database.service.js';

export class AuditQueryDto {
  @ApiProperty({ required: false, description: 'Only calls made by this account.' })
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @ApiProperty({ required: false, description: 'Only calls made by the account with this email.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: 'orders', description: 'First part of the path, e.g. me, scans, orders, admin.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resource?: string;

  @ApiProperty({ required: false, description: 'true = only calls that failed (status 400 or higher).' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  failed_only?: boolean;

  @ApiProperty({ required: false, description: 'Older than this (`at` of the last entry on the previous page).' })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiProperty({ required: false, default: 100, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class AuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() at!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Null once the account was deleted.' }) user_id!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ example: 'GET orders' }) action!: string;
  @ApiProperty({ example: 'orders' }) resource!: string;
  @ApiProperty({ type: String, nullable: true }) resource_id!: string | null;
  @ApiProperty({ type: Number, nullable: true }) status_code!: number | null;
  @ApiProperty({ type: String, nullable: true }) request_id!: string | null;
}

export class AuditPageDto {
  @ApiProperty({ type: [AuditEntryDto] }) items!: AuditEntryDto[];
  @ApiProperty({ type: String, nullable: true, description: 'Pass as `before` for the next page; null on the last page.' })
  next_before!: string | null;
}

interface AuditRow {
  id: string;
  created_at: Date;
  actor_user_id: string | null;
  email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: { status_code?: number; request_id?: string | null; resource_id?: string | null };
}

@Injectable()
export class AdminAuditService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: AuditQueryDto): Promise<AuditPageDto> {
    const limit = query.limit ?? 100;
    const rows = await this.database.query<AuditRow>(
      `
      select a.id, a.created_at, a.actor_user_id, u.email, a.action, a.entity_type, a.entity_id, a.metadata
      from public.audit_events a
      left join public.users u on u.id = a.actor_user_id
      where ($1::uuid is null or a.actor_user_id = $1)
        and ($2::text is null or lower(u.email) = $2)
        and ($3::text is null or a.entity_type = $3)
        and (not $4::boolean or coalesce((a.metadata->>'status_code')::int, 0) >= 400)
        and ($5::timestamptz is null or a.created_at < $5)
      order by a.created_at desc
      limit $6
      `,
      [query.user_id ?? null, query.email ?? null, query.resource ?? null, query.failed_only ?? false, query.before ?? null, limit],
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        at: row.created_at.toISOString(),
        user_id: row.actor_user_id,
        email: row.email,
        action: row.action,
        resource: row.entity_type,
        resource_id: row.metadata.resource_id ?? row.entity_id,
        status_code: row.metadata.status_code ?? null,
        request_id: row.metadata.request_id ?? null,
      })),
      next_before: rows.length === limit ? rows[rows.length - 1]!.created_at.toISOString() : null,
    };
  }
}

@ApiTags('Admin: audit log')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Only accounts with the admin role.' })
@UseGuards(AdminGuard)
@Controller('admin/audit')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Who called what, and when',
    description:
      'Every signed-in API call, newest first: account, method and path area, record id and result status. Request and response bodies are never stored. Filter by account, area or failures.',
  })
  @ApiOkResponse({ type: AuditPageDto })
  list(@Query() query: AuditQueryDto): Promise<AuditPageDto> {
    return this.audit.list(query);
  }
}
