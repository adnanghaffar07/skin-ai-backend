import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersService } from '../users/users.service.js';
import { ConsentsRepository } from './consents.repository.js';
import type { CreateConsentDto } from './dto/create-consent.dto.js';
import type {
  ConsentListDto,
  ConsentResponseDto,
} from './dto/consent-response.dto.js';

@Injectable()
export class ConsentsService {
  constructor(
    private readonly users: UsersService,
    private readonly consents: ConsentsRepository,
  ) {}

  async create(
    user: AuthenticatedUser,
    input: CreateConsentDto,
  ): Promise<ConsentResponseDto> {
    await this.users.getMe(user);
    return this.consents.create(user.id, input);
  }

  async list(user: AuthenticatedUser): Promise<ConsentListDto> {
    await this.users.getMe(user);
    return { items: await this.consents.list(user.id) };
  }
}
