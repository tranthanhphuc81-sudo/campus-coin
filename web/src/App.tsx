import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/app/ProtectedRoute";
import { en } from "@/content/en";
import AdminLoginPage from "@/pages/auth/AdminLoginPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import VerifyEmailPage from "@/pages/auth/VerifyEmailPage";
import AdminHomePage from "@/pages/home/AdminHomePage";
import StudentHomePage from "@/pages/home/StudentHomePage";

export default function App() {
  return (
    <Routes>
      <Route path={en.routes.login} element={<LoginPage />} />
      <Route path={en.routes.register} element={<RegisterPage />} />
      <Route path={en.routes.verifyEmail} element={<VerifyEmailPage />} />
      <Route path={en.routes.forgotPassword} element={<ForgotPasswordPage />} />
      <Route path={en.routes.resetPassword} element={<ResetPasswordPage />} />
      <Route path={en.routes.adminLogin} element={<AdminLoginPage />} />

      <Route element={<ProtectedRoute allow={["student"]} />}>
        <Route path={en.routes.home} element={<StudentHomePage />} />
      </Route>

      <Route element={<ProtectedRoute allow={["admin"]} />}>
        <Route path={en.routes.adminHome} element={<AdminHomePage />} />
      </Route>

      <Route path="*" element={<Navigate to={en.routes.login} replace />} />
    </Routes>
  );
}
