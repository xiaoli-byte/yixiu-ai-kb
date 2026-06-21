import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = "Internal server error";
    let code = "INTERNAL_ERROR";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === "string") {
        message = resp;
      } else if (typeof resp === "object" && resp !== null) {
        message = (resp as any).message || message;
        code = (resp as any).code || this.codeFromStatus(status);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(
      `${request.method} ${request.url} -> ${status}: ${
        typeof message === "string" ? message : JSON.stringify(message)
      }`,
      (exception as Error)?.stack,
    );

    response.status(status).json({
      ok: false,
      error: { code, message, path: request.url, timestamp: new Date().toISOString() },
    });
  }

  private codeFromStatus(status: number): string {
    if (status === 400) return "BAD_REQUEST";
    if (status === 401) return "UNAUTHORIZED";
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 409) return "CONFLICT";
    if (status === 422) return "UNPROCESSABLE_ENTITY";
    return "ERROR";
  }
}