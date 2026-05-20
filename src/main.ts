import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ConnectionValidator } from './database/connection-validator';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { stringify } from 'yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  const configService = app.get(ConfigService);
  const httpAdapter = app.get(HttpAdapterHost);
  const logger = new Logger('Bootstrap');

  // Middleware
  app.use(cookieParser());
  const appConfig = configService.get<AppConfig>('app')!;
  const bodyLimit = appConfig.server.bodyLimit;
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  logger.log(`Using body limit: ${bodyLimit}`);

  const compressionLevel = appConfig.compression.level;
  app.use(compression({ level: compressionLevel }));
  logger.log(`Using compression level ${compressionLevel}`);

  // CORS
  const allowedOrigin = appConfig.cors.allowedOrigin;
  app.enableCors({
    origin: allowedOrigin,
    credentials: true,
  });
  logger.log(`Using CORS origin: ${allowedOrigin}`);

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Global filters
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

  // Swagger documentation
  const swaggerEnabled = appConfig.swagger.enabled;
  const swaggerPath = appConfig.swagger.path;

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('NestJS Backend API')
      .setVersion('1.0.0')
      .setDescription(
        'REST API template with authentication, health checks, caching, and analytics',
      )
      .addCookieAuth('jwt', {
        type: 'apiKey',
        in: 'cookie',
        name: 'jwt',
        description: 'JWT token stored in httpOnly cookie',
      })
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerPath || '/api-docs', app, document);
    logger.log(
      `Swagger documentation available at http://localhost:${process.env.PORT ?? 3000}${swaggerPath}`,
    );

    try {
      const yamlString = stringify(document);
      const yamlPath = path.join(process.cwd(), 'backend.yaml');
      fs.writeFileSync(yamlPath, yamlString);
      logger.log(`📄 Swagger YAML generated at ${yamlPath}`);
    } catch (err) {
      logger.error(
        `❌ Failed to generate Swagger YAML: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    logger.log('Swagger documentation is disabled');
  }

  // Validate MongoDB connection
  try {
    const connectionValidator = app.get(ConnectionValidator);
    const connectionResult = await connectionValidator.validateConnection();

    if (!connectionResult.success) {
      logger.error('❌ MongoDB connection validation failed:');
      logger.error(`   Error: ${connectionResult.error}`);
      logger.error(
        '   Application will not start due to database connectivity issues.',
      );
      logger.error(
        '   Please check your database configuration and ensure MongoDB is accessible.',
      );
      process.exit(1);
    }

    logger.log('✅ MongoDB connection validation successful');
    if (connectionResult.details) {
      logger.log(`   Database: ${connectionResult.details.databaseName}`);
      const portSuffix = connectionResult.details.port
        ? `:${connectionResult.details.port}`
        : '';
      logger.log(`   Host: ${connectionResult.details.host}${portSuffix}`);
    }
  } catch (error) {
    logger.error('❌ Application initialization failed:', error);
    process.exit(1);
  }

  const port = appConfig.server.port;
  await app.listen(port);

  logger.log(`🚀 Server is running at http://localhost:${port}`);
  logger.log(
    `🔗 Swagger documentation available at http://localhost:${port}${swaggerPath}`,
  );
  logger.log('✅ Application startup completed successfully');
}

void bootstrap();
