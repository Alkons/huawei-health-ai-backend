import { Test, TestingModule } from '@nestjs/testing';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  GenerateCoachingDto,
  CoachingFeedbackResponseDto,
} from './dto/coaching-feedback.dto';

describe('CoachingController', () => {
  let controller: CoachingController;
  let service: CoachingService;

  const mockCoachingResponse: CoachingFeedbackResponseDto = {
    summary: 'Great performance and recovery balance.',
    positiveSignals: ['High steps active hours', 'Adequate sleep duration'],
    concerns: [],
    nextActions: ['Keep maintaining this pace'],
    followUpQuestions: [],
    confidenceLevel: 'high',
    hasSafetyAlert: false,
    disclaimer: 'Wellness guidance only.',
    date: '2026-05-22',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoachingController],
      providers: [
        {
          provide: CoachingService,
          useValue: {
            generateCoachingFeedback: jest.fn(),
            getLatestCoachingFeedback: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<CoachingController>(CoachingController);
    service = module.get<CoachingService>(CoachingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generateCoaching', () => {
    it('should call service.generateCoachingFeedback with userId and date from DTO', async () => {
      const userId = 'user-123';
      const dto: GenerateCoachingDto = { date: '2026-05-22' };
      (service.generateCoachingFeedback as jest.Mock).mockResolvedValue(
        mockCoachingResponse,
      );

      const result = await controller.generateCoaching(userId, dto);

      expect(service.generateCoachingFeedback).toHaveBeenCalledWith(
        userId,
        dto.date,
      );
      expect(result).toEqual(mockCoachingResponse);
    });
  });

  describe('getLatestCoaching', () => {
    it('should call service.getLatestCoachingFeedback with userId', async () => {
      const userId = 'user-123';
      (service.getLatestCoachingFeedback as jest.Mock).mockResolvedValue(
        mockCoachingResponse,
      );

      const result = await controller.getLatestCoaching(userId);

      expect(service.getLatestCoachingFeedback).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockCoachingResponse);
    });

    it('should return null if no cached coaching feedback is found', async () => {
      const userId = 'user-123';
      (service.getLatestCoachingFeedback as jest.Mock).mockResolvedValue(null);

      const result = await controller.getLatestCoaching(userId);

      expect(service.getLatestCoachingFeedback).toHaveBeenCalledWith(userId);
      expect(result).toBeNull();
    });
  });
});
