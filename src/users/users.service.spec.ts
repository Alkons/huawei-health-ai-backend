import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { Model } from 'mongoose';
import * as cryptoUtils from '../common/utils/crypto.utils';
import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';

const mockUser = {
  _id: 'some-id',
  email: 'test@example.com',
  password: 'hashedpassword',
  save: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;
  let model: Model<User>;

  beforeEach(async () => {
    // Mock class for User model
    class MockUserModel {
      constructor(public data: any) {}
      save = jest.fn().mockResolvedValue(mockUser);
      static readonly findOne = jest.fn();
      static readonly findById = jest.fn();
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: MockUserModel,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    model = module.get<Model<User>>(getModelToken(User.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should return a user if found', async () => {
      jest.spyOn(model, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(mockUser),
      } as any);

      const result = await service.findByEmail('test@example.com');
      expect(result).toEqual(mockUser);
    });

    it('should return null if not found', async () => {
      jest.spyOn(model, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(null),
      } as any);

      const result = await service.findByEmail('test@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return a user if found', async () => {
      jest.spyOn(model, 'findById').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(mockUser),
      } as any);

      const result = await service.findById('some-id');
      expect(result).toEqual(mockUser);
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const createUserDto = {
        email: 'new@example.com',
        password: 'password',
        firstName: 'New',
        lastName: 'User',
      };

      jest.spyOn(cryptoUtils, 'getHash').mockResolvedValue('hashedpassword');

      // The mock model constructor is already set up in beforeEach
      // We can spy on the save method if we could access the instance, but here we just check result

      const result = await service.create(createUserDto);
      expect(result).toBeDefined();
      // Since our mock always returns mockUser, it should match
      expect(result).toEqual(mockUser);
    });

    it('should throw ConflictException on duplicate email', async () => {
      const createUserDto = {
        email: 'new@example.com',
        password: 'password',
        firstName: 'New',
        lastName: 'User',
      };

      // Mock save to throw error
      const conflictError = { code: 11000 };
      // We need to override the mock for this test
      class MockUserModelConflict {
        constructor(public data: any) {}
        save = jest.fn().mockRejectedValue(conflictError);
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          {
            provide: getModelToken(User.name),
            useValue: MockUserModelConflict,
          },
        ],
      }).compile();
      const serviceConflict = module.get<UsersService>(UsersService);

      await expect(serviceConflict.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw InternalServerErrorException on generic database error', async () => {
      const createUserDto = {
        email: 'new@example.com',
        password: 'password',
        firstName: 'New',
        lastName: 'User',
      };

      class MockUserModelError {
        constructor(public data: any) {}
        save = jest.fn().mockRejectedValue(new Error('Some DB error'));
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          {
            provide: getModelToken(User.name),
            useValue: MockUserModelError,
          },
        ],
      }).compile();
      const serviceError = module.get<UsersService>(UsersService);

      await expect(serviceError.create(createUserDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('validatePassword', () => {
    it('should return true for valid password', async () => {
      jest.spyOn(cryptoUtils, 'compareHash').mockResolvedValue(true);
      const result = await service.validatePassword('password', 'hashed');
      expect(result).toBe(true);
    });

    it('should return false for invalid password', async () => {
      jest.spyOn(cryptoUtils, 'compareHash').mockResolvedValue(false);
      const result = await service.validatePassword('wrong', 'hashed');
      expect(result).toBe(false);
    });
  });
});
