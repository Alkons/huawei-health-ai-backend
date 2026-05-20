import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

export interface HuaweiRawActivity {
  date: string;
  steps: number;
  calories: number;
  distance: number;
  intensityMinutes: number;
  hoursActive: number;
}

export interface HuaweiRawWorkout {
  workoutId: string;
  activityType: string;
  startTime: Date;
  endTime: Date;
  duration: number; // seconds
  calories: number; // kcal
  distance?: number; // meters
  avgHeartRate?: number;
  maxHeartRate?: number;
}

export interface HuaweiRawSleep {
  sleepId: string;
  startTime: Date;
  endTime: Date;
  duration: number; // minutes
  deepSleepDuration?: number;
  lightSleepDuration?: number;
  remSleepDuration?: number;
  awakeDuration?: number;
}

export interface HuaweiRawHeartRate {
  timestamp: Date;
  heartRate: number;
  restingHeartRate?: number;
  hrv?: number;
}

export interface HuaweiRawSpO2 {
  timestamp: Date;
  spo2: number;
  isLowSpO2?: boolean;
}

interface HuaweiDailyResponse {
  activities?: Array<{
    date: string;
    steps?: number;
    calories?: number;
    distance?: number;
    intensityMinutes?: number;
    hoursActive?: number;
  }>;
}

interface HuaweiWorkoutsResponse {
  activityRecords?: Array<{
    id: string;
    activityType?: string;
    startTime: string;
    endTime: string;
    duration?: number;
    calories?: number;
    distance?: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
  }>;
}

interface HuaweiSleepResponse {
  healthRecords?: Array<{
    id: string;
    startTime: string;
    endTime: string;
    duration?: number;
    deepSleepDuration?: number;
    lightSleepDuration?: number;
    remSleepDuration?: number;
    awakeDuration?: number;
  }>;
}

interface HuaweiHeartRateResponse {
  heartRates?: Array<{
    timestamp: string;
    heartRate: number;
    restingHeartRate?: number;
    hrv?: number;
  }>;
}

interface HuaweiSpO2Response {
  spo2Records?: Array<{
    timestamp: string;
    spo2: number;
    isLowSpO2?: boolean;
  }>;
}

@Injectable()
export class HuaweiClientService {
  private readonly logger = new Logger(HuaweiClientService.name);

  constructor(private readonly configService: ConfigService) {}

  private isMock(token: string): boolean {
    const useMock =
      this.configService.get<string>('HUAWEI_MOCK_API') === 'true';
    return useMock || token.startsWith('mock_');
  }

  private getBaseUrl(): string {
    const appConfig = this.configService.get<AppConfig>('app');
    return appConfig?.huawei?.oauthTokenUrl?.includes('cloud.huawei.com')
      ? 'https://health-api.cloud.huawei.com'
      : 'http://localhost:3005/mock-huawei';
  }

  async getActivityDaily(
    token: string,
    from: Date,
    to: Date,
  ): Promise<HuaweiRawActivity[]> {
    if (this.isMock(token)) {
      return this.generateMockActivity(from, to);
    }

    try {
      const response = await fetch(
        `${this.getBaseUrl()}/healthkit/v2/samplingDatasets/daily`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!response.ok) {
        throw new Error(`Huawei API Error: ${response.status}`);
      }
      const data = (await response.json()) as HuaweiDailyResponse;
      return (data.activities || []).map((act) => ({
        date: act.date,
        steps: act.steps || 0,
        calories: act.calories || 0,
        distance: act.distance || 0,
        intensityMinutes: act.intensityMinutes || 0,
        hoursActive: act.hoursActive || 0,
      }));
    } catch (err) {
      this.logger.error('Failed to fetch activity daily from Huawei', err);
      throw err;
    }
  }

  async getWorkouts(
    token: string,
    from: Date,
    to: Date,
  ): Promise<HuaweiRawWorkout[]> {
    if (this.isMock(token)) {
      return this.generateMockWorkouts(from, to);
    }

    try {
      const response = await fetch(
        `${this.getBaseUrl()}/healthkit/v2/activityRecords?startTime=${from.toISOString()}&endTime=${to.toISOString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!response.ok) {
        throw new Error(`Huawei API Error: ${response.status}`);
      }
      const data = (await response.json()) as HuaweiWorkoutsResponse;
      return (data.activityRecords || []).map((rec) => ({
        workoutId: rec.id,
        activityType: rec.activityType || 'running',
        startTime: new Date(rec.startTime),
        endTime: new Date(rec.endTime),
        duration: rec.duration || 0,
        calories: rec.calories || 0,
        distance: rec.distance,
        avgHeartRate: rec.avgHeartRate,
        maxHeartRate: rec.maxHeartRate,
      }));
    } catch (err) {
      this.logger.error('Failed to fetch workouts from Huawei', err);
      throw err;
    }
  }

  async getSleep(
    token: string,
    from: Date,
    to: Date,
  ): Promise<HuaweiRawSleep[]> {
    if (this.isMock(token)) {
      return this.generateMockSleep(from, to);
    }

    try {
      const response = await fetch(
        `${this.getBaseUrl()}/healthkit/v2/healthRecords?type=sleep&startTime=${from.toISOString()}&endTime=${to.toISOString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!response.ok) {
        throw new Error(`Huawei API Error: ${response.status}`);
      }
      const data = (await response.json()) as HuaweiSleepResponse;
      return (data.healthRecords || []).map((rec) => ({
        sleepId: rec.id,
        startTime: new Date(rec.startTime),
        endTime: new Date(rec.endTime),
        duration: rec.duration || 0,
        deepSleepDuration: rec.deepSleepDuration,
        lightSleepDuration: rec.lightSleepDuration,
        remSleepDuration: rec.remSleepDuration,
        awakeDuration: rec.awakeDuration,
      }));
    } catch (err) {
      this.logger.error('Failed to fetch sleep from Huawei', err);
      throw err;
    }
  }

  async getHeartSignals(
    token: string,
    from: Date,
    to: Date,
  ): Promise<HuaweiRawHeartRate[]> {
    if (this.isMock(token)) {
      return this.generateMockHeartSignals(from, to);
    }

    try {
      const response = await fetch(
        `${this.getBaseUrl()}/healthkit/v2/samplingDatasets/heartRate?startTime=${from.toISOString()}&endTime=${to.toISOString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!response.ok) {
        throw new Error(`Huawei API Error: ${response.status}`);
      }
      const data = (await response.json()) as HuaweiHeartRateResponse;
      return (data.heartRates || []).map((hr) => ({
        timestamp: new Date(hr.timestamp),
        heartRate: hr.heartRate,
        restingHeartRate: hr.restingHeartRate,
        hrv: hr.hrv,
      }));
    } catch (err) {
      this.logger.error('Failed to fetch heart signals from Huawei', err);
      throw err;
    }
  }

  async getSpO2(token: string, from: Date, to: Date): Promise<HuaweiRawSpO2[]> {
    if (this.isMock(token)) {
      return this.generateMockSpO2(from, to);
    }

    try {
      const response = await fetch(
        `${this.getBaseUrl()}/healthkit/v2/samplingDatasets/spo2?startTime=${from.toISOString()}&endTime=${to.toISOString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!response.ok) {
        throw new Error(`Huawei API Error: ${response.status}`);
      }
      const data = (await response.json()) as HuaweiSpO2Response;
      return (data.spo2Records || []).map((sp) => ({
        timestamp: new Date(sp.timestamp),
        spo2: sp.spo2,
        isLowSpO2: sp.isLowSpO2 || false,
      }));
    } catch (err) {
      this.logger.error('Failed to fetch SpO2 from Huawei', err);
      throw err;
    }
  }

  private generateMockActivity(from: Date, to: Date): HuaweiRawActivity[] {
    const list: HuaweiRawActivity[] = [];
    const current = new Date(from);
    while (current <= to) {
      const dateString = current.toISOString().split('T')[0];
      list.push({
        date: dateString,
        steps: Math.floor(Math.random() * 8000) + 4000,
        calories: Math.floor(Math.random() * 400) + 200,
        distance: Math.floor(Math.random() * 5000) + 2000,
        intensityMinutes: Math.floor(Math.random() * 45) + 15,
        hoursActive: Math.floor(Math.random() * 6) + 6,
      });
      current.setDate(current.getDate() + 1);
    }
    return list;
  }

  private generateMockWorkouts(from: Date, to: Date): HuaweiRawWorkout[] {
    const list: HuaweiRawWorkout[] = [];
    const current = new Date(from);
    let index = 0;
    while (current <= to) {
      if (Math.random() > 0.4) {
        const start = new Date(current);
        start.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);
        const end = new Date(start);
        const durationSec = Math.floor(Math.random() * 3600) + 1800; // 30-90m
        end.setSeconds(end.getSeconds() + durationSec);

        list.push({
          workoutId: `mock_workout_${index++}_${current.getTime()}`,
          activityType: Math.random() > 0.5 ? 'running' : 'cycling',
          startTime: start,
          endTime: end,
          duration: durationSec,
          calories: Math.floor(Math.random() * 500) + 250,
          distance: Math.floor(Math.random() * 10000) + 5000,
          avgHeartRate: Math.floor(Math.random() * 40) + 130,
          maxHeartRate: Math.floor(Math.random() * 30) + 170,
        });
      }
      current.setDate(current.getDate() + 1);
    }
    return list;
  }

  private generateMockSleep(from: Date, to: Date): HuaweiRawSleep[] {
    const list: HuaweiRawSleep[] = [];
    const current = new Date(from);
    let index = 0;
    while (current <= to) {
      const start = new Date(current);
      start.setHours(23, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      end.setHours(7, Math.floor(Math.random() * 60), 0, 0);

      const totalMin = Math.floor((end.getTime() - start.getTime()) / 60000);
      const deep = Math.floor(totalMin * 0.25);
      const rem = Math.floor(totalMin * 0.2);
      const light = Math.floor(totalMin * 0.5);
      const awake = totalMin - deep - rem - light;

      list.push({
        sleepId: `mock_sleep_${index++}_${current.getTime()}`,
        startTime: start,
        endTime: end,
        duration: totalMin,
        deepSleepDuration: deep,
        lightSleepDuration: light,
        remSleepDuration: rem,
        awakeDuration: awake,
      });
      current.setDate(current.getDate() + 1);
    }
    return list;
  }

  private generateMockHeartSignals(from: Date, to: Date): HuaweiRawHeartRate[] {
    const list: HuaweiRawHeartRate[] = [];
    const current = new Date(from);
    while (current <= to) {
      for (let hour = 0; hour < 24; hour += 4) {
        const timestamp = new Date(current);
        timestamp.setHours(hour, 0, 0, 0);
        list.push({
          timestamp,
          heartRate: Math.floor(Math.random() * 40) + 60,
          restingHeartRate: Math.floor(Math.random() * 10) + 55,
          hrv: Math.floor(Math.random() * 30) + 40,
        });
      }
      current.setDate(current.getDate() + 1);
    }
    return list;
  }

  private generateMockSpO2(from: Date, to: Date): HuaweiRawSpO2[] {
    const list: HuaweiRawSpO2[] = [];
    const current = new Date(from);
    while (current <= to) {
      for (let hour = 2; hour < 24; hour += 6) {
        const timestamp = new Date(current);
        timestamp.setHours(hour, 0, 0, 0);
        const spo2 = Math.floor(Math.random() * 5) + 95; // 95-99%
        list.push({
          timestamp,
          spo2,
          isLowSpO2: spo2 < 95,
        });
      }
      current.setDate(current.getDate() + 1);
    }
    return list;
  }
}
