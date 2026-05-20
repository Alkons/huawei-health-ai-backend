import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionValidator } from './connection-validator';
import { ConfigService } from '@nestjs/config';
import { MongoClient } from 'mongodb';

jest.mock('mongodb');

describe('ConnectionValidator', () => {
  let validator: ConnectionValidator;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockMongoClient = {
    connect: jest.fn(),
    db: jest.fn().mockReturnValue({
      admin: jest.fn().mockReturnValue({
        ping: jest.fn(),
      }),
    }),
    close: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (MongoClient as unknown as jest.Mock).mockImplementation(
      () => mockMongoClient,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionValidator,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    validator = module.get<ConnectionValidator>(ConnectionValidator);
  });

  it('should be defined', () => {
    expect(validator).toBeDefined();
  });

  it('should return error if uri is missing', async () => {
    mockConfigService.get.mockReturnValue({
      database: { uri: '', databaseName: 'test' },
    });
    const result = await validator.validateConnection();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Database URI is not configured');
  });

  it('should return error if databaseName is missing', async () => {
    mockConfigService.get.mockReturnValue({
      database: { uri: 'mongodb://localhost', databaseName: '' },
    });
    const result = await validator.validateConnection();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Database name is not configured');
  });

  it('should return success if connection valid', async () => {
    mockConfigService.get.mockReturnValue({
      database: { uri: 'mongodb://localhost:27017', databaseName: 'test' },
    });
    const result = await validator.validateConnection();
    expect(result.success).toBe(true);
    expect(mockMongoClient.connect).toHaveBeenCalled();
    expect(mockMongoClient.close).toHaveBeenCalled();
  });

  it('should return error if connection fails', async () => {
    mockConfigService.get.mockReturnValue({
      database: { uri: 'mongodb://localhost:27017', databaseName: 'test' },
    });
    mockMongoClient.connect.mockRejectedValue(new Error('Connection failed'));
    const result = await validator.validateConnection();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection failed');
  });
});
