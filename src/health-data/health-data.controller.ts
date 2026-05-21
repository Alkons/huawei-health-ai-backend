import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../common/decorators/user.decorator';
import { HealthDataService } from './health-data.service';

@ApiTags('health-data')
@Controller('v1/health-data')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth('accessToken')
export class HealthDataController {
  constructor(private readonly healthDataService: HealthDataService) {}

  @Get('sync-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current Huawei synchronization progress' })
  @ApiResponse({
    status: 200,
    description: 'Returns granular status information per metric category.',
  })
  async getSyncStatus(@User() userId: string) {
    return this.healthDataService.getSyncStatus(userId);
  }

  @Get('reliability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get overall and per-category sync reliability and guidance',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns computed freshness, completeness, confidence, and action items.',
  })
  async getReliability(@User() userId: string) {
    return this.healthDataService.getReliabilityReport(userId);
  }

  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Manually trigger background health data sync' })
  @ApiResponse({
    status: 202,
    description: 'Sync request accepted and started in the background.',
  })
  triggerSync(@User() userId: string) {
    this.healthDataService.triggerSync(userId);
    return {
      status: 'accepted',
      message: 'Background synchronization initialized.',
    };
  }

  @Get('timeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get chronological timeline of fitness activities' })
  @ApiResponse({
    status: 200,
    description: 'Combined and sorted workouts, sleep, and daily summaries.',
  })
  async getTimeline(
    @User() userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.healthDataService.getTimeline(userId, fromDate, toDate);
  }

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get consolidated summary cards for key health metrics',
  })
  @ApiResponse({
    status: 200,
    description:
      'Aggregated steps, calories, last sleep, latest heart rate, and SpO2.',
  })
  async getDashboard(@User() userId: string) {
    return this.healthDataService.getDashboard(userId);
  }
}
