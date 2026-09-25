import { forgotPasswordInputSchema, type ForgotPasswordInput } from "@campus-coin/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { useAuth } from "@/app/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import LoadingButton from "@/components/common/LoadingButton";
import { en } from "@/content/en";
import { applyProblemToForm, parseProblem } from "@/lib/problem";

type Flash = {
  kind: "success" | "error";
  message: string;
};

export default function ForgotPasswordPage() {
  const { sendForgotPassword } = useAuth();
  const [flash, setFlash] = useState<Flash | null>(null);

  const {
    register,
    setError,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordInputSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFlash(null);

    try {
      const message = await sendForgotPassword(values);
      setFlash({ kind: "success", message });
      reset();
    } catch (error) {
      const problem = parseProblem(error);
      applyProblemToForm(setError, problem.fieldErrors);
      setFlash({
        kind: "error",
        message: problem.detail || en.auth.forgotPassword.failureMessage,
      });
    }
  });

  return (
    <AuthShell
      title={en.auth.forgotPassword.title}
      subtitle={en.auth.forgotPassword.subtitle}
      footer={
        <p>
          <Link to={en.routes.login}>{en.common.backToLoginLabel}</Link>
        </p>
      }
    >
      {flash ? (
        <p
          className={flash.kind === "success" ? "flash-success" : "flash-error"}
          role="status"
          aria-live="polite"
        >
          {flash.message}
        </p>
      ) : null}

      <form className="form-stack" noValidate onSubmit={onSubmit}>
        <div className="form-field">
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
            <p id="email-error" className="form-error" role="alert">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <LoadingButton type="submit" isLoading={isSubmitting} loadingLabel={en.common.loadingLabel}>
          {en.auth.forgotPassword.submitLabel}
        </LoadingButton>
      </form>
    </AuthShell>
  );
}
