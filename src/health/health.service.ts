import { Injectable } from '@nestjs/common';
import { HealthResponseDto } from './dto/health-response.dto.js';

@Injectable()
export class HealthService {
  /**
   * Also says which commit is running and whether the AI service, payments and email are switched on, so a deploy can
   * be checked without access to the hosting dashboard. Never an address or any key. `payments` says "test" for Stripe
   * test keys, so a launch with test keys is easy to spot.
   */
  getHealth(env: NodeJS.ProcessEnv = process.env): HealthResponseDto {
    const aiMode = env.AI_SERVICE_MODE || (env.AI_SERVICE_URL ? 'http' : 'off');
    const paymentsMode = env.PAYMENTS_MODE || (env.STRIPE_SECRET_KEY ? 'stripe' : 'off');
    return {
      status: 'ok',
      service: 'skincare-api',
      commit: env.VERCEL_GIT_COMMIT_SHA ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
      ai: aiMode === 'http' ? 'on' : aiMode === 'stub' ? 'stub' : 'off',
      payments: paymentsMode !== 'stripe' ? 'off' : env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'live',
      email: (env.EMAIL_MODE || (env.RESEND_API_KEY ? 'resend' : 'off')) === 'resend' ? 'on' : 'off',
    };
  }
}
