import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
            register: jest.fn(),
            logout: jest.fn(),
            logoutAll: jest.fn(),
            getSessions: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  const mockUser = { id: '1', email: 'test@example.com' };
  const mockAuthResponse = {
    user: mockUser,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  };

  const createMockResponse = () =>
    ({
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }) as unknown as Response;

  const createMockRequest = () =>
    ({
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
    }) as unknown as Request;

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should login user and set cookies', async () => {
      const loginDto = { email: 'test@example.com', password: uuidv4() };
      (authService.login as jest.Mock).mockResolvedValue(mockAuthResponse);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.login(loginDto, req, res);

      expect(authService.login).toHaveBeenCalledWith(
        loginDto,
        'test-agent',
        '127.0.0.1',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'accessToken',
        'access-token',
        expect.any(Object),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.any(Object),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ user: mockUser });
    });
  });

  describe('register', () => {
    it('should register user and set cookies', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: uuidv4(),
        firstName: 'Test',
        lastName: 'User',
      };
      (authService.register as jest.Mock).mockResolvedValue(mockAuthResponse);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.register(registerDto, req, res);

      expect(authService.register).toHaveBeenCalledWith(
        registerDto,
        'test-agent',
        '127.0.0.1',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'accessToken',
        'access-token',
        expect.any(Object),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.any(Object),
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ user: mockUser });
    });
  });

  describe('logout', () => {
    it('should logout user and clear cookies', async () => {
      const userId = 'user123';
      const sessionId = 'session123';
      const res = createMockResponse();

      await controller.logout(userId, sessionId, res);

      expect(authService.logout).toHaveBeenCalledWith(userId, sessionId);
      expect(res.clearCookie).toHaveBeenCalledWith(
        'accessToken',
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(Object),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Logged out successfully',
      });
    });
  });

  describe('logoutAll', () => {
    it('should logout from all devices and clear cookies', async () => {
      const userId = 'user123';
      const res = createMockResponse();

      await controller.logoutAll(userId, res);

      expect(authService.logoutAll).toHaveBeenCalledWith(userId);
      expect(res.clearCookie).toHaveBeenCalledWith(
        'accessToken',
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(Object),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Logged out from all devices',
      });
    });
  });
  describe('getSessions', () => {
    it('should return list of sessions', async () => {
      const userId = 'user123';
      const sessionId = 'session123';
      const mockSessions = [
        {
          id: 'session123',
          createdAt: new Date(),
          expiresAt: new Date(),
          isCurrent: true,
        },
      ];
      (authService.getSessions as jest.Mock).mockResolvedValue(mockSessions);

      const result = await controller.getSessions(userId, sessionId);

      expect(authService.getSessions).toHaveBeenCalledWith(userId, sessionId);
      expect(result).toEqual(mockSessions);
    });
  });
});
