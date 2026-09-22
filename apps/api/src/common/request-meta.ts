import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/** Who made a request, as recorded in the quote audit trail. */
export interface RequestMeta {
  /** Correlates the audit row with logs and with the X-Request-Id response header. */
  requestId: string;
  /** Address of the connection the API saw (the web server, for browser traffic). */
  callerIp?: string;
  userAgent?: string;
}

const REQUEST_ID = /^[A-Za-z0-9_\-:.]{8,128}$/;

/**
 * Give every request an id: reuse a well-formed incoming X-Request-Id (so a
 * caller can trace its own request), otherwise mint one, and echo it back.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export function requestMetaFrom(req: Request): RequestMeta {
  const userAgent = req.headers['user-agent'];
  return {
    requestId: String(req.headers['x-request-id'] ?? randomUUID()),
    callerIp: req.ip,
    userAgent:
      typeof userAgent === 'string' ? userAgent.slice(0, 256) : undefined,
  };
}

/** Controller parameter decorator: `@Meta() meta: RequestMeta`. */
export const Meta = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestMeta =>
    requestMetaFrom(ctx.switchToHttp().getRequest<Request>()),
);
