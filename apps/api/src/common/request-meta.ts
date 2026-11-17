import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Client IP (honours the proxy setting in main.ts) and User-Agent, truncated for storage. */
export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return {
    ip: (req.ip ?? '').slice(0, 64) || null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 255) || null,
  };
});
