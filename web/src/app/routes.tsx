import type { ReactNode } from "react";
import { matchPath } from "react-router-dom";

import { en } from "@/content/en";
import AdminLoginPage from "@/pages/auth/AdminLoginPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import VerifyEmailPage from "@/pages/auth/VerifyEmailPage";
import BudgetsPage from "@/pages/budgets/BudgetsPage";
import ManageCategoriesPage from "@/pages/categories/ManageCategoriesPage";
import AdminHomePage from "@/pages/home/AdminHomePage";
import StudentHomePage from "@/pages/home/StudentHomePage";
import ImportsPage from "@/pages/imports/ImportsPage";
import InsightsPage from "@/pages/insights/InsightsPage";
import TipsPage from "@/pages/tips/TipsPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import TransactionsPage from "@/pages/transactions/TransactionsPage";

export type AppRouteHandle = {
  crumb?: string;
};

export type AppRouteConfig = {
  path: string;
  element: ReactNode;
  handle?: AppRouteHandle;
};

export const publicRoutes: AppRouteConfig[] = [
  { path: en.routes.login, element: <LoginPage /> },
  { path: en.routes.register, element: <RegisterPage /> },
  { path: en.routes.verifyEmail, element: <VerifyEmailPage /> },
  { path: en.routes.forgotPassword, element: <ForgotPasswordPage /> },
  { path: en.routes.resetPassword, element: <ResetPasswordPage /> },
  { path: en.routes.adminLogin, element: <AdminLoginPage /> },
];

export const studentRoutes: AppRouteConfig[] = [
  {
    path: en.routes.home,
    element: <StudentHomePage />,
    handle: { crumb: en.layout.studentNav.dashboard },
  },
  {
    path: en.routes.manageCategories,
    element: <ManageCategoriesPage />,
    handle: { crumb: en.layout.studentNav.categories },
  },
  {
    path: en.routes.transactions,
    element: <TransactionsPage />,
    handle: { crumb: en.layout.studentNav.transactions },
  },
  {
    path: en.routes.imports,
    element: <ImportsPage />,
    handle: { crumb: en.layout.studentNav.imports },
  },
  {
    path: en.routes.budgets,
    element: <BudgetsPage />,
    handle: { crumb: en.layout.studentNav.budgets },
  },
  {
    path: en.routes.reports,
    element: <ReportsPage />,
    handle: { crumb: en.layout.studentNav.reports },
  },
  {
    path: en.routes.insights,
    element: <InsightsPage />,
    handle: { crumb: en.layout.studentNav.insights },
  },
  {
    path: en.routes.tips,
    element: <TipsPage />,
    handle: { crumb: en.layout.studentNav.tips },
  },
  {
    path: en.routes.profile,
    element: <ProfilePage />,
    handle: { crumb: en.layout.studentNav.settings },
  },
];

export const adminRoutes: AppRouteConfig[] = [
  { path: en.routes.adminHome, element: <AdminHomePage /> },
];

export type BreadcrumbItem = {
  label: string;
  to?: string;
};

export function getStudentBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const matched = studentRoutes.find((route) =>
    matchPath({ path: route.path, end: true }, pathname),
  );

  if (!matched || !matched.handle?.crumb) {
    return [{ label: en.layout.studentNav.dashboard, to: en.routes.home }];
  }

  if (matched.path === en.routes.home) {
    return [{ label: matched.handle.crumb }];
  }

  return [
    { label: en.layout.studentNav.dashboard, to: en.routes.home },
    { label: matched.handle.crumb },
  ];
}
