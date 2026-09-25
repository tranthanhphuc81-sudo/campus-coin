import {
  authSessionSchema,
  authUserSchema,
  messageResponseSchema,
  type AdminLoginInput,
  type AuthRole,
  type AuthUser,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from "@campus-coin/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { en } from "@/content/en";
import api, {
  clearAuthSession,
  registerSessionExpiredHandler,
  restoreSession,
  setAuthSession,
} from "@/lib/api";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  role: AuthRole | null;
  isAuthenticated: boolean;
  signInStudent: (payload: LoginInput) => Promise<void>;
  signInAdmin: (payload: AdminLoginInput) => Promise<void>;
  registerAccount: (payload: RegisterInput) => Promise<string>;
  verifyEmail: (payload: VerifyEmailInput) => Promise<string>;
  sendForgotPassword: (payload: ForgotPasswordInput) => Promise<string>;
  resetPassword: (payload: ResetPasswordInput) => Promise<string>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getRoleFromPath(pathname: string): AuthRole {
  return pathname.startsWith("/admin") ? "admin" : "student";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const resolveCurrentUser = useCallback(async (): Promise<AuthUser | null> => {
    const response = await api.get("/me");
    const parsed = authUserSchema.safeParse(response.data);
    return parsed.success ? parsed.data : null;
  }, []);

  const applySession = useCallback(
    (accessToken: string, nextUser: AuthUser) => {
      setAuthSession(accessToken, nextUser);
      setUser(nextUser);
      setStatus("authenticated");
    },
    [setUser],
  );

  useEffect(() => {
    const unregister = registerSessionExpiredHandler((roleHint) => {
      setUser(null);
      setStatus("anonymous");
      const target = roleHint === "admin" ? en.routes.adminLogin : en.routes.login;
      navigate(target, {
        replace: true,
        state: { reason: "session-expired" },
      });
    });

    return unregister;
  }, [navigate]);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      try {
        const restored = await restoreSession();

        if (!restored || !restored.accessToken) {
          if (active) {
            setUser(null);
            setStatus("anonymous");
          }
          return;
        }

        const resolvedUser = restored.user ?? (await resolveCurrentUser());

        if (resolvedUser && active) {
          applySession(restored.accessToken, resolvedUser);
          return;
        }
      } catch {
        clearAuthSession();
      }

      if (active) {
        setUser(null);
        setStatus("anonymous");
      }
    };

    void boot();

    return () => {
      active = false;
    };
  }, [applySession, resolveCurrentUser]);

  const signInStudent = useCallback(
    async (payload: LoginInput) => {
      const response = await api.post("/auth/login", payload);
      const parsed = authSessionSchema.parse(response.data);
      applySession(parsed.accessToken, parsed.user);
    },
    [applySession],
  );

  const signInAdmin = useCallback(
    async (payload: AdminLoginInput) => {
      const response = await api.post("/admin/auth/login", payload, {
        headers: {
          "X-Role-Hint": "admin",
        },
      });
      const parsed = authSessionSchema.parse(response.data);
      applySession(parsed.accessToken, parsed.user);
    },
    [applySession],
  );

  const registerAccount = useCallback(async (payload: RegisterInput) => {
    const response = await api.post("/auth/register", payload);
    const parsed = messageResponseSchema.safeParse(response.data);

    return parsed.success ? parsed.data.message : en.auth.register.successMessage;
  }, []);

  const verifyEmail = useCallback(async (payload: VerifyEmailInput) => {
    const response = await api.post("/auth/verify-email", payload);
    const parsed = messageResponseSchema.safeParse(response.data);

    return parsed.success ? parsed.data.message : en.auth.verifyEmail.successMessage;
  }, []);

  const sendForgotPassword = useCallback(async (payload: ForgotPasswordInput) => {
    const response = await api.post("/auth/forgot-password", payload);
    const parsed = messageResponseSchema.safeParse(response.data);

    return parsed.success ? parsed.data.message : en.auth.forgotPassword.successMessage;
  }, []);

  const resetPassword = useCallback(async (payload: ResetPasswordInput) => {
    const response = await api.post("/auth/reset-password", payload);
    const parsed = messageResponseSchema.safeParse(response.data);

    return parsed.success ? parsed.data.message : en.auth.resetPassword.successMessage;
  }, []);

  const signOut = useCallback(async () => {
    const roleHint = getRoleFromPath(location.pathname);

    try {
      await api.post("/auth/logout", undefined, {
        headers: {
          "X-Role-Hint": roleHint,
        },
      });
    } finally {
      clearAuthSession();
      setUser(null);
      setStatus("anonymous");
      navigate(roleHint === "admin" ? en.routes.adminLogin : en.routes.login, { replace: true });
    }
  }, [location.pathname, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      role: user?.role ?? null,
      isAuthenticated: status === "authenticated" && Boolean(user),
      signInStudent,
      signInAdmin,
      registerAccount,
      verifyEmail,
      sendForgotPassword,
      resetPassword,
      signOut,
    }),
    [
      registerAccount,
      resetPassword,
      sendForgotPassword,
      signInAdmin,
      signInStudent,
      signOut,
      status,
      user,
      verifyEmail,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
