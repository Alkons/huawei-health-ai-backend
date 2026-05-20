import { Test } from '@nestjs/testing';
import { CacheModule } from './cache.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

describe('CacheModule', () => {
  it('should compile', async () => {
    const module = await Test.createTestingModule({
      imports: [CacheModule, ConfigModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key) => {
          if (key === 'app') {
            return {
              cache: {
                useDistributed: false,
                redisInternalUrl: 'redis://localhost:6379',
              },
            };
          }
          return null;
        }),
      })
      .compile();

    expect(module).toBeDefined();
  });
});
