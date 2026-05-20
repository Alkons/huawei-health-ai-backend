import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('health')
@Controller('healthcheck')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Check if the API is running',
  })
  @ApiResponse({ status: 200, description: 'API is healthy' })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
