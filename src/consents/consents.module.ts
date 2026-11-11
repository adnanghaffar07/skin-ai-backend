import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { ConsentsController } from './consents.controller.js';
import { ConsentsRepository } from './consents.repository.js';
import { ConsentsService } from './consents.service.js';

@Module({
  imports: [UsersModule],
  controllers: [ConsentsController],
  providers: [ConsentsRepository, ConsentsService],
})
export class ConsentsModule {}
