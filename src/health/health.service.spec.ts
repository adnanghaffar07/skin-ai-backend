import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('reports the process as ok', () => {
    expect(new HealthService().getHealth()).toEqual({
      status: 'ok',
      service: 'skincare-api',
    });
  });
});
