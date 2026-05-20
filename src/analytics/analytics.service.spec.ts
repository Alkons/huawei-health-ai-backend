import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { ConfigService } from '@nestjs/config';
import * as Amplitude from '@amplitude/node';
import { CountMetrics } from './count-metrics.enum';

// Mock the entire amplitude module
jest.mock('@amplitude/node', () => ({
  init: jest.fn(),
}));

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockAmplitudeClient: {
    logEvent: jest.Mock;
    flush: jest.Mock;
  };

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    mockAmplitudeClient = {
      logEvent: jest.fn().mockImplementation(() => Promise.resolve()),
      flush: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    (Amplitude.init as jest.Mock).mockReturnValue(mockAmplitudeClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app') {
                return {
                  analytics: {
                    enabled: true,
                    apiKey: 'test-api-key',
                  },
                };
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logCountMetric', () => {
    it('should log event when analytics is enabled', () => {
      service.logCountMetric(CountMetrics.LOGIN, 'user-123');

      expect(Amplitude.init).toHaveBeenCalledWith('test-api-key');
      expect(mockAmplitudeClient.logEvent).toHaveBeenCalledWith({
        event_type: CountMetrics.LOGIN,
        user_id: 'user-123',
      });
      expect(mockAmplitudeClient.flush).toHaveBeenCalled();
    });

    it('should not log event when analytics is disabled', async () => {
      // Re-create module with disabled analytics
      const moduleDisabled = await Test.createTestingModule({
        providers: [
          AnalyticsService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'app') {
                  return {
                    analytics: {
                      enabled: false,
                      apiKey: 'test-api-key',
                    },
                  };
                }
                return null;
              }),
            },
          },
        ],
      }).compile();

      const serviceDisabled =
        moduleDisabled.get<AnalyticsService>(AnalyticsService);
      serviceDisabled.logCountMetric(CountMetrics.LOGIN, 'user-123');

      expect(Amplitude.init).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully during logEvent', () => {
      mockAmplitudeClient.logEvent.mockRejectedValue(new Error('Log failed'));
      // Should not throw
      expect(() =>
        service.logCountMetric(CountMetrics.LOGIN, 'user-123'),
      ).not.toThrow();
    });
  });
});
