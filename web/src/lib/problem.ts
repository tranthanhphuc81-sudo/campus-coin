import type { AxiosError } from "axios";
import type { FieldPath, FieldValues, Path, UseFormSetError } from "react-hook-form";
import { z } from "zod";

const problemFieldIssueSchema = z.object({
  field: z.string(),
  message: z.string(),
});

const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(problemFieldIssueSchema).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export type FormFieldIssue = {
  field: string;
  message: string;
};

export type ProblemPresentation = {
  title: string;
  detail: string;
  fieldErrors: FormFieldIssue[];
};

export function parseProblem(error: unknown): ProblemPresentation {
  const fallback: ProblemPresentation = {
    title: "Something went wrong",
    detail: "Please try again in a moment.",
    fieldErrors: [],
  };

  const axiosError = error as AxiosError | undefined;
  const data = axiosError?.response?.data;
  const parsed = problemDetailsSchema.safeParse(data);

  if (!parsed.success) {
    return fallback;
  }

  return {
    title: parsed.data.title,
    detail: parsed.data.detail,
    fieldErrors: (parsed.data.errors ?? []).map((item) => ({
      field: item.field,
      message: item.message,
    })),
  };
}

export function applyProblemToForm<TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
  fieldErrors: FormFieldIssue[],
): void {
  for (const fieldError of fieldErrors) {
    const formField = fieldError.field as Path<TFieldValues>;
    setError(formField as FieldPath<TFieldValues>, {
      type: "server",
      message: fieldError.message,
    });
  }
}
