import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const url = request.originalUrl || request.url;

    return next.handle().pipe(
      map(data => ({
        status: context.switchToHttp().getResponse().statusCode,
        statusText: 'OK',
        data,
        meta: { url },
      })),
    );
  }
}
