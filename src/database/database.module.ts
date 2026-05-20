import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ConnectionValidator } from './connection-validator';
import { AppConfig } from '../config/configuration';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const appConfig = configService.get<AppConfig>('app')!;
        const { uri, databaseName, poolSize } = appConfig.database;

        Logger.log(`Connecting to MongoDB: ${uri}`, 'DatabaseModule');
        Logger.log(`Database name: ${databaseName}`, 'DatabaseModule');
        Logger.log(`Pool size: ${poolSize}`, 'DatabaseModule');

        return {
          uri,
          dbName: databaseName,
          maxPoolSize: poolSize,
          heartbeatFrequencyMS: 60000,
          minHeartbeatFrequencyMS: 60000,
          connectTimeoutMS: 150000,
          maxIdleTimeMS: 60000,
          socketTimeoutMS: 90000,
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [ConnectionValidator],
  exports: [MongooseModule, ConnectionValidator],
})
export class DatabaseModule {}
