import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { HuaweiEligibilityService } from './huawei-eligibility.service';
import { HuaweiConnection } from './schemas/huawei-connection.schema';

describe('HuaweiEligibilityService', () => {
  let service: HuaweiEligibilityService;
  let mockConfigService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'app.huawei.developerTier') {
          return 'enterprise';
        }
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HuaweiEligibilityService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<HuaweiEligibilityService>(HuaweiEligibilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateEligibility', () => {
    // 1. Not connected state
    it('should return actionRequired/missingPermission if connection is null or status is not connected', () => {
      const reports = service.evaluateEligibility(null, []);
      expect(reports).toHaveLength(6);
      for (const report of reports) {
        expect(report.status).toBe('actionRequired');
        expect(report.reason).toBe('missingPermission');
        expect(report.explanation).toContain('not linked');
      }
    });

    // 2. Developer Tier Restriction Check
    it('should mark sleepBreathing, cardiacAlerts, and abpm as notEligible under individual developer tier', () => {
      mockConfigService.get = jest.fn().mockReturnValue('individual');

      const mockConnection: HuaweiConnection = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        providerUserId: 'test_provider_id',
        status: 'connected',
        grantedScopes: [],
        grantedCategories: [],
        enabledCategories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        region: 'RU',
        linkedDevices: [],
      };

      const reports = service.evaluateEligibility(mockConnection, []);

      const sleepReport = reports.find(
        (r) => r.recordType === 'sleepBreathing',
      );
      const cardiacReport = reports.find(
        (r) => r.recordType === 'cardiacAlerts',
      );
      const abpmReport = reports.find((r) => r.recordType === 'abpm');
      const skinTempReport = reports.find(
        (r) => r.recordType === 'skinTemperature',
      );

      expect(sleepReport?.status).toBe('notEligible');
      expect(sleepReport?.reason).toBe('developerTierRestriction');

      expect(cardiacReport?.status).toBe('notEligible');
      expect(cardiacReport?.reason).toBe('developerTierRestriction');

      expect(abpmReport?.status).toBe('notEligible');
      expect(abpmReport?.reason).toBe('developerTierRestriction');

      // skin temperature is not restricted by individual tier
      expect(skinTempReport?.status).not.toBe('notEligible');
    });

    // 3. Regional Restriction Check
    it('should block ABPM for US region, but allow for RU region', () => {
      mockConfigService.get = jest.fn().mockReturnValue('enterprise');

      const mockConnectionUS: HuaweiConnection = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        providerUserId: 'test_provider_id',
        status: 'connected',
        grantedScopes: ['HEALTHKIT_BLOODPRESSURE_READ'],
        grantedCategories: [],
        enabledCategories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        region: 'US',
        linkedDevices: [],
      };

      const reportsUS = service.evaluateEligibility(mockConnectionUS, [
        'com.huawei.health.record.abpm',
      ]);
      const abpmReportUS = reportsUS.find((r) => r.recordType === 'abpm');
      expect(abpmReportUS?.status).toBe('notEligible');
      expect(abpmReportUS?.reason).toBe('regionRestriction');

      const mockConnectionRU: HuaweiConnection = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        providerUserId: 'test_provider_id',
        status: 'connected',
        grantedScopes: ['HEALTHKIT_BLOODPRESSURE_READ'],
        grantedCategories: [],
        enabledCategories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        region: 'RU',
        linkedDevices: [],
      };

      const reportsRU = service.evaluateEligibility(mockConnectionRU, [
        'com.huawei.health.record.abpm',
      ]);
      const abpmReportRU = reportsRU.find((r) => r.recordType === 'abpm');
      expect(abpmReportRU?.status).toBe('eligible');
    });

    // 4. Missing Permission Check
    it('should mark record as actionRequired/missingPermission if required scope is not granted', () => {
      mockConfigService.get = jest.fn().mockReturnValue('enterprise');

      const mockConnection: HuaweiConnection = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        providerUserId: 'test_provider_id',
        status: 'connected',
        grantedScopes: [], // Empty scopes
        grantedCategories: [],
        enabledCategories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        region: 'RU',
        linkedDevices: [],
      };

      const reports = service.evaluateEligibility(mockConnection, [
        'com.huawei.continuous.skin_temperature',
      ]);
      const skinTempReport = reports.find(
        (r) => r.recordType === 'skinTemperature',
      );

      expect(skinTempReport?.status).toBe('actionRequired');
      expect(skinTempReport?.reason).toBe('missingPermission');
      expect(skinTempReport?.explanation).toContain(
        'Scope HEALTHKIT_PULMONARY_READ was not granted',
      );
    });

    // 5. Missing Hardware / Device Check
    it('should mark as actionRequired/missingDevice if data collector is missing', () => {
      mockConfigService.get = jest.fn().mockReturnValue('enterprise');

      const mockConnection: HuaweiConnection = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        providerUserId: 'test_provider_id',
        status: 'connected',
        grantedScopes: ['HEALTHKIT_PULMONARY_READ'],
        grantedCategories: [],
        enabledCategories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        region: 'RU',
        linkedDevices: [],
      };

      // Pass only skin temp datatype but check sleep breathing which also requires PULMONARY scope
      const reports = service.evaluateEligibility(mockConnection, [
        'com.huawei.continuous.skin_temperature',
      ]);
      const sleepBreathingReport = reports.find(
        (r) => r.recordType === 'sleepBreathing',
      );

      expect(sleepBreathingReport?.status).toBe('actionRequired');
      expect(sleepBreathingReport?.reason).toBe('missingDevice');
      expect(sleepBreathingReport?.explanation).toContain(
        'No active linked wearable is currently transmitting',
      );
      expect(sleepBreathingReport?.nextSteps[0]).toContain(
        'TruSleep-enabled smartwatch',
      );
    });

    // 6. Full Eligible State
    it('should return eligible status for all advanced metrics when all conditions match', () => {
      mockConfigService.get = jest.fn().mockReturnValue('enterprise');

      const mockConnection: HuaweiConnection = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        providerUserId: 'test_provider_id',
        status: 'connected',
        grantedScopes: [
          'HEALTHKIT_PULMONARY_READ',
          'HEALTHKIT_HEARTRATE_READ',
          'HEALTHKIT_BLOODPRESSURE_READ',
          'HEALTHKIT_ACTIVITY_RECORD_READ',
        ],
        grantedCategories: [],
        enabledCategories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        region: 'RU',
        linkedDevices: [],
      };

      const registeredDataTypes = [
        'com.huawei.health.record.sleep_breathing',
        'com.huawei.health.record.tachycardia',
        'com.huawei.health.record.abpm',
        'com.huawei.continuous.skin_temperature',
        'com.huawei.instant.vo2max',
        'com.huawei.instant.running_form',
      ];

      const reports = service.evaluateEligibility(
        mockConnection,
        registeredDataTypes,
      );
      expect(reports).toHaveLength(6);
      for (const report of reports) {
        expect(report.status).toBe('eligible');
        expect(report.reason).toBe('eligible');
        expect(report.nextSteps).toHaveLength(0);
      }
    });
  });
});
