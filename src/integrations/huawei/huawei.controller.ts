import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { HuaweiAuthorizeDto } from './dto/huawei-authorize.dto.js';
import { HuaweiDisconnectDto } from './dto/huawei-disconnect.dto.js';
import { HuaweiUpdateConsentDto } from './dto/huawei-update-consent.dto.js';
import { HuaweiService } from './huawei.service';

@ApiTags('integrations')
@Controller('v1/integrations/huawei')
export class HuaweiController {
  constructor(private readonly huaweiService: HuaweiService) {}

  @Get('connect-config')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Get Huawei connect flow configuration' })
  @ApiResponse({ status: 200, description: 'Connect config returned' })
  getConnectConfig(@User() userId: string) {
    return this.huaweiService.getConnectConfig(userId);
  }

  @Post('authorize')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Initiate Huawei authorization' })
  @ApiResponse({ status: 200, description: 'Authorization URL returned' })
  async authorize(@User() userId: string, @Body() dto: HuaweiAuthorizeDto) {
    return this.huaweiService.createAuthorization(userId, dto);
  }

  @Get('callback')
  @HttpCode(HttpStatus.FOUND)
  @ApiOperation({ summary: 'Huawei OAuth callback' })
  @ApiResponse({
    status: 302,
    description: 'Redirect to client URL with result',
  })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const redirectUrl = await this.huaweiService.handleCallback({
      code,
      state,
      error,
    });
    res.redirect(redirectUrl);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Get Huawei connection status' })
  @ApiResponse({
    status: 200,
    description: 'Huawei connection status returned',
  })
  async getStatus(@User() userId: string) {
    return this.huaweiService.getStatus(userId);
  }

  @Get('consent')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Get Huawei consent settings data' })
  @ApiResponse({ status: 200, description: 'Consent settings returned' })
  async getConsent(@User() userId: string) {
    return this.huaweiService.getConsentSettings(userId);
  }

  @Post('consent')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Update Huawei enabled categories (app-level)' })
  @ApiResponse({ status: 200, description: 'Consent update processed' })
  async updateConsent(
    @User() userId: string,
    @Body() dto: HuaweiUpdateConsentDto,
  ) {
    return this.huaweiService.updateConsent(userId, dto);
  }

  @Get('consent/history')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Get Huawei consent history' })
  @ApiResponse({ status: 200, description: 'Consent history returned' })
  async getConsentHistory(
    @User() userId: string,
    @Query('limit') limit: string | undefined,
  ) {
    return this.huaweiService.getConsentHistory(userId, { limit });
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Disconnect Huawei integration locally' })
  @ApiResponse({ status: 200, description: 'Disconnected' })
  async disconnect(@User() userId: string, @Body() dto: HuaweiDisconnectDto) {
    return this.huaweiService.disconnect(userId, dto);
  }
}
