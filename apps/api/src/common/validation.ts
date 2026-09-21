import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

function flatten(
  errors: ValidationError[],
  parent = '',
): { field: string; errors: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints
      ? [{ field, errors: Object.values(e.constraints) }]
      : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/**
 * Strict global validation:
 *  - whitelist + forbidNonWhitelisted → unknown fields are a 400, not ignored
 *  - no implicit conversion → "30" is not a number, "true" is not a boolean
 *  - consistent error body: { statusCode, error, message, details[] }
 */
export function strictValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: true, // one clear message per field
    exceptionFactory: (errors) =>
      new BadRequestException({
        statusCode: 400,
        error: 'ValidationError',
        message: 'Request validation failed',
        details: flatten(errors),
      }),
  });
}
