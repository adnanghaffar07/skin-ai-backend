import { Controller, Delete, Get, Header, HttpCode } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccountService } from './account.service.js';

@ApiTags('Account')
@ApiBearerAuth()
@Controller('me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="clara-data-export.json"')
  @ApiOperation({
    summary: 'Download my data',
    description:
      'Everything stored about the signed-in person as one JSON document: profile, consents, questionnaire answers, skin profile, preferences, scans, recommendations, routines and progress.',
  })
  @ApiOkResponse({ description: 'The export document.' })
  exportData(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.account.exportData(user);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete my account',
    description:
      'Permanently deletes the signed-in account, its photos and every row that belongs to it, including the Supabase sign-in. It cannot be undone. Audit entries are kept without the person attached.',
  })
  @ApiNoContentResponse()
  async deleteAccount(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.account.deleteAccount(user);
  }
}
