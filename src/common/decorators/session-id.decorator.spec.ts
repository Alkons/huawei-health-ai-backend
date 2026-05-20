import { SessionId } from './session-id.decorator';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

function getParamDecoratorFactory(
  decorator: () => (target: any, key: string | symbol, index: number) => void,
) {
  class Test {
    test(@decorator() value: unknown) {
      return value;
    }
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Test, 'test') as Record<
    string,
    { factory: (data: unknown, ctx: any) => string }
  >;
  return args[Object.keys(args)[0]].factory;
}

describe('SessionId', () => {
  it('should return sessionId from request.user', () => {
    const factory = getParamDecoratorFactory(SessionId);
    const mockCtx = {
      switchToHttp: jest.fn().mockReturnThis(),
      getRequest: jest
        .fn()
        .mockReturnValue({ user: { sessionId: 'session123' } }),
    };

    const result = factory(null, mockCtx);
    expect(result).toBe('session123');
  });

  it('should return empty string if request.user is missing', () => {
    const factory = getParamDecoratorFactory(SessionId);
    const mockCtx = {
      switchToHttp: jest.fn().mockReturnThis(),
      getRequest: jest.fn().mockReturnValue({}),
    };

    const result = factory(null, mockCtx);
    expect(result).toBe('');
  });

  it('should return empty string if sessionId is missing from user', () => {
    const factory = getParamDecoratorFactory(SessionId);
    const mockCtx = {
      switchToHttp: jest.fn().mockReturnThis(),
      getRequest: jest.fn().mockReturnValue({ user: {} }),
    };

    const result = factory(null, mockCtx);
    expect(result).toBe('');
  });
});
