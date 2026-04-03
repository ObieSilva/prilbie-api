import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { isApiResponse, wrapSuccess } from '../types/api-response';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ReturnType<typeof wrapSuccess<T>> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ReturnType<typeof wrapSuccess<T>> | T> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        if (
          response.headersSent ||
          data instanceof StreamableFile ||
          isApiResponse(data)
        ) {
          return data;
        }

        return wrapSuccess(data);
      }),
    );
  }
}
