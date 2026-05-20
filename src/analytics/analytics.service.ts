import { Injectable, Logger } from '@nestjs/common';
import * as Amplitude from '@amplitude/node';
import { CountMetrics } from './count-metrics.enum';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private client: Amplitude.NodeClient | null = null;
  private readonly amplitudeEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const appConfig = this.configService.get<AppConfig>('app')!;
    this.amplitudeEnabled = appConfig.analytics.enabled;
  }

  private getClient(): Amplitude.NodeClient {
    if (!this.client) {
      const appConfig = this.configService.get<AppConfig>('app')!;
      const apiKey = appConfig.analytics.apiKey;
      this.client = Amplitude.init(apiKey);
    }
    return this.client;
  }

  logCountMetric(metricName: CountMetrics, userId?: string): void {
    this.logger.log(`${metricName} - User: ${userId}`);

    if (!this.amplitudeEnabled) {
      return;
    }

    try {
      const amplitudeClient = this.getClient();
      amplitudeClient
        .logEvent({
          event_type: metricName,
          user_id: userId,
        })
        .catch((error) => {
          this.logger.error('Failed to log event:', error);
        });
      amplitudeClient.flush().catch((error) => {
        this.logger.error('Failed to flush metrics:', error);
      });
    } catch (error) {
      this.logger.error('Failed to log metric:', error);
    }
  }
}
