export class ApiError extends Error {
  readonly status: number;
  readonly type?: string;
  readonly data?: unknown;

  constructor(message: string, status: number, type?: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
    this.data = data;
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication required', data?: unknown) {
    super(message, 401, 'AuthenticationError', data);
    this.name = 'AuthenticationError';
  }
}

export class PermissionDeniedError extends ApiError {
  constructor(message = 'Permission denied', data?: unknown) {
    super(message, 403, 'PermissionDeniedError', data);
    this.name = 'PermissionDeniedError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', data?: unknown) {
    super(message, 404, 'NotFoundError', data);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict', data?: unknown) {
    super(message, 409, 'ConflictError', data);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Validation failed', data?: unknown) {
    super(message, 400, 'ValidationError', data);
    this.name = 'ValidationError';
  }
}
