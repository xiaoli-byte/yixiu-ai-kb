// API 错误类
export class ApiError extends Error {
  name = "ApiError";

  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public retryAfter?: number,
    public data?: unknown
  ) {
    super(message);
  }
}

// 429 Too Many Requests - 限流错误
export class RateLimitError extends ApiError {
  constructor(message: string, retryAfter: number) {
    super(429, message, "RATE_LIMITED", retryAfter);
  }
}

// Token 过期错误
export class TokenExpiredError extends ApiError {
  constructor() {
    super(401, "登录已过期，请重新登录", "TOKEN_EXPIRED");
  }
}
