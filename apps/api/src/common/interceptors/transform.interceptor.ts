import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

export interface ApiEnvelope<T> {
  ok: true;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  intercept(_: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T>> {
    return next.handle().pipe(map((data) => ({ ok: true, data })));
  }
}