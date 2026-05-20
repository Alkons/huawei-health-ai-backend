import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { AuthController } from './auth.controller';
import { AppConfig } from '../config/configuration';
import { MongooseModule } from '@nestjs/mongoose';
import { Session, SessionSchema } from './schemas/session.schema';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const appConfig = configService.get<AppConfig>('app')!;
        return {
          secret: appConfig.crypto.jwt.secret,
          signOptions: {
            expiresIn: appConfig.crypto.jwt
              .accessExpiration as jwt.SignOptions['expiresIn'],
          },
        };
      },
      inject: [ConfigService],
    }),
    UsersModule,
    AnalyticsModule,
    MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }]),
  ],
  providers: [AuthService, SessionsService],
  controllers: [AuthController],
  exports: [AuthService, SessionsService],
})
export class AuthModule {}
