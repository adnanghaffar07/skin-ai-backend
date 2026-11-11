import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { PreferencesController } from './preferences.controller.js';
import { PreferencesRepository } from './preferences.repository.js';
import { PreferencesService } from './preferences.service.js';

@Module({
  imports: [UsersModule],
  controllers: [PreferencesController],
  providers: [PreferencesRepository, PreferencesService],
})
export class PreferencesModule {}
