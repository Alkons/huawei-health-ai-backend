import { Test, TestingModule } from '@nestjs/testing';
import { AuthModule } from './auth.module';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { UsersService } from '../users/users.service';
import { AnalyticsService } from '../analytics/analytics.service';
import configuration from '../config/configuration';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Session } from './schemas/session.schema';
import { SessionsService } from './sessions.service';

describe('AuthModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    // Define a MockUsersModule
    class MockUsersModule {
      static isMock = true;
    }

    // Define a MockAnalyticsModule
    class MockAnalyticsModule {
      static isMock = true;
    }

    module = await Test.createTestingModule({
      imports: [
        AuthModule,
        ConfigModule.forRoot({
          load: [configuration],
          isGlobal: true,
        }),
        UsersModule,
        AnalyticsModule,
      ],
    })
      .overrideModule(UsersModule)
      .useModule({
        module: MockUsersModule,
        providers: [{ provide: UsersService, useValue: {} }],
        exports: [UsersService],
      })
      .overrideModule(AnalyticsModule)
      .useModule({
        module: MockAnalyticsModule,
        providers: [{ provide: AnalyticsService, useValue: {} }],
        exports: [AnalyticsService],
      })
      // Overriding SessionsService prevents the CACHE_SERVICE leak
      .overrideProvider(SessionsService)
      .useValue({})
      // Satisfy Mongoose dependencies for AuthModule
      .overrideProvider(getModelToken(Session.name))
      .useValue({})
      .overrideProvider(getConnectionToken())
      .useValue({
        model: jest.fn(),
      })
      .compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });
});
