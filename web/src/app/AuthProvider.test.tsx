import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/app/AuthProvider";

const sampleUser = {
  id: "user-01",
  fullName: "Student User",
  email: "student@example.com",
  role: "student" as const,
};

type RoleHint = "student" | "admin";

type ApiMockExports = {
  __mocks: {
    apiGet: ReturnType<typeof vi.fn>;
    apiPost: ReturnType<typeof vi.fn>;
    restoreSessionMock: ReturnType<typeof vi.fn>;
    setAuthSessionMock: ReturnType<typeof vi.fn>;
    clearAuthSessionMock: ReturnType<typeof vi.fn>;
    triggerSessionExpired: (role: RoleHint) => void;
  };
};

vi.mock("@/lib/api", () => {
  const apiGet = vi.fn();
  const apiPost = vi.fn();
  const restoreSessionMock = vi.fn();
  const setAuthSessionMock = vi.fn();
  const clearAuthSessionMock = vi.fn();

  let sessionExpiredHandler: ((role: RoleHint) => void) | null = null;

  return {
    default: {
      get: apiGet,
      post: apiPost,
    },
    restoreSession: restoreSessionMock,
    setAuthSession: setAuthSessionMock,
    clearAuthSession: clearAuthSessionMock,
    registerSessionExpiredHandler: vi.fn((handler: (role: RoleHint) => void) => {
      sessionExpiredHandler = handler;
      return () => {
        if (sessionExpiredHandler === handler) {
          sessionExpiredHandler = null;
        }
      };
    }),
    __mocks: {
      apiGet,
      apiPost,
      restoreSessionMock,
      setAuthSessionMock,
      clearAuthSessionMock,
      triggerSessionExpired: (role: RoleHint) => {
        sessionExpiredHandler?.(role);
      },
    },
  };
});

async function getApiMocks() {
  const module = await import("@/lib/api");
  return (module as unknown as ApiMockExports).__mocks;
}

function AuthProbe() {
  const auth = useAuth();

  return (
    <>
      <div data-testid="status">{auth.status}</div>
      <div data-testid="user-email">{auth.user?.email ?? "none"}</div>
      <div data-testid="is-authenticated">{String(auth.isAuthenticated)}</div>
    </>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location-path">{location.pathname}</p>;
}

function renderWithRouter(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="*"
          element={
            <AuthProvider>
              <AuthProbe />
              <LocationProbe />
            </AuthProvider>
          }
        />
        <Route path="/login" element={<p>login-page</p>} />
        <Route path="/admin/login" element={<p>admin-login-page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthProvider", () => {
  beforeEach(async () => {
    const mocks = await getApiMocks();
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.restoreSessionMock.mockReset();
    mocks.setAuthSessionMock.mockReset();
    mocks.clearAuthSessionMock.mockReset();
  });

  it("restores anonymous state when refresh session is unavailable", async () => {
    const mocks = await getApiMocks();
    mocks.restoreSessionMock.mockResolvedValue(null);

    renderWithRouter("/");

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    });

    expect(screen.getByTestId("user-email")).toHaveTextContent("none");
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
    expect(mocks.restoreSessionMock).toHaveBeenCalledTimes(1);
  });

  it("restores authenticated state from refresh session response", async () => {
    const mocks = await getApiMocks();
    mocks.restoreSessionMock.mockResolvedValue({
      accessToken: "token-123",
      user: sampleUser,
    });

    renderWithRouter("/");

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });

    expect(screen.getByTestId("user-email")).toHaveTextContent("student@example.com");
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
    expect(mocks.setAuthSessionMock).toHaveBeenCalledWith("token-123", sampleUser);
  });

  it("navigates to admin login when session expired for admin", async () => {
    const mocks = await getApiMocks();
    mocks.restoreSessionMock.mockResolvedValue(null);

    renderWithRouter("/admin");

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    });

    mocks.triggerSessionExpired("admin");

    await waitFor(() => {
      expect(screen.getByText("admin-login-page")).toBeInTheDocument();
    });
  });
});
