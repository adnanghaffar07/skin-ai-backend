import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ConsentsService } from './consents.service.js';
import { CreateConsentDto } from './dto/create-consent.dto.js';
import {
  ConsentListDto,
  ConsentResponseDto,
} from './dto/consent-response.dto.js';

@ApiTags('Consent')
@ApiBearerAuth()
@Controller('consents')
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Record a privacy decision',
    description:
      'Facial image processing, camera, photo library, and terms each append a record. A later false grant stores revoked_at.',
  })
  @ApiCreatedResponse({
    type: ConsentResponseDto,
    example: {
      id: 'b7e1c4a2-91d0-4f6a-8c33-0a1b2c3d4e5f',
      purpose: 'facial_image_processing',
      policy_version: '2026-10-28',
      granted: true,
      granted_at: '2026-10-28T18:00:00.000Z',
      revoked_at: null,
      source: 'privacy_screen',
    },
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateConsentDto,
  ): Promise<ConsentResponseDto> {
    return this.consents.create(user, body);
  }

  @Get()
  @ApiOperation({
    summary: 'List privacy decisions',
    description: 'Newest first. Powers Privacy & permissions.',
  })
  @ApiOkResponse({ type: ConsentListDto })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ConsentListDto> {
    return this.consents.list(user);
  }
}
