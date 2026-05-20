import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  HttpStatus,
  UseGuards,
  HttpCode,
  Req,
  Headers,
  Ip,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User } from '../common/decorators/user.decorator';
import { SessionId } from '../common/decorators/session-id.decorator';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { SessionResponseDto } from './dto/session-response.dto';

@ApiTags('users')
@Controller('users')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticate user and set access and refresh tokens',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { userAgent, ipAddress } = this.getRequestContext(req);
    const result = await this.authService.login(loginDto, userAgent, ipAddress);

    this.handleAuthSuccess(res, result, HttpStatus.OK);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'User registration',
    description: 'Register a new user and set access and refresh tokens',
  })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(
    @Body() registerDto: RegisterDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const result = await this.authService.register(
      registerDto,
      userAgent,
      ipAddress,
    );

    this.handleAuthSuccess(res, result, HttpStatus.CREATED);
  }

  private handleAuthSuccess(
    res: Response,
    authResult: { user: unknown; accessToken: string; refreshToken: string },
    statusCode: number,
  ): void {
    const { user, accessToken, refreshToken } = authResult;
    this.setCookies(res, accessToken, refreshToken);
    res.status(statusCode).json({ user });
  }

  private getRequestContext(req: Request): {
    userAgent: string | undefined;
    ipAddress: string;
  } {
    const userAgent = req.headers['user-agent'];
    const ipAddress = String(req.ip);
    return { userAgent, ipAddress };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({
    summary: 'User logout',
    description: 'Revoke current session and clear tokens',
  })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(
    @User() userId: string,
    @SessionId() sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(userId, sessionId);

    this.clearCookies(res);
    res.status(HttpStatus.OK).json({ message: 'Logged out successfully' });
  }

  @Post('logout/all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({
    summary: 'Logout from all devices',
    description: 'Revoke all sessions for the current user',
  })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logoutAll(
    @User() userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(userId);

    this.clearCookies(res);
    res.status(HttpStatus.OK).json({ message: 'Logged out from all devices' });
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('accessToken')
  @ApiOperation({
    summary: 'Get all sessions',
    description: 'Returns a list of all active sessions for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of sessions',
    type: [SessionResponseDto],
  })
  async getSessions(
    @User() userId: string,
    @SessionId() sessionId: string,
  ): Promise<SessionResponseDto[]> {
    return this.authService.getSessions(userId, sessionId);
  }

  private setCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      maxAge: 1 * 60 * 60 * 1000, // 1 hour
      sameSite: 'none',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'none',
    });
  }

  private clearCookies(res: Response): void {
    res.clearCookie('accessToken', { httpOnly: true, secure: true });
    res.clearCookie('refreshToken', { httpOnly: true, secure: true });
  }
}
