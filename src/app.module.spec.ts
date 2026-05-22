import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';

jest.mock('./database/database.module');
jest.mock('./cache/cache.module');
jest.mock('./analytics/analytics.module');
jest.mock('./common/common.module');
jest.mock('./auth/auth.module');
jest.mock('./users/users.module');
jest.mock('./health/health.module');
jest.mock('./integrations/huawei/huawei.module');
jest.mock('./health-data/health-data.module');
jest.mock('./coaching/coaching.module');

describe('AppModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });
});
