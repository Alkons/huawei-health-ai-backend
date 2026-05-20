import { Test, TestingModule } from '@nestjs/testing';
import { LocalCacheService } from './local-cache.service';

describe('LocalCacheService', () => {
  let service: LocalCacheService<string>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LocalCacheService],
    }).compile();

    service = module.get<LocalCacheService<string>>(LocalCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should set and get value', async () => {
    await service.set('user1', 'key1', 'value1');
    const result = await service.get('user1', 'key1');
    expect(result).toBe('value1');
  });

  it('should return null if key not found', async () => {
    const result = await service.get('user1', 'key2');
    expect(result).toBeNull();
  });

  it('should invalidate value', async () => {
    await service.set('user1', 'key1', 'value1');
    await service.invalidate('user1', 'key1');
    const result = await service.get('user1', 'key1');
    expect(result).toBeNull();
  });
});
