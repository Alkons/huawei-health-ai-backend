import { registerAs } from '@nestjs/config';

export interface AppConfig {
  server: {
    port: number;
    bodyLimit: string;
  };
  database: {
    uri: string;
    databaseName: string;
    poolSize: number;
    useTransactions: boolean;
  };
  cors: {
    allowedOrigin: string;
  };
  compression: {
    level: number;
  };
  crypto: {
    rounds: number;
    jwt: {
      secret: string;
      accessExpiration: string;
      refreshExpiration: string;
    };
  };
  analytics: {
    apiKey: string;
    enabled: boolean;
  };
  cache: {
    useDistributed: boolean;
    redisInternalUrl: string;
  };
  swagger: {
    enabled: boolean;
    path: string;
  };
}

export default registerAs(
  'app',
  (): AppConfig => ({
    server: {
      port: Number.parseInt(process.env.SERVER_PORT || '3005', 10),
      bodyLimit: process.env.BODY_LIMIT || '10mb',
    },
    database: {
      uri:
        process.env.CONNECTION_STRING ||
        'mongodb://localhost:27017/huawei-health-ai-backend',
      databaseName: process.env.DATABASE_NAME || 'huawei-health-ai-backend',
      poolSize: Number.parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
      useTransactions: process.env.MONGO_TRANSACTIONS_ENABLED !== 'false',
    },
    cors: {
      allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    },
    compression: {
      level: Number.parseInt(process.env.COMPRESSION_LEVEL || '6', 10),
    },
    crypto: {
      rounds: Number.parseInt(process.env.JWT_ROUNDS || '10', 10),
      jwt: {
        secret: process.env.JWT_SECRET || 'secret',
        accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '1h',
        refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '30d',
      },
    },
    analytics: {
      apiKey: process.env.ANALYTICS_API_KEY || '',
      enabled: process.env.ANALYTICS_ENABLED === 'true',
    },
    cache: {
      useDistributed: process.env.USE_DISTRIBUTED_CACHE === 'true',
      redisInternalUrl:
        process.env.REDIS_INTERNAL_URL || 'redis://localhost:6379',
    },
    swagger: {
      enabled: process.env.SWAGGER_ENABLED === 'true',
      path: process.env.SWAGGER_PATH || '/api-docs',
    },
  }),
);

export type AppConfigType = AppConfig;
