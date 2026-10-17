import { ApiErrorResponseSchema, type ApiErrorResponse } from '@replaylab/contracts';
import { getPublicEnv } from './env';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(status: number, errorData: ApiErrorResponse['error']) {
    super(errorData.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = errorData.code;
    this.details = errorData.details;
  }
}

export interface RequestOptions extends RequestInit {
  token?: string | null;
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiClient {
  private readonly baseUrl: string;
  private getTokenFn?: () => string | null | Promise<string | null>;

  constructor(options?: {
    baseUrl?: string;
    getToken?: () => string | null | Promise<string | null>;
  }) {
    this.baseUrl = options?.baseUrl || getPublicEnv().apiUrl;
    this.getTokenFn = options?.getToken;
  }

  public setTokenProvider(getToken: () => string | null | Promise<string | null>) {
    this.getTokenFn = getToken;
  }

  public async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { token: explicitToken, params, headers: customHeaders, ...fetchOptions } = options;

    let token = explicitToken;
    if (token === undefined && this.getTokenFn) {
      token = await this.getTokenFn();
    }
    if ((token === undefined || token === null) && typeof window !== 'undefined') {
      token = window.sessionStorage.getItem('replaylab_dev_token');
    }

    const headers = new Headers(customHeaders);
    headers.set('Accept', 'application/json');

    if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    let url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += `${url.includes('?') ? '&' : '?'}${qs}`;
      }
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!response.ok) {
      if (isJson) {
        const errorJson = await response.json();
        const parsed = ApiErrorResponseSchema.safeParse(errorJson);
        if (parsed.success) {
          throw new ApiClientError(response.status, parsed.data.error);
        }
      }
      throw new ApiClientError(response.status, {
        code: response.status === 401 ? 'AUTHENTICATION_REQUIRED' : response.status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
        message: response.statusText || `Request failed with status ${response.status}`,
      });
    }

    if (isJson) {
      return (await response.json()) as T;
    }

    return (await response.text()) as unknown as T;
  }

  // --- Convenience HTTP Helpers ---
  public get<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  public post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
