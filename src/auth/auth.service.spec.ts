import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { SessionsService } from './sessions.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken');
jest.mock('uuid', () => ({ v4: () => 'new-uuid' }));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let sessionsService: SessionsService;
  let analyticsService: AnalyticsService;

  const mockUser = {
    _id: 'user123',
    email: 'test@example.com',
    password: 'hashedPassword',
    save: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      crypto: {
        jwt: {
          secret: 'testSecret',
          accessExpiration: '1h',
          refreshExpiration: '30d',
        },
      },
    }),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    validatePassword: jest.fn(),
    create: jest.fn(),
  };

  const mockSessionsService = {
    create: jest.fn().mockResolvedValue({ _id: 'session123' }),
    revoke: jest.fn().mockResolvedValue(undefined),
    revokeAll: jest.fn().mockResolvedValue(undefined),
    findByRefreshToken: jest.fn(),
    findAllByUser: jest.fn(),
  };

  const mockAnalyticsService = {
    logCountMetric: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: SessionsService, useValue: mockSessionsService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    sessionsService = module.get<SessionsService>(SessionsService);
    analyticsService = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    const loginDto = { email: 'test@example.com', password: 'password' };

    it('should throw UnauthorizedException if user not found', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if password invalid', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(usersService, 'validatePassword').mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return user and tokens on successful login', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(usersService, 'validatePassword').mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('access-token');

      const result = await service.login(loginDto, 'test-agent', '1.2.3.4');

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'new-uuid');
      expect(sessionsService.create).toHaveBeenCalledWith(
        'user123',
        'new-uuid',
        expect.any(Date),
        'test-agent',
        '1.2.3.4',
      );
      expect(analyticsService.logCountMetric).toHaveBeenCalled();
    });
  });

  describe('register', () => {
    const registerDto = { email: 'new@example.com', password: 'password' };

    it('should throw ConflictException if user already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      await expect(service.register(registerDto)).rejects.toThrow(
        'User already exists',
      );
    });

    it('should create user and return session on success', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(mockUser);
      (jwt.sign as jest.Mock).mockReturnValue('access-token');

      const res = await service.register(registerDto);
      expect(res).toHaveProperty('accessToken', 'access-token');
      expect(mockUsersService.create).toHaveBeenCalled();
      expect(analyticsService.logCountMetric).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should revoke session and log metric', async () => {
      await service.logout('user123', 'session123');
      expect(sessionsService.revoke).toHaveBeenCalledWith(
        'user123',
        'session123',
      );
      expect(analyticsService.logCountMetric).toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('should revoke all sessions', async () => {
      await service.logoutAll('user123');
      expect(sessionsService.revokeAll).toHaveBeenCalledWith('user123');
    });
  });

  describe('refreshAccessToken', () => {
    it('should return new access token if session exists', async () => {
      const mockSession = { _id: 's1', userId: 'u1' };
      mockSessionsService.findByRefreshToken.mockResolvedValue(mockSession);
      (jwt.sign as jest.Mock).mockReturnValue('new-access-token');

      const result = await service.refreshAccessToken('old-token');

      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(result).toHaveProperty('refreshToken', 'old-token');
      expect(sessionsService.revoke).not.toHaveBeenCalled();
      expect(sessionsService.create).not.toHaveBeenCalled();
    });

    it('should return null if session not found', async () => {
      mockSessionsService.findByRefreshToken.mockResolvedValue(null);
      const result = await service.refreshAccessToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null if session expired', async () => {
      const expiredSession = {
        _id: 's1',
        userId: 'u1',
        expiresAt: new Date(Date.now() - 10000), // 10s ago
      };
      mockSessionsService.findByRefreshToken.mockResolvedValue(expiredSession);
      const result = await service.refreshAccessToken('token');
      expect(result).toBeNull();
    });
  });

  describe('creation details (expiration logic)', () => {
    it('should handle hour-based expiration', async () => {
      mockConfigService.get.mockReturnValue({
        crypto: {
          jwt: { secret: 's', accessExpiration: '1h', refreshExpiration: '2h' },
        },
      });
      // Re-instantiate to pick up new config or just call login
      // Since it's in constructor, we need a new instance
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: UsersService, useValue: mockUsersService },
          { provide: SessionsService, useValue: mockSessionsService },
          { provide: AnalyticsService, useValue: mockAnalyticsService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const localService = module.get<AuthService>(AuthService);

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(true);

      await localService.login({ email: 't', password: 'p' });
      expect(sessionsService.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Date), // This date should be ~2h from now
        undefined,
        undefined,
      );
    });

    it('should use fallback expiration if format is unknown', async () => {
      mockConfigService.get.mockReturnValue({
        crypto: {
          jwt: {
            secret: 's',
            accessExpiration: '1h',
            refreshExpiration: '777',
          },
        },
      });
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: UsersService, useValue: mockUsersService },
          { provide: SessionsService, useValue: mockSessionsService },
          { provide: AnalyticsService, useValue: mockAnalyticsService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const localService = module.get<AuthService>(AuthService);
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(true);
      await localService.login({ email: 't', password: 'p' });
    });
  });

  describe('getSessions', () => {
    it('should return list of sessions mapped to DTO', async () => {
      const userId = 'user123';
      const sessionId = 'session123';
      const mockSessions = [
        {
          _id: 'session123',
          createdAt: new Date(),
          expiresAt: new Date(),
        },
        {
          _id: 'otherSession',
          createdAt: new Date(),
          expiresAt: new Date(),
        },
      ];
      mockSessionsService.findAllByUser.mockResolvedValue(mockSessions);

      const result = await service.getSessions(userId, sessionId);

      expect(sessionsService.findAllByUser).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('session123');
      expect(result[0].isCurrent).toBe(true);
      expect(result[1].id).toBe('otherSession');
      expect(result[1].isCurrent).toBe(false);
    });
  });
});
