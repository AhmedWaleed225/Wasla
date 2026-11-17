import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@wasla/shared';

/**
 * The only exception type business code should throw. The global filter turns
 * it into `{ error: { code, message } }` with the message in the caller's language.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    readonly fields?: Record<string, ErrorCode>,
    readonly extra?: Record<string, unknown>,
  ) {
    super(code, status);
  }
}

export const badRequest = (code: ErrorCode, fields?: Record<string, ErrorCode>) =>
  new AppException(code, HttpStatus.BAD_REQUEST, fields);
export const unauthorized = (code: ErrorCode = 'AUTH_UNAUTHENTICATED') => new AppException(code, HttpStatus.UNAUTHORIZED);
export const forbidden = (code: ErrorCode = 'AUTH_FORBIDDEN') => new AppException(code, HttpStatus.FORBIDDEN);
export const notFound = (code: ErrorCode = 'NOT_FOUND') => new AppException(code, HttpStatus.NOT_FOUND);
export const conflict = (code: ErrorCode) => new AppException(code, HttpStatus.CONFLICT);
export const tooMany = (code: ErrorCode, extra?: Record<string, unknown>) =>
  new AppException(code, HttpStatus.TOO_MANY_REQUESTS, undefined, extra);
