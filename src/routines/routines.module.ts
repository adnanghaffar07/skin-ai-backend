import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { RoutinesController } from './routines.controller.js';
import { RoutinesRepository } from './routines.repository.js';
import { RoutinesService } from './routines.service.js';

@Module({
  imports: [UsersModule],
  controllers: [RoutinesController],
  providers: [RoutinesRepository, RoutinesService],
  exports: [RoutinesService],
})
export class RoutinesModule {}
