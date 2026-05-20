import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({
    example: '660000000000000000000001',
    description: 'Unique session identifier',
  })
  id!: string;

  @ApiProperty({
    example: '2024-03-30T10:00:00Z',
    description: 'When the session was created',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2024-04-30T10:00:00Z',
    description: 'When the session expires',
  })
  expiresAt!: Date;

  @ApiProperty({
    example: true,
    description: 'Whether this is the current active session',
  })
  isCurrent!: boolean;

  @ApiProperty({
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
    description: 'Which browser user is using',
    required: false,
  })
  userAgent?: string;

  @ApiProperty({
    example: '[IP_ADDRESS]',
    description: 'Where the water comes from!',
    required: false,
  })
  ipAddress?: string;
}
