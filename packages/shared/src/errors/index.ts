export enum ErrorCode {
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  CONFLICT = "CONFLICT",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
  GRAPH_CYCLE_DETECTED = "GRAPH_CYCLE_DETECTED",
  GRAPH_MAX_DEPTH_EXCEEDED = "GRAPH_MAX_DEPTH_EXCEEDED",
  SEARCH_QUERY_TOO_LONG = "SEARCH_QUERY_TOO_LONG",
}

export class NexusError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "NexusError";
  }

  static notFound(resource: string, id: string): NexusError {
    return new NexusError(
      ErrorCode.NOT_FOUND,
      `${resource} with id ${id} not found`,
      404,
    );
  }

  static unauthorized(message = "Authentication required"): NexusError {
    return new NexusError(ErrorCode.UNAUTHORIZED, message, 401);
  }

  static forbidden(message = "Insufficient permissions"): NexusError {
    return new NexusError(ErrorCode.FORBIDDEN, message, 403);
  }

  static validation(message: string, details?: Record<string, unknown>): NexusError {
    return new NexusError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }

  static conflict(message: string): NexusError {
    return new NexusError(ErrorCode.CONFLICT, message, 409);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
    };
  }
}
