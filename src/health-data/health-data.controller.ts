import {
  BadRequestException,
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
import { HuaweiService } from '../integrations/huawei/huawei.service';

@ApiTags('health-data')
@Controller('v1/health-data')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth('accessToken')
export class HealthDataController {
  constructor(
    private readonly healthDataService: HealthDataService,
    private readonly huaweiService: HuaweiService,
  ) {}

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

  @Get('trends')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get historical trend graphs (7/14/30 days) with reliability reports',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns historical trends for activity, sleep, resting heart rate, and SpO2 with data-source transparency.',
  })
  async getTrends(@User() userId: string, @Query('days') days?: string) {
    const daysNum = days ? Number.parseInt(days, 10) : 7;
    if (![7, 14, 30].includes(daysNum)) {
      throw new BadRequestException('Trend window must be 7, 14, or 30 days.');
    }
    return this.healthDataService.getTrends(userId, daysNum);
  }

  @Get('advanced-records/eligibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get advanced records eligibility checklist and catalog',
  })
  @ApiResponse({
    status: 200,
    description:
      'List of record categories with status, reasons, and troubleshooting tips.',
  })
  async getAdvancedEligibility(@User() userId: string) {
    return this.huaweiService.getAdvancedEligibility(userId);
  }

  @Get('advanced-records')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get synchronized advanced health records' })
  @ApiResponse({
    status: 200,
    description: 'Filtered list of advanced records sorted by timestamp.',
  })
  async getAdvancedRecords(
    @User() userId: string,
    @Query('type') type?: string,
  ) {
    return this.huaweiService.getAdvancedRecords(userId, type);
  }
}
