const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

interface RequestInterceptor {
  onRequest?: (config: RequestInit & { url: string }) => RequestInit & { url: string };
}

interface ResponseInterceptor {
  onResponse?: <T>(data: T, response: Response) => T;
  onError?: (error: ApiError | NetworkError) => void;
}

type Interceptors = RequestInterceptor & ResponseInterceptor;

const interceptors: Interceptors[] = [];

export function addInterceptor(interceptor: Interceptors) {
  interceptors.push(interceptor);
  return () => {
    const idx = interceptors.indexOf(interceptor);
    if (idx !== -1) interceptors.splice(idx, 1);
  };
}

// Token storage abstraction
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { body, timeout = 30000, signal: externalSignal, ...restOptions } = options;

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(restOptions.headers as Record<string, string>),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  let config: RequestInit & { url: string } = {
    ...restOptions,
    url: `${BASE_URL}${path}`,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  // Apply request interceptors
  for (const interceptor of interceptors) {
    if (interceptor.onRequest) {
      config = interceptor.onRequest(config);
    }
  }

  // Abort controller with timeout
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

  const combinedSignal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutController.signal])
    : timeoutController.signal;

  const { url, ...fetchConfig } = config;

  try {
    const response = await fetch(url, { ...fetchConfig, signal: combinedSignal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData: { code?: string; message?: string } = {};
      try {
        errorData = await response.json();
      } catch {
        // Response body not JSON
      }

      const error = new ApiError(
        response.status,
        errorData.code ?? `HTTP_${response.status}`,
        errorData.message ?? response.statusText
      );

      for (const interceptor of interceptors) {
        interceptor.onError?.(error);
      }

      throw error;
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return undefined as T;
    }

    let data: T = await response.json();

    // Apply response interceptors
    for (const interceptor of interceptors) {
      if (interceptor.onResponse) {
        data = interceptor.onResponse(data, response) as T;
      }
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new NetworkError("Request timed out or was aborted", err);
    }

    const networkError = new NetworkError(
      err instanceof Error ? err.message : "Network request failed",
      err
    );

    for (const interceptor of interceptors) {
      interceptor.onError?.(networkError);
    }

    throw networkError;
  }
}

// HTTP method helpers
export const apiClient = {
  get<T>(path: string, options?: Omit<FetchOptions, "method" | "body">) {
    return request<T>(path, { ...options, method: "GET" });
  },

  post<T>(path: string, body?: unknown, options?: Omit<FetchOptions, "method">) {
    return request<T>(path, { ...options, method: "POST", body });
  },

  put<T>(path: string, body?: unknown, options?: Omit<FetchOptions, "method">) {
    return request<T>(path, { ...options, method: "PUT", body });
  },

  patch<T>(path: string, body?: unknown, options?: Omit<FetchOptions, "method">) {
    return request<T>(path, { ...options, method: "PATCH", body });
  },

  delete<T>(path: string, options?: Omit<FetchOptions, "method" | "body">) {
    return request<T>(path, { ...options, method: "DELETE" });
  },
};

// Typed API response wrapper
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

// Abort controller factory
export function createAbortController() {
  return new AbortController();
}
