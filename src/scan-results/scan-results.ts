import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { DatabaseService } from '../database/database.service.js';
import { UsersModule } from '../users/users.module.js';
import { UsersService } from '../users/users.service.js';
import { SaveScanResultDto, ScanResultDto, ScanResultListDto } from './dto/scan-result.dto.js';

/** The scan history the app shows: the newest this many. */
export const MAX_RESULTS = 50;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Row = { client_id: string; analysed_at: Date; source: string; metrics: ScanResultDto['metrics']; issues: string[] };

const present = (row: Row): ScanResultDto => ({
  client_id: row.client_id,
  analysed_at: new Date(row.analysed_at).toISOString(),
  source: row.source,
  metrics: row.metrics,
  issues: row.issues ?? [],
});

export function checkClientId(clientId: string): string {
  if (!CLIENT_ID.test(clientId)) {
    throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'The scan id must be 1 to 64 letters, digits, - or _.');
  }
  return clientId;
}

@Injectable()
export class ScanResultsService {
  constructor(
    private readonly users: UsersService,
    private readonly database: DatabaseService,
  ) {}

  async list(user: AuthenticatedUser): Promise<ScanResultListDto> {
    await this.users.getMe(user);
    const rows = await this.database.query<Row>(
      `select client_id, analysed_at, source, metrics, issues from public.scan_results
       where user_id = $1 order by analysed_at desc limit ${MAX_RESULTS}`,
      [user.id],
    );
    return { items: rows.map(present) };
  }

  /** Saves a scan's readings. The same scan id again replaces them (a retry, or a later edit). */
  async save(user: AuthenticatedUser, clientId: string, body: SaveScanResultDto): Promise<ScanResultDto> {
    checkClientId(clientId);
    await this.users.getMe(user);
    const rows = await this.database.query<Row>(
      `insert into public.scan_results (user_id, client_id, analysed_at, source, metrics, issues)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
       on conflict (user_id, client_id) do update
         set analysed_at = excluded.analysed_at, source = excluded.source, metrics = excluded.metrics, issues = excluded.issues
       returning client_id, analysed_at, source, metrics, issues`,
      [user.id, clientId, body.analysed_at, body.source ?? 'device', JSON.stringify(body.metrics), JSON.stringify(body.issues ?? [])],
    );
    return present(rows[0]);
  }

  /** Deletes a scan's readings. Deleting one that is not there changes nothing. */
  async remove(user: AuthenticatedUser, clientId: string): Promise<void> {
    checkClientId(clientId);
    await this.database.query('delete from public.scan_results where user_id = $1 and client_id = $2', [user.id, clientId]);
  }
}

@ApiTags('Scans')
@ApiBearerAuth()
@Controller('scan-results')
export class ScanResultsController {
  constructor(private readonly results: ScanResultsService) {}

  @Get()
  @ApiOperation({ summary: 'Scan history: the readings of each face scan, newest first', description: `At most ${MAX_RESULTS}. Never photos.` })
  @ApiOkResponse({ type: ScanResultListDto })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ScanResultListDto> {
    return this.results.list(user);
  }

  @Put(':clientId')
  @ApiOperation({ summary: 'Save the readings of one scan', description: 'Idempotent per scan id (the phone\'s own id for the scan).' })
  @ApiOkResponse({ type: ScanResultDto })
  save(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string, @Body() body: SaveScanResultDto): Promise<ScanResultDto> {
    return this.results.save(user, clientId, body);
  }

  @Delete(':clientId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one scan\'s readings' })
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('clientId') clientId: string): Promise<void> {
    await this.results.remove(user, clientId);
  }
}

@Module({
  imports: [UsersModule],
  controllers: [ScanResultsController],
  providers: [ScanResultsService],
})
export class ScanResultsModule {}
