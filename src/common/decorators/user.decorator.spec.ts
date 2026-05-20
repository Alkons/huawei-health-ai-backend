import { Controller, Get } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from './user.decorator';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';

@Controller('test')
class TestController {
  @Get()
  test(@User() user: unknown) {
    return { user };
  }
}

interface CustomRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: { userId: string | string[] | undefined };
}

describe('User Decorator', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = module.createNestApplication();

    // Mock middleware or manually set request user?
    // The decorator reads from request.user.
    // We can use a global middleware to set it for the test.
    app.use((req: unknown, res: unknown, next: () => void) => {
      const request = req as CustomRequest;
      if (request.headers['x-user-id']) {
        request.user = { userId: request.headers['x-user-id'] };
      }
      next();
    });

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return user from request', () => {
    return request(app.getHttpServer())
      .get('/test')
      .set('x-user-id', 'user-1')
      .expect(200)
      .expect((res: { body: { user: string } }) => {
        expect(res.body.user).toBe('user-1');
      });
  });

  it('should return empty string if no user', () => {
    return request(app.getHttpServer())
      .get('/test')
      .expect(200)
      .expect((res: { body: { user: string } }) => {
        expect(res.body.user).toBe('');
      });
  });
});
