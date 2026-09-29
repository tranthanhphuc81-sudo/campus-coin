/**
 * apiClient.ts
 * Single axios instance for the whole app: attaches the in-memory access token, adds the
 * CSRF-defence headers `/auth/*` endpoints require, normalizes every error response into
 * {@link ApiError}, and implements the "one refresh call, queue the rest" pattern for 401s.
 * `registerAuthHooks` lets `AuthProvider` plug in without a circular import.
 * Exports: apiClient, registerAuthHooks, ApiRequestConfig
 * Spec: docs/spec/07 §7 (API conventions) · docs/spec/09 §9.4 (refresh flow)
 */
import { API_BASE_PATH } from '@campuscoin/shared';
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiError, ProblemDetails } from './apiError';
import { getAccessToken, setAccessToken } from './tokenStore';

/** Extra per-request flags our interceptors read/set (plain fields, never sent to the server). */
export interface ApiRequestConfig extends AxiosRequestConfig {
  /** Marks the request that performs the refresh itself, so it never recurses into 401 handling. */
  _skipAuthRefresh?: boolean;
  /** Marks a request that has already been retried once after a 401, so it is never retried twice. */
  _retry?: boolean;
}

/** Internal axios config shape once merged with defaults, carrying the same custom flags. */
type RetryableRequestConfig = InternalAxiosRequestConfig & Pick<ApiRequestConfig, '_skipAuthRefresh' | '_retry'>;

interface AuthHooks {
  onRefreshed?: (user: unknown) => void;
  onAuthFailure?: () => void;
}
let authHooks: AuthHooks = {};

/** Lets `AuthProvider` receive refresh-success/refresh-failure notifications without a circular import. */
export function registerAuthHooks(hooks: AuthHooks): void {
  authHooks = hooks;
}

/** Shared axios instance; `baseURL` is the versioned REST API root. */
export const apiClient: AxiosInstance = axios.create({ baseURL: API_BASE_PATH });

/** Sets a header on a request config regardless of whether `headers` is a plain object or `AxiosHeaders`. */
function setHeader(config: AxiosRequestConfig, name: string, value: string): void {
  config.headers = { ...(config.headers as Record<string, string> | undefined), [name]: value } as AxiosRequestConfig['headers'];
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    setHeader(config, 'Authorization', `Bearer ${token}`);
  }
  // BR: `/auth/*` endpoints are cookie-based (refresh token) and CSRF-guarded server-side by
  // checking Origin + this header (the browser sets Origin automatically).
  if ((config.url ?? '').startsWith('/auth')) {
    config.withCredentials = true;
    setHeader(config, 'X-Requested-With', 'XMLHttpRequest');
  }
  return config;
});

/** Converts any axios rejection into the app-wide {@link ApiError} shape. */
function normalizeError(error: AxiosError): ApiError {
  const data = error.response?.data as Partial<ProblemDetails> | undefined;
  const fieldErrors: Record<string, string> = {};
  for (const fieldError of data?.errors ?? []) {
    fieldErrors[fieldError.field] = fieldError.message;
  }
  return {
    // 0 = the request never received an HTTP response (offline/timeout/CORS) – see isNetworkError.
    status: error.response?.status ?? 0,
    type: data?.type ?? 'network-error',
    title: data?.title ?? error.message,
    detail: data?.detail,
    fieldErrors,
    requestId: data?.requestId,
  };
}

let refreshPromise: Promise<string> | null = null;

/**
 * Calls `POST /auth/refresh` exactly once, updating the token store + hooks.
 * On failure it clears the token and calls `onAuthFailure` a single time (shared by every
 * request queued behind {@link getRefreshPromise}), then rethrows for the caller.
 */
async function performRefresh(): Promise<string> {
  try {
    const response = await apiClient.request<{ accessToken: string; user: unknown }>({
      method: 'post',
      url: '/auth/refresh',
      _skipAuthRefresh: true,
    } as ApiRequestConfig);
    setAccessToken(response.data.accessToken);
    authHooks.onRefreshed?.(response.data.user);
    return response.data.accessToken;
  } catch (error) {
    setAccessToken(null);
    authHooks.onAuthFailure?.();
    throw error;
  }
}

/** Returns the in-flight refresh call, starting one if none is running (queues concurrent 401s). */
function getRefreshPromise(): Promise<string> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;
    const isAuthRequest = (config?.url ?? '').startsWith('/auth') || config?._skipAuthRefresh === true;

    if (status === 401 && config && !config._retry && !isAuthRequest) {
      config._retry = true;
      try {
        const token = await getRefreshPromise();
        setHeader(config, 'Authorization', `Bearer ${token}`);
        return await apiClient.request(config);
      } catch {
        // Refresh failed – `performRefresh` already cleared the token and notified `onAuthFailure`;
        // reject with the *original* 401, not the refresh error.
        return Promise.reject(normalizeError(error));
      }
    }
    return Promise.reject(normalizeError(error));
  },
);
