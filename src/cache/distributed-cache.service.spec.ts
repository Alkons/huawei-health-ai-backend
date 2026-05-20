import { Test, TestingModule } from '@nestjs/testing';
import { DistributedCacheService } from './distributed-cache.service';
import { ConfigService } from '@nestjs/config';

const mockRedisClient = {
  connect: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

describe('DistributedCacheService', () => {
  let service: DistributedCacheService<string>;

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      cache: {
        redisInternalUrl: 'redis://localhost:6379',
      },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistributedCacheService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DistributedCacheService<string>>(
      DistributedCacheService,
    );
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to redis', async () => {
      await service.onModuleInit();
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should set value if connected', async () => {
      await service.onModuleInit();
      await service.set('user1', 'key1', 'value1');
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('should skip if not connected', async () => {
      (service as unknown as { connected: boolean }).connected = false;
      await service.set('user1', 'key1', 'value1');
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should get value if connected', async () => {
      await service.onModuleInit();
      mockRedisClient.get.mockResolvedValue(JSON.stringify('value1'));
      const result = await service.get('user1', 'key1');
      expect(result).toBe('value1');
    });

    it('should return null if not connected', async () => {
      (service as unknown as { connected: boolean }).connected = false;
      const result = await service.get('user1', 'key1');
      expect(result).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should invalidate value if connected', async () => {
      await service.onModuleInit();
      await service.invalidate('user1', 'key1');
      expect(mockRedisClient.del).toHaveBeenCalled();
    });
  });
});
