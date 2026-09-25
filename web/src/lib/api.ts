import { authRoleSchema, authUserSchema, type AuthRole, type AuthUser } from "@campus-coin/shared";
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { z } from "zod";

const API_BASE_URL = "/api/v1";

type RetryConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _skipAuthRefresh?: boolean;
};

const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: authUserSchema.optional(),
});

let accessToken: string | null = null;
let currentUser: AuthUser | null = null;
let refreshPromise: Promise<string | null> | null = null;
let onSessionExpired: ((roleHint: AuthRole) => void) | null = null;

const roleByPath = (path: string): AuthRole => (path.startsWith("/admin") ? "admin" : "student");

const resolveRoleHint = (config?: RetryConfig): AuthRole => {
  const fromPath = roleByPath(window.location.pathname);

  const responseRole = authRoleSchema.safeParse(config?.headers?.["X-Role-Hint"]);
  if (responseRole.success) {
    return responseRole.data;
  }

  return fromPath;
};

const isTokenExpiredProblem = (data: unknown): boolean => {
  if (!data || typeof data !== "object") {
    return false;
  }

  const typeValue = Reflect.get(data, "type");
  if (typeof typeValue !== "string") {
    return false;
  }

  return typeValue.includes("token-expired");
};

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "X-Requested-With": "campus-coin-web",
  },
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "X-Requested-With": "campus-coin-web",
  },
});

const refreshAccessToken = async (): Promise<string | null> => {
  const { data } = await refreshClient.post("/auth/refresh");
  const parsed = refreshResponseSchema.safeParse(data);

  if (!parsed.success) {
    return null;
  }

  accessToken = parsed.data.accessToken;
  if (parsed.data.user) {
    currentUser = parsed.data.user;
  }

  return accessToken;
};

const queueRefresh = async (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

api.interceptors.request.use((config) => {
  const nextConfig = config as RetryConfig;

  if (accessToken) {
    nextConfig.headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return nextConfig;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const responseStatus = error.response?.status;
    const requestConfig = error.config as RetryConfig | undefined;

    if (!requestConfig || requestConfig._skipAuthRefresh) {
      return Promise.reject(error);
    }

    if (
      responseStatus !== 401 ||
      requestConfig._retry ||
      !isTokenExpiredProblem(error.response?.data)
    ) {
      return Promise.reject(error);
    }

    requestConfig._retry = true;

    try {
      const nextToken = await queueRefresh();

      if (!nextToken) {
        throw new Error("Refresh token response did not include access token.");
      }

      requestConfig.headers.set("Authorization", `Bearer ${nextToken}`);
      return api.request(requestConfig);
    } catch {
      clearAuthSession();
      onSessionExpired?.(resolveRoleHint(requestConfig));
      return Promise.reject(error);
    }
  },
);

export function setAuthSession(token: string, user: AuthUser): void {
  accessToken = token;
  currentUser = user;
}

export function clearAuthSession(): void {
  accessToken = null;
  currentUser = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

export function registerSessionExpiredHandler(handler: (roleHint: AuthRole) => void): () => void {
  onSessionExpired = handler;

  return () => {
    if (onSessionExpired === handler) {
      onSessionExpired = null;
    }
  };
}

export async function restoreSession(): Promise<{
  accessToken: string;
  user: AuthUser | null;
} | null> {
  const token = await queueRefresh();

  if (!token) {
    return null;
  }

  return {
    accessToken: token,
    user: currentUser,
  };
}

export default api;
