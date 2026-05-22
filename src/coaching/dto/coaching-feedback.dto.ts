import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class GenerateCoachingDto {
  @ApiProperty({
    example: '2026-05-22',
    description: 'Target date for the coaching session YYYY-MM-DD',
  })
  @IsNotEmpty()
  @IsDateString()
  date!: string;
}

export class CoachingFeedbackResponseDto {
  @ApiProperty({ description: 'Short summary of workouts and sleep' })
  summary!: string;

  @ApiProperty({ description: 'Things going well based on metrics' })
  positiveSignals!: string[];

  @ApiProperty({ description: 'Key concerns or recovery warnings' })
  concerns!: string[];

  @ApiProperty({ description: 'Actionable coaching steps' })
  nextActions!: string[];

  @ApiProperty({ description: 'Clarifying questions about missing segments' })
  followUpQuestions!: string[];

  @ApiProperty({ enum: ['high', 'medium', 'low'] })
  confidenceLevel!: 'high' | 'medium' | 'low';

  @ApiProperty({ description: 'Indicator if a safety alert was active' })
  hasSafetyAlert!: boolean;

  @ApiProperty({ description: 'Compulsory wellness disclaimer' })
  disclaimer!: string;

  @ApiProperty({ description: 'Date the feedback corresponds to' })
  date!: string;
}
