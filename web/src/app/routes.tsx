import { Suspense, lazy, type ReactNode } from "react";
import { matchPath } from "react-router-dom";

import { en } from "@/content/en";
import LandingPage from "@/pages/public/LandingPage";
import SitemapPage from "@/pages/public/SitemapPage";
import AdminLoginPage from "@/pages/auth/AdminLoginPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import VerifyEmailPage from "@/pages/auth/VerifyEmailPage";
import BudgetsPage from "@/pages/budgets/BudgetsPage";
import ManageCategoriesPage from "@/pages/categories/ManageCategoriesPage";
import StudentHomePage from "@/pages/home/StudentHomePage";
import ImportsPage from "@/pages/imports/ImportsPage";
import InsightsPage from "@/pages/insights/InsightsPage";
import TipsPage from "@/pages/tips/TipsPage";
import SavedPage from "@/pages/saved/SavedPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import TransactionsPage from "@/pages/transactions/TransactionsPage";

const AdminDashboardPage = lazy(() => import("@/pages/admin/AdminDashboardPage"));
const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage"));
const AdminCategoriesPage = lazy(() => import("@/pages/admin/AdminCategoriesPage"));
const AdminTipsPage = lazy(() => import("@/pages/admin/AdminTipsPage"));
const AdminAnnouncementsPage = lazy(() => import("@/pages/admin/AdminAnnouncementsPage"));
const AdminAuditLogsPage = lazy(() => import("@/pages/admin/AdminAuditLogsPage"));

function lazyRoute(element: ReactNode): ReactNode {
  return <Suspense fallback={<p>{en.common.loadingLabel}</p>}>{element}</Suspense>;
}

export type AppRouteHandle = {
  crumb?: string;
  sitemap?: {
    group: "public" | "student" | "admin";
    label: string;
    description: string;
  };
};

export type AppRouteConfig = {
  path: string;
  element: ReactNode;
  handle?: AppRouteHandle;
};

export const publicRoutes: AppRouteConfig[] = [
  {
    path: en.routes.home,
    element: <LandingPage />,
    handle: { sitemap: { group: "public", ...en.sitemap.entries.landing } },
  },
  {
    path: en.routes.sitemap,
    element: <SitemapPage />,
    handle: { sitemap: { group: "public", ...en.sitemap.entries.sitemap } },
  },
  {
    path: en.routes.login,
    element: <LoginPage />,
    handle: { sitemap: { group: "public", ...en.sitemap.entries.login } },
  },
  {
    path: en.routes.register,
    element: <RegisterPage />,
    handle: { sitemap: { group: "public", ...en.sitemap.entries.register } },
  },
  {
    path: en.routes.verifyEmail,
    element: <VerifyEmailPage />,
    handle: { sitemap: { group: "public", ...en.sitemap.entries.verifyEmail } },
  },
  {
    path: en.routes.forgotPassword,
    element: <ForgotPasswordPage />,
    handle: { sitemap: { group: "public", ...en.sitemap.entries.forgotPassword } },
  },
  {
    path: en.routes.resetPassword,
    element: <ResetPasswordPage />,
    handle: { sitemap: { group: "public", ...en.sitemap.entries.resetPassword } },
  },
  {
    path: en.routes.adminLogin,
    element: <AdminLoginPage />,
    handle: { sitemap: { group: "admin", ...en.sitemap.entries.adminLogin } },
  },
];

export const studentRoutes: AppRouteConfig[] = [
  {
    path: en.routes.dashboard,
    element: <StudentHomePage />,
    handle: {
      crumb: en.layout.studentNav.dashboard,
      sitemap: { group: "student", ...en.sitemap.entries.dashboard },
    },
  },
  {
    path: en.routes.manageCategories,
    element: <ManageCategoriesPage />,
    handle: {
      crumb: en.layout.studentNav.categories,
      sitemap: { group: "student", ...en.sitemap.entries.categories },
    },
  },
  {
    path: en.routes.transactions,
    element: <TransactionsPage />,
    handle: {
      crumb: en.layout.studentNav.transactions,
      sitemap: { group: "student", ...en.sitemap.entries.transactions },
    },
  },
  {
    path: en.routes.imports,
    element: <ImportsPage />,
    handle: {
      crumb: en.layout.studentNav.imports,
      sitemap: { group: "student", ...en.sitemap.entries.imports },
    },
  },
  {
    path: en.routes.budgets,
    element: <BudgetsPage />,
    handle: {
      crumb: en.layout.studentNav.budgets,
      sitemap: { group: "student", ...en.sitemap.entries.budgets },
    },
  },
  {
    path: en.routes.reports,
    element: <ReportsPage />,
    handle: {
      crumb: en.layout.studentNav.reports,
      sitemap: { group: "student", ...en.sitemap.entries.reports },
    },
  },
  {
    path: en.routes.insights,
    element: <InsightsPage />,
    handle: {
      crumb: en.layout.studentNav.insights,
      sitemap: { group: "student", ...en.sitemap.entries.insights },
    },
  },
  {
    path: en.routes.tips,
    element: <TipsPage />,
    handle: {
      crumb: en.layout.studentNav.tips,
      sitemap: { group: "student", ...en.sitemap.entries.tips },
    },
  },
  {
    path: en.routes.saved,
    element: <SavedPage />,
    handle: {
      crumb: en.layout.studentNav.saved,
      sitemap: { group: "student", ...en.sitemap.entries.saved },
    },
  },
  {
    path: en.routes.profile,
    element: <ProfilePage />,
    handle: {
      crumb: en.layout.studentNav.settings,
      sitemap: { group: "student", ...en.sitemap.entries.profile },
    },
  },
];

export const adminRoutes: AppRouteConfig[] = [
  {
    path: en.routes.adminHome,
    element: lazyRoute(<AdminDashboardPage />),
    handle: { sitemap: { group: "admin", ...en.sitemap.entries.adminDashboard } },
  },
  {
    path: en.routes.adminUsers,
    element: lazyRoute(<AdminUsersPage />),
    handle: { sitemap: { group: "admin", ...en.sitemap.entries.adminUsers } },
  },
  {
    path: en.routes.adminDefaultCategories,
    element: lazyRoute(<AdminCategoriesPage />),
    handle: { sitemap: { group: "admin", ...en.sitemap.entries.adminCategories } },
  },
  {
    path: en.routes.adminTipTemplates,
    element: lazyRoute(<AdminTipsPage />),
    handle: { sitemap: { group: "admin", ...en.sitemap.entries.adminTips } },
  },
  {
    path: en.routes.adminAnnouncements,
    element: lazyRoute(<AdminAnnouncementsPage />),
    handle: { sitemap: { group: "admin", ...en.sitemap.entries.adminAnnouncements } },
  },
  {
    path: en.routes.adminAuditLogs,
    element: lazyRoute(<AdminAuditLogsPage />),
    handle: { sitemap: { group: "admin", ...en.sitemap.entries.adminAuditLogs } },
  },
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
    return [{ label: en.layout.studentNav.dashboard, to: en.routes.dashboard }];
  }

  if (matched.path === en.routes.dashboard) {
    return [{ label: matched.handle.crumb }];
  }

  return [
    { label: en.layout.studentNav.dashboard, to: en.routes.dashboard },
    { label: matched.handle.crumb },
  ];
}
