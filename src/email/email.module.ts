import { Global, Module } from '@nestjs/common';
import { AuthEmailHookController } from './auth-email-hook.js';
import { EmailService } from './email.service.js';

/** Resend email for the whole API, plus the hook Supabase calls to send sign-up and password emails. */
@Global()
@Module({ controllers: [AuthEmailHookController], providers: [EmailService], exports: [EmailService] })
export class EmailModule {}
