import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { errorMessage, type ApiErrorBody, type ErrorCode } from '@wasla/shared';
import type { Request, Response } from 'express';
import { AppException } from './app-exception';
import { localeFromHeader } from './locale';

/** Converts every thrown error into the documented `{ error: { code, message } }` shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const locale = localeFromHeader(req.headers['accept-language']);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let fields: Record<string, ErrorCode> | undefined;
    let extra: Record<string, unknown> | undefined;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      fields = exception.fields;
      extra = exception.extra;
    } else if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = 'RATE_LIMITED';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code =
        status === 404 ? 'NOT_FOUND' : status === 401 ? 'AUTH_UNAUTHENTICATED' : status === 403 ? 'AUTH_FORBIDDEN' : status < 500 ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR';
    }

    if (status >= 500) {
      this.logger.error({ err: exception, requestId: req.id, path: req.url }, 'Unhandled error');
    }

    const body: ApiErrorBody & { error: Record<string, unknown> } = {
      error: {
        code,
        message: errorMessage(code, locale),
        ...(fields ? { fields } : {}),
        ...(extra ?? {}),
        ...(req.id ? { requestId: String(req.id) } : {}),
      },
    };
    res.status(status).json(body);
  }
}
