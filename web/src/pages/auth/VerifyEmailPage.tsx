import { verifyEmailInputSchema, type VerifyEmailInput } from "@campus-coin/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "@/app/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import LoadingButton from "@/components/common/LoadingButton";
import { en } from "@/content/en";
import { applyProblemToForm, parseProblem } from "@/lib/problem";

type Flash = {
  kind: "success" | "error";
  message: string;
};

export default function VerifyEmailPage() {
  const { verifyEmail } = useAuth();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [flash, setFlash] = useState<Flash | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VerifyEmailInput>({
    resolver: zodResolver(verifyEmailInputSchema),
    defaultValues: {
      token: "",
    },
  });

  useEffect(() => {
    if (tokenFromUrl) {
      setValue("token", tokenFromUrl);
    }
  }, [setValue, tokenFromUrl]);

  const onSubmit = handleSubmit(async (values) => {
    setFlash(null);

    try {
      const message = await verifyEmail(values);
      setFlash({ kind: "success", message });
    } catch (error) {
      const problem = parseProblem(error);
      applyProblemToForm(setError, problem.fieldErrors);
      setFlash({
        kind: "error",
        message: problem.detail || en.auth.verifyEmail.failureMessage,
      });
    }
  });

  return (
    <AuthShell
      title={en.auth.verifyEmail.title}
      subtitle={en.auth.verifyEmail.subtitle}
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
      {!tokenFromUrl ? <p role="alert">{en.auth.verifyEmail.missingTokenMessage}</p> : null}

      <form className="form-stack" noValidate onSubmit={onSubmit}>
        <div className="form-field">
          <label htmlFor="token">{en.auth.verifyEmail.tokenLabel}</label>
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

        <LoadingButton type="submit" isLoading={isSubmitting} loadingLabel={en.common.loadingLabel}>
          {en.auth.verifyEmail.submitLabel}
        </LoadingButton>
      </form>
    </AuthShell>
  );
}
