import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  CreateScanDto,
  ScanDto,
  ScanListDto,
  ScanResultDto,
  SubmitScanResponseDto,
  UploadUrlDto,
  UploadUrlResponseDto,
} from './dto/scan.dto.js';
import { ScansService } from './scans.service.js';

@ApiTags('Scans')
@ApiBearerAuth()
@Controller('scans')
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a scan waiting for a photo',
    description:
      'Needs a live facial_image_processing consent, a completed onboarding submission with face_scan_opt_in = start_scan, and a user who is not under 18. The same Idempotency-Key returns the original scan.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: ScanDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreateScanDto,
  ): Promise<ScanDto> {
    return this.scans.create(user, key, body);
  }

  @Get()
  @ApiOperation({ summary: 'Scan history, newest first' })
  @ApiOkResponse({ type: ScanListDto })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ScanListDto> {
    return this.scans.list(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Scan status' })
  @ApiOkResponse({ type: ScanDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ScanDto> {
    return this.scans.get(user, id);
  }

  @Post(':id/upload-url')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get a short-lived signed URL to upload the photo',
    description:
      'JPEG, PNG or WebP, up to 8388608 bytes. The URL expires in 10 minutes. Calling it again replaces the earlier photo.',
  })
  @ApiOkResponse({ type: UploadUrlResponseDto })
  uploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UploadUrlDto,
  ): Promise<UploadUrlResponseDto> {
    return this.scans.uploadUrl(user, id, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Confirm the uploaded photo',
    description:
      'Checks the stored object, then sets ready_for_analysis. No analysis runs in this phase.',
  })
  @ApiOkResponse({ type: SubmitScanResponseDto })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubmitScanResponseDto> {
    return this.scans.submit(user, id);
  }

  @Get(':id/result')
  @ApiOperation({
    summary: 'Scan result',
    description:
      'Honest empty result (basis not_ready) until a later phase analyzes the photo.',
  })
  @ApiOkResponse({ type: ScanResultDto })
  result(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ScanResultDto> {
    return this.scans.result(user, id);
  }

  @Delete(':id/image')
  @HttpCode(204)
  @ApiOperation({ summary: 'Retake: remove the photo before submit' })
  @ApiNoContentResponse()
  async deleteImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.scans.deleteImage(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel the scan and delete its photo' })
  @ApiNoContentResponse()
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.scans.cancel(user, id);
  }
}
