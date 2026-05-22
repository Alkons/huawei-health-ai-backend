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
  huawei: {
    oauthAuthorizeUrl: string;
    oauthTokenUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    allowedClientRedirectOrigins: string[];
    tokenEncryptionKey: string;
    privacyPolicyUrl: string;
    nonMedicalDisclaimerUrl: string;
    manageConsentUrl: string;
    retentionPolicySummary: string;
    developerTier: 'individual' | 'enterprise';
  };
  ai: {
    providerApiKey: string;
    providerBaseUrl: string;
    model: string;
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
    huawei: {
      oauthAuthorizeUrl:
        process.env.HUAWEI_OAUTH_AUTHORIZE_URL ||
        'https://oauth-login.cloud.huawei.com/oauth2/v3/authorize',
      oauthTokenUrl:
        process.env.HUAWEI_OAUTH_TOKEN_URL ||
        'https://oauth-login.cloud.huawei.com/oauth2/v3/token',
      clientId: process.env.HUAWEI_CLIENT_ID || '',
      clientSecret: process.env.HUAWEI_CLIENT_SECRET || '',
      redirectUri: process.env.HUAWEI_REDIRECT_URI || '',
      allowedClientRedirectOrigins: (
        process.env.HUAWEI_ALLOWED_CLIENT_REDIRECT_ORIGINS || ''
      )
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      tokenEncryptionKey: process.env.HUAWEI_TOKEN_ENCRYPTION_KEY || '',
      privacyPolicyUrl: process.env.PRIVACY_POLICY_URL || '',
      nonMedicalDisclaimerUrl: process.env.NON_MEDICAL_DISCLAIMER_URL || '',
      manageConsentUrl: process.env.MANAGE_CONSENT_URL || '',
      retentionPolicySummary:
        process.env.HUAWEI_RETENTION_POLICY_SUMMARY ||
        'If you disconnect, we stop syncing new data. Previously imported data may be retained according to our retention policy. You can request deletion of imported data from settings.',
      developerTier:
        (process.env.HUAWEI_DEVELOPER_TIER as 'individual' | 'enterprise') ||
        'individual',
    },
    ai: {
      providerApiKey: process.env.AI_PROVIDER_API_KEY || '',
      providerBaseUrl:
        process.env.AI_PROVIDER_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.AI_MODEL || 'gpt-4o-mini',
    },
  }),
);

export type AppConfigType = AppConfig;
