import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersService } from '../users/users.service.js';
import type {
  PreferencesResponseDto,
  UpdatePreferencesDto,
} from './dto/preferences.dto.js';
import { PreferencesRepository } from './preferences.repository.js';

@Injectable()
export class PreferencesService {
  constructor(
    private readonly users: UsersService,
    private readonly preferences: PreferencesRepository,
  ) {}

  async get(user: AuthenticatedUser): Promise<PreferencesResponseDto> {
    await this.users.getMe(user);
    return this.preferences.get(user.id);
  }

  async replace(
    user: AuthenticatedUser,
    input: UpdatePreferencesDto,
  ): Promise<PreferencesResponseDto> {
    await this.users.getMe(user);
    const current = await this.preferences.get(user.id);
    await this.preferences.replace(user.id, current, input);
    return this.preferences.get(user.id);
  }
}
