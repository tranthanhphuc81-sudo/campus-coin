import { resetPasswordInputSchema, type ResetPasswordInput } from "@campus-coin/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/app/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import LoadingButton from "@/components/common/LoadingButton";
import { en } from "@/content/en";
import { getPasswordStrength } from "@/lib/password";
import { applyProblemToForm, parseProblem } from "@/lib/problem";

type Flash = {
  kind: "success" | "error";
  message: string;
};

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [flash, setFlash] = useState<Flash | null>(null);

  const {
    register,
    control,
    setError,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordInputSchema),
    defaultValues: {
      token: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (tokenFromUrl) {
      setValue("token", tokenFromUrl);
    }
  }, [setValue, tokenFromUrl]);

  const passwordValue = useWatch({ control, name: "password" }) ?? "";
  const strength = getPasswordStrength(passwordValue);

  const onSubmit = handleSubmit(async (values) => {
    setFlash(null);

    try {
      const message = await resetPassword(values);
      setFlash({ kind: "success", message });
      navigate(en.routes.login, { replace: true });
    } catch (error) {
      const problem = parseProblem(error);
      applyProblemToForm(setError, problem.fieldErrors);
      setFlash({
        kind: "error",
        message: problem.detail || en.auth.resetPassword.failureMessage,
      });
    }
  });

  return (
    <AuthShell
      title={en.auth.resetPassword.title}
      subtitle={en.auth.resetPassword.subtitle}
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
      {!tokenFromUrl ? <p role="alert">{en.auth.resetPassword.missingTokenMessage}</p> : null}

      <form className="form-stack" noValidate onSubmit={onSubmit}>
        <div className="form-field">
          <label htmlFor="token">{en.auth.resetPassword.tokenLabel}</label>
          <input
            id="token"
            type="text"
            aria-invalid={Boolean(errors.token)}
            aria-describedby={errors.token ? "token-error" : undefined}
            {...register("token")}
          />
          {errors.token ? (
            <p id="token-error" className="form-error" role="alert">
              {errors.token.message}
            </p>
          ) : null}
        </div>

        <div className="form-field">
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
            <p id="password-error" className="form-error" role="alert">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="form-field" aria-live="polite">
          <p>{en.auth.register.passwordStrengthLabel}</p>
          <progress max={100} value={strength.percent} />
          <p>{en.auth.register.strengthLevels[strength.score]}</p>
        </div>

        <div className="form-field">
          <label htmlFor="confirmPassword">{en.auth.resetPassword.confirmPasswordLabel}</label>
          <input
            id="confirmPassword"
            autoComplete="new-password"
            type="password"
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword ? (
            <p id="confirmPassword-error" className="form-error" role="alert">
              {errors.confirmPassword.message}
            </p>
          ) : null}
        </div>

        <LoadingButton type="submit" isLoading={isSubmitting} loadingLabel={en.common.loadingLabel}>
          {en.auth.resetPassword.submitLabel}
        </LoadingButton>
      </form>
    </AuthShell>
  );
}
