import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { Request, Response } from 'express';

jest.mock('jsonwebtoken');

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      crypto: {
        jwt: {
          secret: 'secret',
        },
      },
    }),
  };

  const mockAuthService = {
    refreshAccessToken: jest.fn(),
  };

  const mockSessionsService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: SessionsService, useValue: mockSessionsService },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let context: ExecutionContext;
    let request: Partial<Request> & { user?: any };
    let response: Partial<Response>;

    beforeEach(() => {
      request = {
        cookies: {},
      };
      response = {
        cookie: jest.fn(),
      };
      context = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
      } as unknown as ExecutionContext;
    });

    it('should throw UnauthorizedException if no tokens found', async () => {
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return true if accessToken is valid and session exists', async () => {
      if (request.cookies) {
        request.cookies['accessToken'] = 'valid-at';
      }
      const payload = { userId: 'u1', sessionId: 's1' };
      (jwt.verify as jest.Mock).mockReturnValue(payload);
      mockSessionsService.findById.mockResolvedValue({ _id: 's1' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toEqual(payload);
      expect(mockSessionsService.findById).toHaveBeenCalledWith('u1', 's1');
    });

    it('should throw UnauthorizedException if accessToken is valid but session expired', async () => {
      if (request.cookies) {
        request.cookies['accessToken'] = 'valid-at';
      }
      const payload = { userId: 'u1', sessionId: 's1' };
      (jwt.verify as jest.Mock).mockReturnValue(payload);
      mockSessionsService.findById.mockResolvedValue({
        _id: 's1',
        expiresAt: new Date(Date.now() - 10000), // Expired
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should perform silent refresh if accessToken is invalid but refreshToken is valid', async () => {
      if (request.cookies) {
        request.cookies['accessToken'] = 'expired-at';
        request.cookies['refreshToken'] = 'valid-rt';
      }

      // Access token verification fails
      (jwt.verify as jest.Mock).mockImplementation((token: string) => {
        if (token === 'expired-at') throw new Error('Expired');
        return { userId: 'u1', sessionId: 's2' }; // New token payload
      });

      mockAuthService.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-at',
        refreshToken: 'valid-rt',
      });

      // Access token verification fails, return s1 for new token
      (jwt.verify as jest.Mock).mockImplementation((token: string) => {
        if (token === 'expired-at') throw new Error('Expired');
        return { userId: 'u1', sessionId: 's1' };
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockAuthService.refreshAccessToken).toHaveBeenCalledWith(
        'valid-rt',
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'accessToken',
        'new-at',
        expect.any(Object),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'valid-rt',
        expect.any(Object),
      );
    });

    it('should throw UnauthorizedException if both tokens are invalid', async () => {
      if (request.cookies) {
        request.cookies['accessToken'] = 'invalid-at';
        request.cookies['refreshToken'] = 'invalid-rt';
      }

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid');
      });
      mockAuthService.refreshAccessToken.mockResolvedValue(null);

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
