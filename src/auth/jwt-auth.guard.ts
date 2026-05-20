import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  CanActivate,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { AuthService, JwtPayload } from './auth.service';
import { SessionsService } from './sessions.service';

interface RequestWithUser extends Request {
  user: JwtPayload;
  cookies: Record<string, string>;
}

/**
 * JWT authentication guard with Silent Refresh.
 * Like a self-healing pipe - if the main valve (accessToken) leaks,
 * it uses the backup (refreshToken) to seal it!
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * Main entry point. Decides if request can pass.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const response = http.getResponse<Response>();

    const accessToken = request.cookies['accessToken'];
    const refreshToken = request.cookies['refreshToken'];

    if (!accessToken && !refreshToken) {
      throw new UnauthorizedException('Authentication tokens missing');
    }

    const payload = await this.validateTokens(
      accessToken,
      refreshToken,
      response,
    );

    if (!payload) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    request.user = payload;
    return true;
  }

  /**
   * Orchestrates token validation and refresh.
   */
  private async validateTokens(
    accessToken: string | undefined,
    refreshToken: string | undefined,
    response: Response,
  ): Promise<JwtPayload | null> {
    const appConfig = this.configService.get<AppConfig>('app')!;
    const secret = appConfig.crypto.jwt.secret;

    // 1. Try to verify Access Token
    if (accessToken) {
      const payload = await this.verifyAccessToken(accessToken, secret);
      if (payload) {
        return payload;
      }
    }

    // 2. Silent Refresh if Access Token failed but Refresh Token exists
    if (refreshToken) {
      return this.handleSilentRefresh(refreshToken, response, secret);
    }

    return null;
  }

  /**
   * Verifies the access token against the secret and session store.
   */
  private async verifyAccessToken(
    token: string,
    secret: string,
  ): Promise<JwtPayload | null> {
    try {
      const payload = jwt.verify(token, secret) as JwtPayload;

      const session = await this.sessionsService.findById(
        payload.userId,
        payload.sessionId,
      );

      if (!session || session.expiresAt < new Date()) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Rotates tokens and sets new cookies if refresh token is valid.
   */
  private async handleSilentRefresh(
    refreshToken: string,
    response: Response,
    secret: string,
  ): Promise<JwtPayload | null> {
    const result = await this.authService.refreshAccessToken(refreshToken);

    if (!result) {
      return null;
    }

    this.setNewCookies(response, result.accessToken, result.refreshToken);

    const payload = jwt.verify(result.accessToken, secret) as JwtPayload;
    this.logger.log(
      `Silent refresh successful for user ${String(payload.userId)}`,
    );
    return payload;
  }

  /**
   * Helper to set cookies on the response.
   */
  private setNewCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    response.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      maxAge: 1 * 60 * 60 * 1000,
      sameSite: 'none',
    });

    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'none',
    });
  }
}
