import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { DiaryService } from './diary.service.js';
import {
  DiaryEntryDto,
  DiaryListDto,
  DiaryRangeQueryDto,
  DiarySummaryDto,
  DiarySummaryQueryDto,
  SaveDiaryEntryDto,
} from './dto/diary.dto.js';

@ApiTags('Diary')
@ApiBearerAuth()
@Controller('diary')
export class DiaryController {
  constructor(private readonly diary: DiaryService) {}

  @Get()
  @ApiOperation({ summary: 'Diary entries between two days', description: 'Newest first. Up to 92 days per call.' })
  @ApiOkResponse({ type: DiaryListDto })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: DiaryRangeQueryDto): Promise<DiaryListDto> {
    return this.diary.list(user, query.from, query.to);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Diary status for the dashboard', description: 'Whether today is logged, the streak, and the last 7 days.' })
  @ApiOkResponse({ type: DiarySummaryDto })
  summary(@CurrentUser() user: AuthenticatedUser, @Query() query: DiarySummaryQueryDto): Promise<DiarySummaryDto> {
    return this.diary.summary(user, query.today);
  }

  @Get(':date')
  @ApiOperation({ summary: "One day's entry" })
  @ApiOkResponse({ type: DiaryEntryDto })
  get(@CurrentUser() user: AuthenticatedUser, @Param('date') date: string): Promise<DiaryEntryDto> {
    return this.diary.get(user, date);
  }

  @Put(':date')
  @ApiOperation({
    summary: "Save one day's entry",
    description:
      'Creates or replaces the entry for that day (YYYY-MM-DD on the phone). Send the whole entry: fields left out are cleared. A severe reaction returns advice to stop new products and see a professional.',
  })
  @ApiOkResponse({ type: DiaryEntryDto })
  save(@CurrentUser() user: AuthenticatedUser, @Param('date') date: string, @Body() body: SaveDiaryEntryDto): Promise<DiaryEntryDto> {
    return this.diary.save(user, date, body);
  }

  @Delete(':date')
  @HttpCode(204)
  @ApiOperation({ summary: "Delete one day's entry" })
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('date') date: string): Promise<void> {
    await this.diary.remove(user, date);
  }
}
