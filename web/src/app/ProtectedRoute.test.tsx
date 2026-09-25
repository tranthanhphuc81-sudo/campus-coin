import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProtectedRoute from "@/app/ProtectedRoute";
import { useAuth } from "@/app/AuthProvider";

vi.mock("@/app/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);

function renderStudentPrivateRoute() {
  return render(
    <MemoryRouter initialEntries={["/private"]}>
      <Routes>
        <Route element={<ProtectedRoute allow={["student"]} />}>
          <Route path="/private" element={<div>student-private</div>} />
        </Route>
        <Route path="/login" element={<div>student-login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderAdminPrivateRoute() {
  return render(
    <MemoryRouter initialEntries={["/admin/private"]}>
      <Routes>
        <Route element={<ProtectedRoute allow={["admin"]} />}>
          <Route path="/admin/private" element={<div>admin-private</div>} />
        </Route>
        <Route path="/admin/login" element={<div>admin-login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("renders loading state while auth status is loading", () => {
    mockUseAuth.mockReturnValue({
      status: "loading",
      user: null,
      role: null,
      isAuthenticated: false,
      signInStudent: vi.fn(),
      signInAdmin: vi.fn(),
      registerAccount: vi.fn(),
      verifyEmail: vi.fn(),
      sendForgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      signOut: vi.fn(),
    });

    renderStudentPrivateRoute();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("redirects anonymous student users to /login", () => {
    mockUseAuth.mockReturnValue({
      status: "anonymous",
      user: null,
      role: null,
      isAuthenticated: false,
      signInStudent: vi.fn(),
      signInAdmin: vi.fn(),
      registerAccount: vi.fn(),
      verifyEmail: vi.fn(),
      sendForgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      signOut: vi.fn(),
    });

    renderStudentPrivateRoute();

    expect(screen.getByText("student-login")).toBeInTheDocument();
  });

  it("redirects anonymous admin users to /admin/login", () => {
    mockUseAuth.mockReturnValue({
      status: "anonymous",
      user: null,
      role: null,
      isAuthenticated: false,
      signInStudent: vi.fn(),
      signInAdmin: vi.fn(),
      registerAccount: vi.fn(),
      verifyEmail: vi.fn(),
      sendForgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      signOut: vi.fn(),
    });

    renderAdminPrivateRoute();

    expect(screen.getByText("admin-login")).toBeInTheDocument();
  });

  it("renders child route when role is allowed", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: {
        id: "u-1",
        fullName: "Student User",
        email: "student@example.com",
        role: "student",
      },
      role: "student",
      isAuthenticated: true,
      signInStudent: vi.fn(),
      signInAdmin: vi.fn(),
      registerAccount: vi.fn(),
      verifyEmail: vi.fn(),
      sendForgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      signOut: vi.fn(),
    });

    renderStudentPrivateRoute();

    expect(screen.getByText("student-private")).toBeInTheDocument();
  });
});
