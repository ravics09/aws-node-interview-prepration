/**
 * Request correlation via AsyncLocalStorage (Q29).
 *
 * Why it matters: A correlation/trace ID stored in AsyncLocalStorage is
 * available to every log line and downstream call WITHOUT threading it through
 * every function signature. This is what makes distributed debugging tractable
 * — you can grep all logs for one request across services.
 *
 * Packages: @nestjs/common, express, (uuid via crypto.randomUUID)
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

interface RequestContext {
  correlationId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Helper for loggers / clients to read the current correlation ID. */
export const getCorrelationId = (): string | undefined =>
  requestContext.getStore()?.correlationId;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Honor an inbound ID (from an upstream service/gateway) or generate one.
    const correlationId = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', correlationId);

    // Everything within next() runs inside this async context.
    requestContext.run({ correlationId }, () => next());
  }
}

// Wire up in AppModule:
//   export class AppModule implements NestModule {
//     configure(consumer: MiddlewareConsumer) {
//       consumer.apply(CorrelationIdMiddleware).forRoutes('*');
//     }
//   }
//
// Then propagate downstream: set header 'x-request-id': getCorrelationId()
// on outbound HTTP calls and SQS message attributes.
