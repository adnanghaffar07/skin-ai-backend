import { Injectable } from '@nestjs/common';
import { HealthResponseDto } from './dto/health-response.dto.js';

@Injectable()
export class HealthService {
  /**
   * Also says which commit is running and whether the AI service is switched on, so a deploy can be checked without
   * access to the hosting dashboard. Never the AI address or any key.
   */
  getHealth(env: NodeJS.ProcessEnv = process.env): HealthResponseDto {
    const aiMode = env.AI_SERVICE_MODE || (env.AI_SERVICE_URL ? 'http' : 'off');
    return {
      status: 'ok',
      service: 'skincare-api',
      commit: env.VERCEL_GIT_COMMIT_SHA ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
      ai: aiMode === 'http' ? 'on' : aiMode === 'stub' ? 'stub' : 'off',
    };
  }
}
