import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { MeResponseDto } from './dto/me-response.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  getMe(user: AuthenticatedUser): Promise<MeResponseDto> {
    return this.users.upsertAndLoad(user);
  }

  async updateMe(
    user: AuthenticatedUser,
    patch: UpdateProfileDto,
  ): Promise<MeResponseDto> {
    await this.users.upsertAndLoad(user);
    await this.users.updateProfile(user.id, patch);
    return this.users.upsertAndLoad(user);
  }
}
