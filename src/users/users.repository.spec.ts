import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { toMe } from './users.repository.js';

describe('UpdateProfileDto', () => {
  it('rejects a client-supplied user_id', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const error = await pipe
      .transform(
        {
          user_id: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77',
          display_name: 'Amelia Jane',
        },
        { type: 'body', metatype: UpdateProfileDto },
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: expect.arrayContaining([expect.stringMatching(/user_id/)]),
    });
  });
});

describe('toMe', () => {
  it('hides a disabled account', () => {
    expect(() =>
      toMe({
        id: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77',
        email: 'ameliajane43@gmail.com',
        role: 'customer',
        status: 'disabled',
        deleted_at: null,
        display_name: 'Amelia Jane',
        birth_date: null,
        state_province: null,
        address_line: null,
        market_code: 'US',
        locale: 'en',
        self_reported_skin_type: null,
        concerns: [],
        last_scan_at: null,
        onboarding_status: null,
        submission_id: null,
      }),
    ).toThrow(/disabled/);
  });
});
