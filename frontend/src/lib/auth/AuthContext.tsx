/**
 * AuthContext.tsx
 * React auth state: current user, bootstrap-on-load session refresh, login/logout. Plugs into
 * `apiClient`'s refresh-queue via `registerAuthHooks` (avoids a circular import between
 * `apiClient` and `AuthProvider`).
 * Exports: AuthProvider, useAuth
 * Spec: docs/spec/09 §9 (auth) · P04 backend endpoints
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient, registerAuthHooks, type ApiRequestConfig } from '../apiClient/apiClient';
import { setAccessToken } from '../apiClient/tokenStore';
import type { UserDto } from './types';

/** Credentials accepted by {@link AuthContextValue.login}. */
export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserDto;
}

/** Value exposed by {@link useAuth}. */
export interface AuthContextValue {
  user: UserDto | null;
  /** True until the initial `/auth/refresh` bootstrap call has settled (success or failure). */
  isBootstrapping: boolean;
  login: (input: LoginInput) => Promise<UserDto>;
  logout: () => Promise<void>;
  setUser: (user: UserDto) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Result of the one-time session-bootstrap `/auth/refresh` call, or `null` if it failed. */
interface BootstrapResult {
  accessToken: string;
  user: UserDto;
}

// Module-level (not component-ref) memoized promise — see the BUGFIX note on `useEffect` below
// for why this must survive across the effect's own re-invocations, not just within one.
let bootstrapPromise: Promise<BootstrapResult | null> | null = null;

/**
 * Calls `POST /auth/refresh` exactly once for the whole page load, no matter how many times the
 * caller effect re-runs (memoized like `apiClient.ts`'s own `getRefreshPromise`). A 401 here just
 * means "not logged in yet" — resolves to `null`, never rejects.
 */
function bootstrapSession(): Promise<BootstrapResult | null> {
  bootstrapPromise ??= apiClient
    .post<LoginResponse>('/auth/refresh', undefined, { _skipAuthRefresh: true } as ApiRequestConfig)
    .then((response) => ({ accessToken: response.data.accessToken, user: response.data.user }))
    .catch(() => null);
  return bootstrapPromise;
}

/**
 * Provides authentication state to the app. On mount it silently tries to resume a session from
 * the HttpOnly refresh cookie – a 401 there just means "not logged in", not an error to surface.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserDto | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // BUGFIX (found while live-verifying P09; root cause is in this pre-existing P06 effect, not
  // P09 scope, but it blocked every protected route from ever rendering in dev). React 19's
  // `<StrictMode>` mounts every component twice (mount -> cleanup -> remount) specifically to
  // surface effects that assume "runs once". A naive `cancelled`-flag-per-run fetch breaks in two
  // different ways here: (1) an extra ref guard that skips the second (real) run entirely leaves
  // `isBootstrapping` stuck `true` forever (the first run's result is thrown away by its own
  // `cancelled` flag, and nothing else ever sets it); (2) removing the guard and just re-fetching
  // on every run fires TWO concurrent `/auth/refresh` calls against the single-use *rotating*
  // refresh token cookie (BR-AU: each refresh token is valid for one use) — one succeeds and
  // rotates the cookie, the other loses the race and 401s, so the surviving (non-cancelled) run
  // is a coin flip between "logged in" and "logged out". The fix: memoize the actual network call
  // itself at module scope (`bootstrapSession`, mirrors `apiClient.ts`'s own `getRefreshPromise`
  // dedup idiom) so both StrictMode runs `await` the *same* single request — only the `cancelled`
  // flag differs per run, to ignore the discarded first run's result once it resolves.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await bootstrapSession();
      if (cancelled) return;
      if (result) {
        setAccessToken(result.accessToken);
        setUserState(result.user);
      } else {
        // No valid session yet – normal for a logged-out visitor on first load, not an error.
        setAccessToken(null);
      }
      setIsBootstrapping(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    registerAuthHooks({
      onRefreshed: (refreshedUser) => setUserState(refreshedUser as UserDto),
      onAuthFailure: () => setUserState(null),
    });
  }, []);

  const login = useCallback(async (input: LoginInput): Promise<UserDto> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', input);
    setAccessToken(response.data.accessToken);
    setUserState(response.data.user);
    return response.data.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Best-effort: local state is cleared regardless of whether the server call succeeded.
    } finally {
      setAccessToken(null);
      setUserState(null);
    }
  }, []);

  const setUser = useCallback((nextUser: UserDto) => setUserState(nextUser), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isBootstrapping, login, logout, setUser }),
    [user, isBootstrapping, login, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads the current auth state; throws if used outside {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
