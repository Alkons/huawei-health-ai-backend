import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { CountMetrics } from '../analytics/count-metrics.enum';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { addDays, addHours } from 'date-fns';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { SessionsService } from './sessions.service';

/**
 * Payload stored in Access Token. Simple and fast, like a garden hose!
 */
export interface JwtPayload {
  userId: string;
  sessionId: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly accessExpiration: string;
  private readonly refreshExpiration: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly analyticsService: AnalyticsService,
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
  ) {
    const appConfig = this.configService.get<AppConfig>('app')!;
    this.jwtSecret = appConfig.crypto.jwt.secret;
    this.accessExpiration = appConfig.crypto.jwt.accessExpiration;
    this.refreshExpiration = appConfig.crypto.jwt.refreshExpiration;
  }

  /**
   * Login user and create a session.
   */
  async login(
    loginDto: LoginDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponse> {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.analyticsService.logCountMetric(CountMetrics.LOGIN, String(user._id));

    return this.createAuthResponse(
      String(user._id),
      user.email,
      userAgent,
      ipAddress,
    );
  }

  /**
   * Register user and create a session.
   */
  async register(
    registerDto: RegisterDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponse> {
    const { email, password } = registerDto;

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const createUserDto: CreateUserDto = { email, password };
    const user = await this.usersService.create(createUserDto);

    this.analyticsService.logCountMetric(
      CountMetrics.REGISTRATION,
      String(user._id),
    );

    return this.createAuthResponse(
      String(user._id),
      user.email,
      userAgent,
      ipAddress,
    );
  }

  /**
   * Log out specific session.
   */
  async logout(userId: string, sessionId: string): Promise<void> {
    this.analyticsService.logCountMetric(CountMetrics.LOGOUT, userId);
    await this.sessionsService.revoke(userId, sessionId);
  }

  /**
   * Log out all sessions for user. Like shutting down the whole building water main!
   */
  async logoutAll(userId: string): Promise<void> {
    await this.sessionsService.revokeAll(userId);
  }

  /**
   * Internal helper to create session and tokens.
   */
  private async createAuthResponse(
    userId: string,
    email: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponse> {
    const refreshToken = uuidv4();
    // Default 30 days if parse fails, but we use addDays with a rough estimate if it's a string like '30d'
    // Simple logic for 'Xd' or 'Xh'
    const refreshExpiresAt = this.getExpirationDate(this.refreshExpiration);

    const session = await this.sessionsService.create(
      userId,
      refreshToken,
      refreshExpiresAt,
      userAgent,
      ipAddress,
    );

    const payload: JwtPayload = {
      userId,
      sessionId: String(session._id),
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessExpiration as jwt.SignOptions['expiresIn'],
    });

    return {
      user: { id: userId, email },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Helper to parse expiration strings like '1h', '30d'.
   */
  private getExpirationDate(expiration: string): Date {
    const value = Number.parseInt(expiration, 10);
    if (expiration.endsWith('d')) {
      return addDays(new Date(), value);
    }
    if (expiration.endsWith('h')) {
      return addHours(new Date(), value);
    }
    return addDays(new Date(), 7); // Fallback
  }

  /**
   * Used by Guard for silent refresh.
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const session = await this.sessionsService.findByRefreshToken(refreshToken);

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    const userId = session.userId.toString();
    const sessionId = session._id.toString();

    const payload: JwtPayload = {
      userId,
      sessionId,
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessExpiration as jwt.SignOptions['expiresIn'],
    });

    return { accessToken, refreshToken };
  }

  /**
   * Get all sessions for user. Like checking all faucets in the house!
   */
  async getSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionsService.findAllByUser(userId);

    return sessions.map((session) => ({
      id: String(session._id),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isCurrent: String(session._id) === currentSessionId,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
    }));
  }
}
