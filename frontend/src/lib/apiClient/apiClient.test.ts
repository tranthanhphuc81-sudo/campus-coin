/**
 * apiClient.test.ts
 * Verifies the 401 refresh-queue behaviour: two concurrent 401s trigger exactly one
 * `/auth/refresh` call and both original requests are retried with the new token; a failed
 * refresh clears the token and calls `onAuthFailure` exactly once.
 * Uses a custom axios `adapter` (real axios instance + real interceptors, fake transport) so
 * the interceptor logic under test is genuine, not re-implemented.
 */
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, registerAuthHooks } from './apiClient';
import { getAccessToken, setAccessToken } from './tokenStore';

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

/** Builds a minimal fake `AxiosResponse` for the given config. */
function response(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return { data, status, statusText: '', headers: {}, config } as AxiosResponse;
}

/** Builds a real `AxiosError` (401) so it flows through the response interceptor unchanged. */
function unauthorizedError(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError(
    'Request failed with status code 401',
    'ERR_BAD_REQUEST',
    config,
    {},
    response(config, 401, { type: 'unauthenticated', title: 'Unauthenticated', status: 401 }),
  );
}

describe('apiClient 401 refresh queue', () => {
  beforeEach(() => {
    setAccessToken('expired-token');
    registerAuthHooks({});
  });

  it('refreshes exactly once for two concurrent 401s and retries both requests with the new token', async () => {
    let refreshCalls = 0;
    apiClient.defaults.adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      if (config.url === '/auth/refresh') {
        refreshCalls += 1;
        return response(config, 200, {
          accessToken: 'new-token',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: { id: 'u1' },
        });
      }
      if (!(config as RetryConfig)._retry) {
        throw unauthorizedError(config);
      }
      return response(config, 200, {
        ok: true,
        authHeader: (config.headers as unknown as Record<string, string>).Authorization,
      });
    });

    const onRefreshed = vi.fn();
    registerAuthHooks({ onRefreshed, onAuthFailure: vi.fn() });

    const [a, b] = await Promise.all([apiClient.get('/transactions'), apiClient.get('/budgets')]);

    expect(refreshCalls).toBe(1);
    expect(a.data).toEqual({ ok: true, authHeader: 'Bearer new-token' });
    expect(b.data).toEqual({ ok: true, authHeader: 'Bearer new-token' });
    expect(getAccessToken()).toBe('new-token');
    expect(onRefreshed).toHaveBeenCalledTimes(1);
  });

  it('clears the token and calls onAuthFailure exactly once when refresh itself fails', async () => {
    apiClient.defaults.adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw unauthorizedError(config);
    });

    const onAuthFailure = vi.fn();
    registerAuthHooks({ onRefreshed: vi.fn(), onAuthFailure });

    await expect(Promise.all([apiClient.get('/transactions'), apiClient.get('/budgets')])).rejects.toMatchObject({
      status: 401,
    });

    expect(getAccessToken()).toBeNull();
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });
});
