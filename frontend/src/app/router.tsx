/**
 * router.tsx
 * The app's full route table (React Router v7, `createBrowserRouter`). Every leaf route's
 * `handle: { breadcrumb }` feeds `Breadcrumbs`; every page component is lazy-loaded via
 * `React.lazy` + `<Suspense>` for route-level code splitting.
 * Exports: router
 * Spec: docs/diagrams/fig25.jpg (sitemap) · docs/spec/08 (layouts)
 */
import { Role } from '@campuscoin/shared';
import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter } from 'react-router';
import { en } from '../i18n/en';
import { AdminLayout } from './layouts/AdminLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { StudentLayout } from './layouts/StudentLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { ReportsLayout } from '../features/reports/ReportsLayout';

/** Loading fallback shown while a lazy route chunk is being fetched. */
function RouteLoading() {
  return (
    <div className="py-5 text-center" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
      {en.common.loading}
    </div>
  );
}

/** Wraps a `React.lazy` page import in its own `<Suspense>` boundary. */
function page(loader: () => Promise<{ default: ComponentType }>) {
  const LazyPage = lazy(loader);
  return (
    <Suspense fallback={<RouteLoading />}>
      <LazyPage />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  // ---- Public ---------------------------------------------------------------------------
  {
    path: '/',
    element: <PublicLayout />,
    handle: { breadcrumb: en.breadcrumbs.home },
    children: [
      { index: true, element: page(() => import('../features/landing/pages/LandingPage')) },
      {
        path: 'features',
        element: page(() => import('../features/landing/pages/FeaturesPage')),
        handle: { breadcrumb: en.nav.features },
      },
      {
        path: 'login',
        element: page(() => import('../features/auth/pages/LoginPage')),
        handle: { breadcrumb: en.nav.login },
      },
      {
        path: 'register',
        element: page(() => import('../features/auth/pages/RegisterPage')),
        handle: { breadcrumb: en.nav.register },
      },
      {
        path: 'forgot-password',
        element: page(() => import('../features/auth/pages/ForgotPasswordPage')),
        handle: { breadcrumb: en.nav.forgotPassword },
      },
      {
        path: 'reset-password',
        element: page(() => import('../features/auth/pages/ResetPasswordPage')),
        handle: { breadcrumb: en.nav.resetPassword },
      },
      {
        path: 'verify-email',
        element: page(() => import('../features/auth/pages/VerifyEmailPage')),
        handle: { breadcrumb: en.nav.verifyEmail },
      },
      {
        path: 'resend-verification',
        element: page(() => import('../features/auth/pages/ResendVerificationPage')),
        handle: { breadcrumb: en.nav.resendVerification },
      },
      {
        path: 'privacy',
        element: page(() => import('../features/landing/pages/PrivacyPage')),
        handle: { breadcrumb: en.nav.privacy },
      },
      {
        path: 'terms',
        element: page(() => import('../features/landing/pages/TermsPage')),
        handle: { breadcrumb: en.nav.terms },
      },
      {
        path: 'sitemap',
        element: page(() => import('../features/landing/pages/SitemapPage')),
        handle: { breadcrumb: en.nav.sitemap },
      },
      {
        path: 'help',
        element: page(() => import('../features/help/pages/HelpPage')),
        handle: { breadcrumb: en.nav.help },
      },
      { path: '*', element: page(() => import('../features/landing/pages/NotFoundPage')) },
    ],
  },
  // ---- Admin login (standalone, no ProtectedRoute/AdminLayout) --------------------------
  {
    path: '/admin/login',
    element: <PublicLayout />,
    children: [{ index: true, element: page(() => import('../features/admin-auth/pages/AdminLoginPage')) }],
  },
  // ---- Student area (/app/*) -------------------------------------------------------------
  {
    path: '/app',
    element: <ProtectedRoute allow={[Role.STUDENT]} redirectTo="/login" />,
    children: [
      // Full-page wizard, deliberately outside `StudentLayout` (no sidebar/nav chrome).
      { path: 'onboarding', element: page(() => import('../features/onboarding/pages/OnboardingPage')) },
      {
        element: <StudentLayout />,
        handle: { breadcrumb: en.breadcrumbs.home },
        children: [
          { index: true, element: page(() => import('../features/dashboard/pages/DashboardPage')) },
          {
            path: 'transactions',
            element: page(() => import('../features/transactions/pages/TransactionsPage')),
            handle: { breadcrumb: en.nav.transactions },
          },
          {
            path: 'transactions/recurring',
            element: page(() => import('../features/transactions/pages/RecurringTransactionsPage')),
            handle: { breadcrumb: en.nav.recurring },
          },
          {
            path: 'transactions/import',
            element: page(() => import('../features/transactions/pages/ImportCsvPage')),
            handle: { breadcrumb: en.nav.importCsv },
          },
          {
            path: 'transactions/trash',
            element: page(() => import('../features/transactions/pages/TrashPage')),
            handle: { breadcrumb: en.nav.trash },
          },
          {
            path: 'saved',
            element: page(() => import('../features/saved/pages/SavedPage')),
            handle: { breadcrumb: en.nav.saved },
          },
          {
            path: 'budgets',
            element: page(() => import('../features/budgets/pages/BudgetsPage')),
            handle: { breadcrumb: en.nav.budgets },
          },
          {
            path: 'categories',
            element: page(() => import('../features/categories/pages/MyCategoriesPage')),
            handle: { breadcrumb: en.nav.categories },
          },
          {
            element: <ReportsLayout />,
            children: [
              {
                path: 'reports',
                element: page(() => import('../features/reports/pages/ReportsOverviewPage')),
                handle: { breadcrumb: en.nav.reports },
              },
              {
                path: 'reports/by-period',
                element: page(() => import('../features/reports/pages/ReportsByPeriodPage')),
                handle: { breadcrumb: en.nav.reportsByPeriod },
              },
              {
                path: 'reports/by-category',
                element: page(() => import('../features/reports/pages/ReportsByCategoryPage')),
                handle: { breadcrumb: en.nav.reportsByCategory },
              },
              {
                path: 'reports/forecast',
                element: page(() => import('../features/reports/pages/ReportsForecastPage')),
                handle: { breadcrumb: en.nav.reportsForecast },
              },
            ],
          },
          {
            path: 'insights',
            element: page(() => import('../features/insights/pages/InsightsPage')),
            handle: { breadcrumb: en.nav.insights },
          },
          {
            path: 'tips',
            element: page(() => import('../features/tips/pages/TipsPage')),
            handle: { breadcrumb: en.nav.tips },
          },
          {
            path: 'profile',
            element: page(() => import('../features/profile/pages/ProfileSettingsPage')),
            handle: { breadcrumb: en.nav.profile },
          },
        ],
      },
    ],
  },
  // ---- Admin area (/admin/*) -------------------------------------------------------------
  {
    path: '/admin',
    element: <ProtectedRoute allow={[Role.ADMIN]} redirectTo="/admin/login" />,
    children: [
      {
        element: <AdminLayout />,
        handle: { breadcrumb: en.breadcrumbs.home },
        children: [
          { index: true, element: page(() => import('../features/admin-dashboard/pages/AdminOverviewPage')) },
          {
            path: 'users',
            element: page(() => import('../features/admin-users/pages/AdminUsersPage')),
            handle: { breadcrumb: en.nav.adminUsers },
          },
          {
            path: 'categories',
            element: page(() => import('../features/admin-categories/pages/AdminDefaultCategoriesPage')),
            handle: { breadcrumb: en.nav.adminCategories },
          },
          {
            path: 'tip-templates',
            element: page(() => import('../features/admin-tips/pages/AdminTipTemplatesPage')),
            handle: { breadcrumb: en.nav.adminTipTemplates },
          },
          {
            path: 'notifications',
            element: page(() => import('../features/admin-notifications/pages/AdminNotificationsPage')),
            handle: { breadcrumb: en.nav.adminNotifications },
          },
          {
            path: 'stats',
            element: page(() => import('../features/admin-dashboard/pages/AdminStatsPage')),
            handle: { breadcrumb: en.nav.adminStats },
          },
          {
            path: 'audit-log',
            element: page(() => import('../features/admin-audit/pages/AdminAuditLogPage')),
            handle: { breadcrumb: en.nav.adminAuditLog },
          },
        ],
      },
    ],
  },
]);
