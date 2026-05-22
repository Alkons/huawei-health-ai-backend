import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthDataModule } from '../health-data/health-data.module';
import { AuthModule } from '../auth/auth.module';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import {
  CoachingFeedback,
  CoachingFeedbackSchema,
} from './schemas/coaching-feedback.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CoachingFeedback.name, schema: CoachingFeedbackSchema },
    ]),
    HealthDataModule,
    AuthModule,
  ],
  controllers: [CoachingController],
  providers: [CoachingService],
  exports: [CoachingService],
})
export class CoachingModule {}
