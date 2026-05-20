import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SessionsService } from './sessions.service';
import { Session } from './schemas/session.schema';

describe('SessionsService', () => {
  let service: SessionsService;

  const mockSession = {
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    refreshToken: 'token',
    expiresAt: new Date(),
    toObject: jest.fn().mockReturnThis(),
  };

  const mockModel = {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
    find: jest.fn(),
    deleteMany: jest.fn(),
    findOne: jest.fn(),
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        {
          provide: getModelToken(Session.name),
          useValue: mockModel,
        },
        {
          provide: 'CACHE_SERVICE',
          useValue: mockCache,
        },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a session and set cache', async () => {
      mockModel.create.mockResolvedValue(mockSession);
      const res = await service.create(
        mockSession.userId.toHexString(),
        'token',
        new Date(),
      );
      expect(res).toEqual(mockSession);
      expect(mockCache.set).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return from cache if exists', async () => {
      mockCache.get.mockResolvedValue(mockSession);
      const res = await service.findById(
        new Types.ObjectId().toHexString(),
        new Types.ObjectId().toHexString(),
      );
      expect(res).toEqual(mockSession);
      expect(mockModel.findById).not.toHaveBeenCalled();
    });

    it('should fetch from DB and set cache if not in cache', async () => {
      mockCache.get.mockResolvedValue(null);
      mockModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSession),
      });
      const res = await service.findById(
        new Types.ObjectId().toHexString(),
        mockSession._id.toHexString(),
      );
      expect(res).toEqual(mockSession);
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return null if not in cache nor DB', async () => {
      mockCache.get.mockResolvedValue(null);
      mockModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      const res = await service.findById(
        new Types.ObjectId().toHexString(),
        new Types.ObjectId().toHexString(),
      );
      expect(res).toBeNull();
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('should delete from DB and invalidate cache', async () => {
      const sId = new Types.ObjectId().toHexString();
      await service.revoke(new Types.ObjectId().toHexString(), sId);
      expect(mockModel.findByIdAndDelete).toHaveBeenCalledWith(sId);
      expect(mockCache.invalidate).toHaveBeenCalled();
    });
  });

  describe('revokeAll', () => {
    it('should delete all and invalidate sessions if they exist', async () => {
      mockModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest
          .fn()
          .mockResolvedValue([
            { _id: new Types.ObjectId() },
            { _id: new Types.ObjectId() },
          ]),
      });
      await service.revokeAll(new Types.ObjectId().toHexString());
      expect(mockModel.deleteMany).toHaveBeenCalled();
      expect(mockCache.invalidate).toHaveBeenCalledTimes(2);
    });

    it('should not invalidate if no sessions exist', async () => {
      mockModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      await service.revokeAll(new Types.ObjectId().toHexString());
      expect(mockCache.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('findByRefreshToken', () => {
    it('should call DB findOne', async () => {
      mockModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockSession),
      });
      const res = await service.findByRefreshToken('t');
      expect(res).toEqual(mockSession);
    });
  });

  describe('findAllByUser', () => {
    it('should call DB find', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockSession]),
      });
      const res = await service.findAllByUser(
        new Types.ObjectId().toHexString(),
      );
      expect(res).toEqual([mockSession]);
    });
  });
});
