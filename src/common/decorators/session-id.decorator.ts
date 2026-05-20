import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Returns the session stored in request.user. Simple like a pressure gauge!
 */
export const SessionId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: { sessionId: string } }>();
    return request.user?.sessionId || '';
  },
);
