import { Injectable, Logger } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

export interface ConnectionValidationResult {
  success: boolean;
  error?: string;
  details?: {
    databaseName: string;
    host: string;
    port?: number;
  };
}

@Injectable()
export class ConnectionValidator {
  private readonly logger = new Logger(ConnectionValidator.name);

  constructor(private readonly configService: ConfigService) {}

  async validateConnection(): Promise<ConnectionValidationResult> {
    const appConfig = this.configService.get<AppConfig>('app')!;
    const { uri, databaseName } = appConfig.database;

    if (!uri) {
      return {
        success: false,
        error: 'Database URI is not configured',
      };
    }

    if (!databaseName) {
      return {
        success: false,
        error: 'Database name is not configured',
      };
    }

    try {
      this.logger.log('Validating MongoDB connection...');

      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
      });

      await client.connect();

      // Test the connection
      await client.db(databaseName).admin().ping();

      const url = new URL(uri);
      const result: ConnectionValidationResult = {
        success: true,
        details: {
          databaseName,
          host: url.hostname,
          port: url.port ? Number.parseInt(url.port, 10) : undefined,
        },
      };

      await client.close();
      return result;
    } catch (error) {
      this.logger.error('MongoDB connection validation failed:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown connection error',
      };
    }
  }
}
