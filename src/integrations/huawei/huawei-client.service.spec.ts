import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HuaweiClientService } from './huawei-client.service';

describe('HuaweiClientService', () => {
  let service: HuaweiClientService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HuaweiClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'HUAWEI_MOCK_API') {
                return 'false';
              }
              if (key === 'app') {
                return {
                  huawei: {
                    oauthTokenUrl: 'https://health-api.cloud.huawei.com',
                  },
                };
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<HuaweiClientService>(HuaweiClientService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isMock / generateMock branches', () => {
    it('should generate mock daily activity if token is mock_', async () => {
      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getActivityDaily('mock_token', from, to);
      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(result[0].steps).toBeGreaterThanOrEqual(4000);
      expect(result[0].date).toBe('2026-05-20');
    });

    it('should generate mock workouts if token is mock_', async () => {
      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getWorkouts('mock_token', from, to);
      expect(result).toBeDefined();
    });

    it('should generate mock sleep if token is mock_', async () => {
      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getSleep('mock_token', from, to);
      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(result[0].sleepId).toBeDefined();
    });

    it('should generate mock heart rate if token is mock_', async () => {
      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getHeartSignals('mock_token', from, to);
      expect(result).toBeDefined();
    });

    it('should generate mock SpO2 if token is mock_', async () => {
      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getSpO2('mock_token', from, to);
      expect(result).toBeDefined();
    });
  });

  describe('HTTP API client branches', () => {
    it('should fetch real daily activities successfully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            activities: [
              {
                date: '2026-05-20',
                steps: 5000,
                calories: 250,
                distance: 3000,
                intensityMinutes: 20,
                hoursActive: 8,
              },
            ],
          }),
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getActivityDaily('real_token', from, to);
      expect(result).toEqual([
        {
          date: '2026-05-20',
          steps: 5000,
          calories: 250,
          distance: 3000,
          intensityMinutes: 20,
          hoursActive: 8,
        },
      ]);
    });

    it('should throw error when daily activities HTTP request fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      await expect(
        service.getActivityDaily('real_token', from, to),
      ).rejects.toThrow('Huawei API Error: 400');
    });

    it('should fetch real workouts successfully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            activityRecords: [
              {
                id: '123',
                activityType: 'running',
                startTime: '2026-05-20T10:00:00.000Z',
                endTime: '2026-05-20T11:00:00.000Z',
                duration: 3600,
                calories: 500,
                distance: 10000,
                avgHeartRate: 145,
                maxHeartRate: 175,
              },
            ],
          }),
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getWorkouts('real_token', from, to);
      expect(result.length).toBe(1);
      expect(result[0].workoutId).toBe('123');
    });

    it('should throw error when workouts HTTP request fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      await expect(
        service.getWorkouts('real_token', from, to),
      ).rejects.toThrow();
    });

    it('should fetch real sleep successfully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            healthRecords: [
              {
                id: 'sleep-123',
                startTime: '2026-05-20T23:00:00.000Z',
                endTime: '2026-05-21T07:00:00.000Z',
                duration: 480,
                deepSleepDuration: 120,
                lightSleepDuration: 240,
                remSleepDuration: 96,
                awakeDuration: 24,
              },
            ],
          }),
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getSleep('real_token', from, to);
      expect(result.length).toBe(1);
      expect(result[0].sleepId).toBe('sleep-123');
    });

    it('should throw error when sleep HTTP request fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      await expect(service.getSleep('real_token', from, to)).rejects.toThrow();
    });

    it('should fetch real heart signals successfully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            heartRates: [
              {
                timestamp: '2026-05-20T12:00:00.000Z',
                heartRate: 72,
                restingHeartRate: 60,
                hrv: 55,
              },
            ],
          }),
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getHeartSignals('real_token', from, to);
      expect(result.length).toBe(1);
      expect(result[0].heartRate).toBe(72);
    });

    it('should throw error when heart rate HTTP request fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      await expect(
        service.getHeartSignals('real_token', from, to),
      ).rejects.toThrow();
    });

    it('should fetch real SpO2 successfully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            spo2Records: [
              {
                timestamp: '2026-05-20T12:00:00.000Z',
                spo2: 98,
                isLowSpO2: false,
              },
            ],
          }),
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      const result = await service.getSpO2('real_token', from, to);
      expect(result.length).toBe(1);
      expect(result[0].spo2).toBe(98);
    });

    it('should throw error when SpO2 HTTP request fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const from = new Date('2026-05-20');
      const to = new Date('2026-05-21');
      await expect(service.getSpO2('real_token', from, to)).rejects.toThrow();
    });
  });
});
