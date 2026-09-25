import { loginInputSchema, type LoginInput } from "@campus-coin/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/app/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import { en } from "@/content/en";
import { applyProblemToForm, parseProblem } from "@/lib/problem";

type Flash = {
  kind: "success" | "error";
  message: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInStudent } = useAuth();
  const [flash, setFlash] = useState<Flash | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: {
      rememberMe: false,
      email: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFlash(null);

    try {
      await signInStudent(values);
      setFlash({ kind: "success", message: en.auth.login.successMessage });
      const from = location.state as { from?: string } | undefined;
      navigate(from?.from ?? en.routes.home, { replace: true });
    } catch (error) {
      const problem = parseProblem(error);
      applyProblemToForm(setError, problem.fieldErrors);
      setFlash({
        kind: "error",
        message: problem.detail || en.auth.login.failureMessage,
      });
    }
  });

  return (
    <AuthShell
      title={en.auth.login.title}
      subtitle={en.auth.login.subtitle}
      footer={
        <>
          <p>
            <Link to={en.routes.register}>{en.auth.login.registerLinkLabel}</Link>
          </p>
          <p>
            <Link to={en.routes.forgotPassword}>{en.auth.login.forgotPasswordLinkLabel}</Link>
          </p>
        </>
      }
    >
      {flash ? (
        <p role="status" aria-live="polite">
          {flash.message}
        </p>
      ) : null}

      <form noValidate onSubmit={onSubmit}>
        <div>
          <label htmlFor="email">{en.common.emailLabel}</label>
          <input
            id="email"
            autoComplete="email"
            type="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email ? (
            <p id="email-error" role="alert">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="password">{en.common.passwordLabel}</label>
          <input
            id="password"
            autoComplete="current-password"
            type="password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          {errors.password ? (
            <p id="password-error" role="alert">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="rememberMe">
            <input id="rememberMe" type="checkbox" {...register("rememberMe")} />
            {en.common.rememberMeLabel}
          </label>
        </div>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? en.common.loadingLabel : en.auth.login.submitLabel}
        </button>
      </form>
    </AuthShell>
  );
}
