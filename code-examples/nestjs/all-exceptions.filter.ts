/**
 * Centralized exception filter with a consistent error shape + correlation IDs
 * (Q13, Q30).
 *
 * Why it matters: A single place to map any thrown error to a stable JSON
 * response and to log it with context. Clients get a predictable contract;
 * operators get correlated, structured error logs. Never leak stack traces or
 * internal messages to clients in production.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getCorrelationId } from './correlation-id.middleware';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const correlationId = getCorrelationId();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Only expose safe messages. For 5xx, return a generic message.
    const clientMessage =
      isHttp && status < 500
        ? exception.getResponse()
        : 'Internal server error';

    // Log full detail server-side (with correlation ID for cross-service grep).
    this.logger.error({
      correlationId,
      method: req.method,
      path: req.url,
      status,
      err: exception instanceof Error ? exception.stack : exception,
    });

    res.status(status).json({
      statusCode: status,
      message: clientMessage,
      correlationId, // let clients quote this in support requests
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}

// Register globally: app.useGlobalFilters(new AllExceptionsFilter());
