import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  it('returns the health payload from the service', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    const controller = module.get(HealthController);
    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'skincare-api',
    });
  });
});
