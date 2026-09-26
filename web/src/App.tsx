import { Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/app/ProtectedRoute";
import RouteTransition from "@/app/RouteTransition";
import { en } from "@/content/en";
import AdminLayout from "@/layouts/AdminLayout";
import PublicLayout from "@/layouts/PublicLayout";
import StudentLayout from "@/layouts/StudentLayout";
import AdminLoginPage from "@/pages/auth/AdminLoginPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import VerifyEmailPage from "@/pages/auth/VerifyEmailPage";
import NotFoundPage from "@/pages/errors/NotFoundPage";
import AdminHomePage from "@/pages/home/AdminHomePage";
import ManageCategoriesPage from "@/pages/categories/ManageCategoriesPage";
import BudgetsPage from "@/pages/budgets/BudgetsPage";
import StudentHomePage from "@/pages/home/StudentHomePage";
import TransactionsPage from "@/pages/transactions/TransactionsPage";

export default function App() {
  return (
    <RouteTransition>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path={en.routes.login} element={<LoginPage />} />
          <Route path={en.routes.register} element={<RegisterPage />} />
          <Route path={en.routes.verifyEmail} element={<VerifyEmailPage />} />
          <Route path={en.routes.forgotPassword} element={<ForgotPasswordPage />} />
          <Route path={en.routes.resetPassword} element={<ResetPasswordPage />} />
          <Route path={en.routes.adminLogin} element={<AdminLoginPage />} />
        </Route>

        <Route element={<ProtectedRoute allow={["student"]} />}>
          <Route element={<StudentLayout />}>
            <Route path={en.routes.home} element={<StudentHomePage />} />
            <Route path={en.routes.manageCategories} element={<ManageCategoriesPage />} />
            <Route path={en.routes.transactions} element={<TransactionsPage />} />
            <Route path={en.routes.budgets} element={<BudgetsPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allow={["admin"]} />}>
          <Route element={<AdminLayout />}>
            <Route path={en.routes.adminHome} element={<AdminHomePage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </RouteTransition>
  );
}
