import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HuaweiConnection } from './schemas/huawei-connection.schema';

export type EligibilityStatus = 'eligible' | 'notEligible' | 'actionRequired';

export type EligibilityReason =
  | 'eligible'
  | 'missingPermission'
  | 'missingDevice'
  | 'regionRestriction'
  | 'developerTierRestriction';

export interface AdvancedRecordMeta {
  recordType: string;
  displayName: string;
  description: string;
  requiredScope: string;
  requiredDataType: string;
}

export interface EligibilityReport extends AdvancedRecordMeta {
  status: EligibilityStatus;
  reason: EligibilityReason;
  explanation: string;
  nextSteps: string[];
}

@Injectable()
export class HuaweiEligibilityService {
  private readonly logger = new Logger(HuaweiEligibilityService.name);

  private readonly ADVANCED_CATALOG: AdvancedRecordMeta[] = [
    {
      recordType: 'sleepBreathing',
      displayName: 'Sleep Breathing Quality',
      description:
        'Tracks sleep breathing pauses and ventilation quality indicators.',
      requiredScope: 'HEALTHKIT_PULMONARY_READ',
      requiredDataType: 'com.huawei.health.record.sleep_breathing',
    },
    {
      recordType: 'cardiacAlerts',
      displayName: 'Tachycardia & Bradycardia Alerts',
      description:
        'Flag anomalous heart rhythm spikes and drops outside normal limits.',
      requiredScope: 'HEALTHKIT_HEARTRATE_READ',
      requiredDataType: 'com.huawei.health.record.tachycardia',
    },
    {
      recordType: 'abpm',
      displayName: 'Ambulatory Blood Pressure Monitoring',
      description:
        '24-hour interval blood pressure logs for chronic cardiovascular tracking.',
      requiredScope: 'HEALTHKIT_BLOODPRESSURE_READ',
      requiredDataType: 'com.huawei.health.record.abpm',
    },
    {
      recordType: 'skinTemperature',
      displayName: 'High Body Temperature Logs',
      description: 'Tracks skin temperature anomalies and fever thresholds.',
      requiredScope: 'HEALTHKIT_PULMONARY_READ',
      requiredDataType: 'com.huawei.continuous.skin_temperature',
    },
    {
      recordType: 'vo2Max',
      displayName: 'VO2 Max & Aerobic Capacity',
      description:
        'Measures maximal oxygen consumption during structured outdoor activities.',
      requiredScope: 'HEALTHKIT_ACTIVITY_RECORD_READ',
      requiredDataType: 'com.huawei.instant.vo2max',
    },
    {
      recordType: 'runningForm',
      displayName: 'Running Form Dynamics',
      description:
        'Analyzes stance time, flight time, vertical oscillation, and ground impact balance.',
      requiredScope: 'HEALTHKIT_ACTIVITY_RECORD_READ',
      requiredDataType: 'com.huawei.instant.running_form',
    },
  ];

  constructor(private readonly configService: ConfigService) {}

  /**
   * Evaluates eligibility for all catalog items based on user's connection profile, scopes, devices, and region.
   */
  evaluateEligibility(
    connection: HuaweiConnection | null,
    registeredDataTypes: string[],
  ): EligibilityReport[] {
    const reports: EligibilityReport[] = [];
    const devTier =
      this.configService.get<string>('app.huawei.developerTier') ||
      'individual';

    for (const record of this.ADVANCED_CATALOG) {
      reports.push(
        this.checkItemEligibility(
          record,
          connection,
          registeredDataTypes,
          devTier,
        ),
      );
    }

    return reports;
  }

  private checkItemEligibility(
    meta: AdvancedRecordMeta,
    conn: HuaweiConnection | null,
    registeredDataTypes: string[],
    devTier: string,
  ): EligibilityReport {
    // 1. Not connected state
    if (!conn || conn.status !== 'connected') {
      return {
        ...meta,
        status: 'actionRequired',
        reason: 'missingPermission',
        explanation: 'Huawei Account is not linked to your profile.',
        nextSteps: [
          'Connect your Huawei Health account under account settings.',
        ],
      };
    }

    // 2. Developer Tier Restriction Check
    if (
      devTier === 'individual' &&
      ['sleepBreathing', 'cardiacAlerts', 'abpm'].includes(meta.recordType)
    ) {
      return {
        ...meta,
        status: 'notEligible',
        reason: 'developerTierRestriction',
        explanation:
          'This analysis requires enterprise-level developer registration from the application host.',
        nextSteps: [
          'No immediate action. Enterprise clearance is pending for this application tier.',
        ],
      };
    }

    // 3. Regional Restriction Check (Note: RU region has full support for all advanced metrics)
    const activeRegion = conn.region || 'RU';
    if (meta.recordType === 'abpm' && activeRegion === 'US') {
      return {
        ...meta,
        status: 'notEligible',
        reason: 'regionRestriction',
        explanation:
          'Blood pressure reports are restricted in your region due to local regulatory compliance policies.',
        nextSteps: [
          'Verify if your Huawei ID account region is configured correctly.',
        ],
      };
    }

    // 4. Missing Permission Check
    const hasScope = conn.grantedScopes.includes(meta.requiredScope);
    if (!hasScope) {
      return {
        ...meta,
        status: 'actionRequired',
        reason: 'missingPermission',
        explanation: `Scope ${meta.requiredScope} was not granted during authorization.`,
        nextSteps: [
          `Re-authorize your connection and select the checkbox for ${meta.displayName} permissions.`,
        ],
      };
    }

    // 5. Hardware Device capability Check (Dynamically discovered from active data collectors!)
    const hasDeviceCapability =
      registeredDataTypes.includes(meta.requiredDataType) ||
      (meta.recordType === 'cardiacAlerts' &&
        registeredDataTypes.includes('com.huawei.health.record.bradycardia'));

    if (!hasDeviceCapability) {
      const hardwareMap: Record<string, string> = {
        'com.huawei.health.record.sleep_breathing':
          'TruSleep-enabled smartwatch with breathing monitoring capabilities',
        'com.huawei.health.record.tachycardia':
          'Smartwatch or band with continuous heart-rate tracking',
        'com.huawei.health.record.abpm':
          'Huawei Watch D or a supported blood pressure cuff connected to Huawei Health',
        'com.huawei.continuous.skin_temperature':
          'Smartwatch containing active skin temperature sensor',
        'com.huawei.instant.vo2max':
          'GPS watch linkage with running data streams',
        'com.huawei.instant.running_form':
          'Huawei S-Tag running pod or dual-sensor smart accessories',
      };

      return {
        ...meta,
        status: 'actionRequired',
        reason: 'missingDevice',
        explanation: `No active linked wearable is currently transmitting ${meta.requiredDataType} logs.`,
        nextSteps: [
          `Connect a compatible device (${
            hardwareMap[meta.requiredDataType] || 'wearable'
          }) in the Huawei Health app.`,
          'Ensure the measurement switch is toggled ON on your phone and trigger a sync.',
        ],
      };
    }

    // 6. Fully Eligible State
    return {
      ...meta,
      status: 'eligible',
      reason: 'eligible',
      explanation: 'All requirements met. Advanced data streams are active.',
      nextSteps: [],
    };
  }
}
