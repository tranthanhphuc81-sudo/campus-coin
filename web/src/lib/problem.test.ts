import type { UseFormSetError } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { applyProblemToForm, parseProblem } from "@/lib/problem";

describe("problem utilities", () => {
  it("returns fallback message for non-problem payload", () => {
    const result = parseProblem(new Error("boom"));

    expect(result.title).toBe("Something went wrong");
    expect(result.detail).toBe("Please try again in a moment.");
    expect(result.fieldErrors).toEqual([]);
  });

  it("maps RFC9457 fields and validation errors", () => {
    const result = parseProblem({
      response: {
        data: {
          type: "https://api.campuscoin.dev/problems/validation-failed",
          title: "Validation failed",
          status: 422,
          detail: "Please review the highlighted fields.",
          errors: [
            { field: "email", message: "Email is invalid." },
            { field: "password", message: "Password is required." },
          ],
        },
      },
    });

    expect(result.title).toBe("Validation failed");
    expect(result.detail).toBe("Please review the highlighted fields.");
    expect(result.fieldErrors).toEqual([
      { field: "email", message: "Email is invalid." },
      { field: "password", message: "Password is required." },
    ]);
  });

  it("applies field errors to React Hook Form setError", () => {
    type FormValues = {
      email: string;
      password: string;
    };

    const setErrorMock = vi.fn();

    applyProblemToForm(setErrorMock as unknown as UseFormSetError<FormValues>, [
      { field: "email", message: "Email is invalid." },
      { field: "password", message: "Password is required." },
    ]);

    expect(setErrorMock).toHaveBeenNthCalledWith(1, "email", {
      type: "server",
      message: "Email is invalid.",
    });
    expect(setErrorMock).toHaveBeenNthCalledWith(2, "password", {
      type: "server",
      message: "Password is required.",
    });
  });
});
