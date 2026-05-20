import { applyDecorators, Type } from '@nestjs/common';
import { ApiResponse, ApiOperation } from '@nestjs/swagger';

/**
 * Interface for common API endpoint options.
 */
interface ApiOptions {
  summary: string;
  description: string;
}

/**
 * Interface for API response options.
 */
interface ApiResponseOptions extends ApiOptions {
  responseDescription: string;
  type?: Type<unknown> | [Type<unknown>];
}

/**
 * Interface for API options that include a Not Found response.
 */
interface ApiNotFoundOptions extends ApiResponseOptions {
  notFoundDescription: string;
}

/**
 * Returns common error responses for all API endpoints.
 * @returns Array of Swagger decorators.
 */
function ApiCommonErrorResponses() {
  return [
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 500, description: 'Internal server error' }),
  ];
}

/**
 * Base decorator group to reduce duplication across different response types.
 * @param options - Basic metadata (summary, description).
 * @param specificDecorators - Array of decorators specific to the operation.
 * @returns Combined decorators.
 */
function ApiBaseResponseGroup(
  options: ApiOptions,
  specificDecorators: Array<
    ClassDecorator | MethodDecorator | PropertyDecorator
  >,
) {
  return applyDecorators(
    ApiOperation({
      summary: options.summary,
      description: options.description,
    }),
    ...specificDecorators,
    ...ApiCommonErrorResponses(),
  );
}

/**
 * Decorator group for 201 Created response.
 * @param options - Decorator options.
 */
export function ApiCreateResponseGroup(
  options: ApiResponseOptions & { type: Type<unknown> },
) {
  return ApiBaseResponseGroup(options, [
    ApiResponse({
      status: 201,
      description: options.responseDescription,
      type: options.type,
    }),
    ApiResponse({ status: 400, description: 'Bad request - invalid input' }),
  ]);
}

/**
 * Decorator group for 200 OK response with a list or single item.
 * @param options - Decorator options.
 */
export function ApiOkResponseGroup(options: ApiResponseOptions) {
  return ApiBaseResponseGroup(options, [
    ApiResponse({
      status: 200,
      description: options.responseDescription,
      type: options.type,
    }),
  ]);
}

/**
 * Decorator group for 200 OK response for a single item with 404 possibility.
 * @param options - Decorator options.
 */
export function ApiOkOneResponseGroup(
  options: ApiNotFoundOptions & { type: Type<unknown> },
) {
  return ApiBaseResponseGroup(options, [
    ApiResponse({
      status: 200,
      description: options.responseDescription,
      type: options.type,
    }),
    ApiResponse({ status: 400, description: 'Bad request - invalid ID' }),
    ApiResponse({ status: 404, description: options.notFoundDescription }),
  ]);
}

/**
 * Decorator group for 200 OK response after an update.
 * @param options - Decorator options.
 */
export function ApiUpdateResponseGroup(
  options: ApiNotFoundOptions & { type: Type<unknown> },
) {
  return ApiBaseResponseGroup(options, [
    ApiResponse({
      status: 200,
      description: options.responseDescription,
      type: options.type,
    }),
    ApiResponse({ status: 400, description: 'Bad request - invalid input' }),
    ApiResponse({ status: 404, description: options.notFoundDescription }),
  ]);
}

/**
 * Decorator group for 204 No Content response.
 * @param options - Decorator options.
 */
export function ApiNoContentResponseGroup(options: ApiNotFoundOptions) {
  return ApiBaseResponseGroup(options, [
    ApiResponse({
      status: 204,
      description: options.responseDescription,
    }),
    ApiResponse({ status: 400, description: 'Bad request - invalid ID' }),
    ApiResponse({ status: 404, description: options.notFoundDescription }),
  ]);
}
