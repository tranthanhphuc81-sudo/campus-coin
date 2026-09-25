import { registerInputSchema, type RegisterInput } from "@campus-coin/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link } from "react-router-dom";

import AuthShell from "@/components/auth/AuthShell";
import { en } from "@/content/en";
import { getPasswordStrength } from "@/lib/password";
import { applyProblemToForm, parseProblem } from "@/lib/problem";
import { useAuth } from "@/app/AuthProvider";

type Flash = {
  kind: "success" | "error";
  message: string;
};

export default function RegisterPage() {
  const { registerAccount } = useAuth();
  const [flash, setFlash] = useState<Flash | null>(null);

  const {
    register,
    control,
    setError,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerInputSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const passwordValue = useWatch({ control, name: "password" }) ?? "";
  const strength = getPasswordStrength(passwordValue);

  const onSubmit = handleSubmit(async (values) => {
    setFlash(null);

    try {
      const message = await registerAccount(values);
      setFlash({ kind: "success", message });
      reset();
    } catch (error) {
      const problem = parseProblem(error);
      applyProblemToForm(setError, problem.fieldErrors);
      setFlash({
        kind: "error",
        message: problem.detail || en.auth.register.failureMessage,
      });
    }
  });

  return (
    <AuthShell
      title={en.auth.register.title}
      subtitle={en.auth.register.subtitle}
      footer={
        <p>
          <Link to={en.routes.login}>{en.auth.register.loginLinkLabel}</Link>
        </p>
      }
    >
      {flash ? (
        <p role="status" aria-live="polite">
          {flash.message}
        </p>
      ) : null}

      <form noValidate onSubmit={onSubmit}>
        <div>
          <label htmlFor="fullName">{en.auth.register.fullNameLabel}</label>
          <input
            id="fullName"
            autoComplete="name"
            type="text"
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? "fullName-error" : undefined}
            {...register("fullName")}
          />
          {errors.fullName ? (
            <p id="fullName-error" role="alert">
              {errors.fullName.message}
            </p>
          ) : null}
        </div>

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
            autoComplete="new-password"
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

        <div aria-live="polite">
          <p>{en.auth.register.passwordStrengthLabel}</p>
          <progress max={100} value={strength.percent} />
          <p>{en.auth.register.strengthLevels[strength.score]}</p>
        </div>

        <div>
          <label htmlFor="confirmPassword">{en.auth.register.confirmPasswordLabel}</label>
          <input
            id="confirmPassword"
            autoComplete="new-password"
            type="password"
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword ? (
            <p id="confirmPassword-error" role="alert">
              {errors.confirmPassword.message}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? en.common.loadingLabel : en.auth.register.submitLabel}
        </button>
      </form>
    </AuthShell>
  );
}
