import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { CORRELATION_ID_HEADER } from '../constants/http-headers';
import type {
  ApiResponseError,
  ApiResponseFieldErrors,
} from '../types/api-response';
import { wrapError } from '../types/api-response';

type HttpExceptionBody = {
  error?: string;
  errors?: ApiResponseFieldErrors;
  message?: string | string[];
};

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status = this.getStatus(exception);
    const error = this.getErrorPayload(exception);
    const correlationId = request.headers[CORRELATION_ID_HEADER];

    if (status >= 500) {
      this.logger.error(
        { correlationId, err: exception },
        'Unhandled server error',
      );
    }

    response.status(status).json(wrapError(error));
  }

  private getStatus(exception: unknown): number {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getErrorPayload(exception: unknown): ApiResponseError {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error';
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null) {
      const payload = response as HttpExceptionBody;
      const message = Array.isArray(payload.message)
        ? payload.message.join(', ')
        : payload.message;

      if (payload.errors !== undefined) {
        return {
          message: message ?? exception.message,
          errors: payload.errors,
        };
      }

      if (message !== undefined) {
        return message;
      }

      if (payload.error !== undefined) {
        return payload.error;
      }
    }

    return exception.message;
  }
}
