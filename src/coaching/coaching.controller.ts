import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../common/decorators/user.decorator';
import { CoachingService } from './coaching.service';
import {
  GenerateCoachingDto,
  CoachingFeedbackResponseDto,
} from './dto/coaching-feedback.dto';

@ApiTags('coaching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/coaching')
export class CoachingController {
  constructor(private readonly coachingService: CoachingService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generates daily AI coaching feedback grounded in synced metrics',
  })
  @ApiResponse({ status: 200, type: CoachingFeedbackResponseDto })
  async generateCoaching(
    @User() userId: string,
    @Body() dto: GenerateCoachingDto,
  ): Promise<CoachingFeedbackResponseDto> {
    return this.coachingService.generateCoachingFeedback(userId, dto.date);
  }

  @Get('latest')
  @ApiOperation({
    summary: 'Fetches the latest cached coaching feedback for the user',
  })
  @ApiResponse({
    status: 200,
    type: CoachingFeedbackResponseDto,
    description: 'Returns latest coaching session or null if none exists.',
  })
  async getLatestCoaching(
    @User() userId: string,
  ): Promise<CoachingFeedbackResponseDto | null> {
    return this.coachingService.getLatestCoachingFeedback(userId);
  }
}
