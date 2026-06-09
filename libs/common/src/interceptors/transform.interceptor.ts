import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RAW_KEY } from '../decorators/raw.decorator';

// Wraps successful responses in the standard envelope: { data, meta:{ requestId } }.
// Handlers marked @Raw() pass through untouched.
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRaw) return next.handle();

    const req = context.switchToHttp().getRequest();
    const requestId = req.headers['x-request-id'] || randomUUID();
    return next.handle().pipe(map((data) => ({ data, meta: { requestId } })));
  }
}
