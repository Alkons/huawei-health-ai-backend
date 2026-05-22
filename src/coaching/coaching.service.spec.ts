import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { CoachingService } from './coaching.service';
import { HealthDataService } from '../health-data/health-data.service';
import { CoachingFeedback } from './schemas/coaching-feedback.schema';

describe('CoachingService', () => {
  let service: CoachingService;

  const mockFeedbackModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const mockHealthDataService = {
    getReliabilityReport: jest.fn(),
    getTimeline: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'app.ai.providerApiKey') return 'test-api-key';
      if (key === 'app.ai.providerBaseUrl') return 'https://api.openai.com/v1';
      if (key === 'app.ai.model') return 'gpt-4o-mini';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoachingService,
        {
          provide: HealthDataService,
          useValue: mockHealthDataService,
        },
        {
          provide: getModelToken(CoachingFeedback.name),
          useValue: mockFeedbackModel,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CoachingService>(CoachingService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLatestCoachingFeedback', () => {
    it('should return null when no coaching feedback is stored', async () => {
      mockFeedbackModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.getLatestCoachingFeedback(
        '507f1f77bcf86cd799439011',
      );
      expect(result).toBeNull();
    });

    it('should return mapped DTO when cached feedback exists', async () => {
      const dbDoc = {
        summary: 'Excellent work!',
        positiveSignals: ['High active calories'],
        concerns: [],
        nextActions: ['Keep active'],
        followUpQuestions: [],
        confidenceLevel: 'high',
        hasSafetyAlert: false,
        disclaimer: 'Non-medical information',
        date: '2026-05-22',
      };

      mockFeedbackModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(dbDoc),
        }),
      });

      const result = await service.getLatestCoachingFeedback(
        '507f1f77bcf86cd799439011',
      );
      expect(result).toEqual(dbDoc);
    });
  });

  describe('generateCoachingFeedback', () => {
    const userId = new Types.ObjectId().toString();
    const date = '2026-05-22';

    beforeEach(() => {
      // Stub global fetch
      global.fetch = jest.fn();
    });

    it('Scenario A: should generate grounded coaching feedback for High Training Load + Reduced Sleep', async () => {
      mockHealthDataService.getReliabilityReport.mockResolvedValue({
        overall: {
          freshness: 'fresh',
          completeness: 'complete',
          confidence: 'high',
        },
        categories: [
          {
            category: 'activity',
            status: 'synced',
            reasonClass: 'ok',
            freshness: 'fresh',
          },
          {
            category: 'workouts',
            status: 'synced',
            reasonClass: 'ok',
            freshness: 'fresh',
          },
          {
            category: 'sleep',
            status: 'synced',
            reasonClass: 'ok',
            freshness: 'fresh',
          },
        ],
      });

      mockHealthDataService.getTimeline.mockResolvedValue([
        {
          type: 'activity',
          data: {
            date: '2026-05-22',
            steps: 15000,
            calories: 600,
            distance: 10000,
            hoursActive: 5,
          },
        },
        {
          type: 'workout',
          data: {
            activityType: 'running',
            startTime: new Date(),
            duration: 3600,
            calories: 700,
            avgHeartRate: 150,
          },
        },
        {
          type: 'sleep',
          data: {
            startTime: new Date(),
            duration: 330,
            deepSleepDuration: 60,
            lightSleepDuration: 270,
          }, // 5.5 hours
        },
      ]);

      const aiMockResponse = {
        summary:
          'Your training load is high, but your sleep is falling behind.',
        positiveSignals: ['Consistent running sessions', 'High step counts'],
        concerns: ['Sleep duration decreased below 6 hours'],
        nextActions: [
          'Prioritize a full 8-hour sleep cycle tonight',
          'Plan a light recovery walk tomorrow',
        ],
        followUpQuestions: ['Do you feel fatigued during daily hours?'],
        disclaimer: 'General wellness guidelines only.',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(aiMockResponse) } }],
          }),
      });

      mockFeedbackModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...aiMockResponse,
          confidenceLevel: 'high',
          hasSafetyAlert: false,
          date,
        }),
      });

      const result = await service.generateCoachingFeedback(userId, date);

      expect(result.summary).toContain('training load is high');
      expect(result.confidenceLevel).toBe('high');
      expect(result.hasSafetyAlert).toBe(false);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('Scenario B: should generate grounded coaching feedback for Improved Sleep + Stable Activity', async () => {
      mockHealthDataService.getReliabilityReport.mockResolvedValue({
        overall: {
          freshness: 'fresh',
          completeness: 'complete',
          confidence: 'high',
        },
        categories: [
          {
            category: 'activity',
            status: 'synced',
            reasonClass: 'ok',
            freshness: 'fresh',
          },
          {
            category: 'sleep',
            status: 'synced',
            reasonClass: 'ok',
            freshness: 'fresh',
          },
        ],
      });

      mockHealthDataService.getTimeline.mockResolvedValue([
        {
          type: 'activity',
          data: {
            date: '2026-05-22',
            steps: 8000,
            calories: 300,
            distance: 5000,
            hoursActive: 4,
          },
        },
        {
          type: 'sleep',
          data: {
            startTime: new Date(),
            duration: 480,
            deepSleepDuration: 120,
            lightSleepDuration: 360,
          }, // 8 hours
        },
      ]);

      const aiMockResponse = {
        summary:
          'Excellent recovery phase! Your sleep is optimal while maintaining baseline activity.',
        positiveSignals: [
          'Sleep duration reached 8 hours',
          'Consistent moderate step baseline',
        ],
        concerns: [],
        nextActions: [
          'Continue with this recovery balance',
          'Schedule your next moderate workout',
        ],
        followUpQuestions: [],
        disclaimer: 'General wellness guidelines only.',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(aiMockResponse) } }],
          }),
      });

      mockFeedbackModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...aiMockResponse,
          confidenceLevel: 'high',
          hasSafetyAlert: false,
          date,
        }),
      });

      const result = await service.generateCoachingFeedback(userId, date);

      expect(result.summary).toContain('Excellent recovery');
      expect(result.confidenceLevel).toBe('high');
      expect(result.concerns).toHaveLength(0);
    });

    it('Scenario C: should generate coaching feedback reflecting low confidence guidelines', async () => {
      mockHealthDataService.getReliabilityReport.mockResolvedValue({
        overall: {
          freshness: 'stale',
          completeness: 'partial',
          confidence: 'low',
        },
        categories: [
          {
            category: 'activity',
            status: 'synced',
            reasonClass: 'ok',
            freshness: 'stale',
          },
          {
            category: 'sleep',
            status: 'failed',
            reasonClass: 'noDataForRange',
            freshness: 'unknown',
          },
        ],
      });

      mockHealthDataService.getTimeline.mockResolvedValue([
        {
          type: 'activity',
          data: {
            date: '2026-05-22',
            steps: 4000,
            calories: 150,
            distance: 2000,
            hoursActive: 2,
          },
        },
      ]);

      const aiMockResponse = {
        summary: 'Insights are limited because sleep syncing failed recently.',
        positiveSignals: [],
        concerns: [
          'Partial sync detected. Some health categories are missing.',
        ],
        nextActions: [
          'Open Huawei Health to sync your data',
          'Ensure device is connected',
        ],
        followUpQuestions: ['Did you sync your wearable today?'],
        disclaimer: 'General wellness guidelines only.',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(aiMockResponse) } }],
          }),
      });

      mockFeedbackModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...aiMockResponse,
          confidenceLevel: 'low',
          hasSafetyAlert: false,
          date,
        }),
      });

      const result = await service.generateCoachingFeedback(userId, date);

      expect(result.confidenceLevel).toBe('low');
      expect(result.summary).toContain('Insights are limited');
    });

    it('Scenario D: should return welcoming baseline for new user with limited history', async () => {
      mockHealthDataService.getReliabilityReport.mockResolvedValue({
        overall: {
          freshness: 'unknown',
          completeness: 'none',
          confidence: 'low',
        },
        categories: [],
      });

      mockHealthDataService.getTimeline.mockResolvedValue([]);

      const aiMockResponse = {
        summary: 'Welcome! We are building your wellness baseline.',
        positiveSignals: [],
        concerns: ['No historical data points synchronized yet.'],
        nextActions: ['Wear your device consistently to build a profile'],
        followUpQuestions: [],
        disclaimer: 'General wellness guidelines only.',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify(aiMockResponse) } }],
          }),
      });

      mockFeedbackModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...aiMockResponse,
          confidenceLevel: 'low',
          hasSafetyAlert: false,
          date,
        }),
      });

      const result = await service.generateCoachingFeedback(userId, date);
      expect(result.summary).toContain('Welcome');
      expect(result.confidenceLevel).toBe('low');
    });

    it('Scenario E: should bypass AI and return safety override when low SpO2 is detected', async () => {
      mockHealthDataService.getReliabilityReport.mockResolvedValue({
        overall: {
          freshness: 'fresh',
          completeness: 'complete',
          confidence: 'high',
        },
        categories: [
          {
            category: 'activity',
            status: 'synced',
            reasonClass: 'ok',
            freshness: 'fresh',
          },
        ],
      });

      mockHealthDataService.getTimeline.mockResolvedValue([
        {
          type: 'activity',
          data: {
            date: '2026-05-22',
            steps: 1000,
            calories: 50,
            distance: 500,
            hoursActive: 1,
            spo2: 85,
          }, // SpO2 is low!
        },
      ]);

      mockFeedbackModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const result = await service.generateCoachingFeedback(userId, date);

      expect(result.hasSafetyAlert).toBe(true);
      expect(result.summary).toContain('abnormality detected');
      expect(result.concerns).toContain(
        'Low SpO2 record exists in your recent telemetry history.',
      );
      expect(result.nextActions).toContain(
        'Prioritize rest and seek professional medical guidance if you feel unwell.',
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fallback to default baseline response when AI API fails', async () => {
      mockHealthDataService.getReliabilityReport.mockResolvedValue({
        overall: {
          freshness: 'fresh',
          completeness: 'complete',
          confidence: 'high',
        },
        categories: [
          {
            category: 'activity',
            status: 'synced',
            reasonClass: 'ok',
            freshness: 'fresh',
          },
        ],
      });

      mockHealthDataService.getTimeline.mockResolvedValue([]);

      // Make fetch reject to trigger API error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network clog!'));

      mockFeedbackModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          summary:
            'Data synchronization in progress. We are preparing your personalized coaching insight.',
          positiveSignals: [],
          concerns: [
            'Synchronization pipeline is building a history baseline.',
          ],
          nextActions: ['Wear your Huawei device consistently'],
          followUpQuestions: [],
          confidenceLevel: 'high',
          hasSafetyAlert: false,
          disclaimer: 'Wellness disclaimer',
          date,
        }),
      });

      const result = await service.generateCoachingFeedback(userId, date);

      expect(result.summary).toContain('Data synchronization in progress');
      expect(result.confidenceLevel).toBe('high');
    });
  });
});
