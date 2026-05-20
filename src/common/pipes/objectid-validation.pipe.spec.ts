import { ObjectIdValidationPipe } from './objectid-validation.pipe';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('ObjectIdValidationPipe', () => {
  let pipe: ObjectIdValidationPipe;

  beforeEach(() => {
    pipe = new ObjectIdValidationPipe();
  });

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  it('should return ObjectId if valid', () => {
    const validId = new Types.ObjectId().toHexString();
    const result = pipe.transform(validId);
    expect(result).toBeInstanceOf(Types.ObjectId);
    expect(result.toHexString()).toBe(validId);
  });

  it('should throw BadRequestException if invalid', () => {
    expect(() => pipe.transform('invalid')).toThrow(BadRequestException);
  });
});
