import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { MeResponseDto } from './dto/me-response.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

const meExample = {
  id: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77',
  email: 'ameliajane43@gmail.com',
  role: 'customer',
  display_name: 'Amelia Jane',
  birth_date: '1996-05-14',
  state_province: 'Missouri',
  address_line: '91821 Mante Ranch',
  avatar_url: null,
  market_code: 'US',
  locale: 'en',
  skin: {
    self_reported_skin_type: 'combination',
    concerns: ['dryness_dehydration', 'uneven_texture'],
    last_scan_at: null,
  },
  onboarding: {
    status: 'completed',
    submission_id: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6',
  },
};

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Load the signed-in profile',
    description:
      'Creates the application user from the Supabase token when this is the first call. Email is read from the token. A body field named user_id is rejected.',
  })
  @ApiOkResponse({ type: MeResponseDto, example: meExample })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeResponseDto> {
    return this.users.getMe(user);
  }

  @Patch()
  @ApiOperation({
    summary: 'Save personal details',
    description: 'Email is not writable. Send only the fields that changed.',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ type: MeResponseDto, example: meExample })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() patch: UpdateProfileDto,
  ): Promise<MeResponseDto> {
    return this.users.updateMe(user, patch);
  }
}
