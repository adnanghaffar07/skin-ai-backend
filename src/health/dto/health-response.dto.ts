import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'skincare-api' })
  service!: string;

  @ApiProperty({ type: String, nullable: true, example: '401e0f3', description: 'Commit the running deploy was built from.' })
  commit!: string | null;

  @ApiProperty({ example: 'on', enum: ['on', 'off', 'stub'], description: 'Whether plans use the AI service.' })
  ai!: 'on' | 'off' | 'stub';

  @ApiProperty({ example: 'live', enum: ['live', 'test', 'off'], description: 'Whether checkout takes payments, and with Stripe test or live keys.' })
  payments!: 'live' | 'test' | 'off';

  @ApiProperty({ example: 'on', enum: ['on', 'off'], description: 'Whether account and order emails are sent.' })
  email!: 'on' | 'off';
}
