import type { NextFunction, Request, Response } from "express";

import { AppError } from "../lib/problem.js";

type JsonSyntaxError = SyntaxError & { status?: number; type?: string };

function sendProblem(res: Response, req: Request, appError: AppError): void {
  const payload = {
    type: appError.type,
    title: appError.title,
    status: appError.status,
    detail: appError.detail,
    instance: req.originalUrl,
    requestId: req.requestId,
    errors: appError.errors,
  };

  res.status(appError.status).type("application/problem+json").json(payload);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  void _next;

  if (err instanceof AppError) {
    sendProblem(res, req, err);
    return;
  }

  if (err instanceof SyntaxError && (err as JsonSyntaxError).status === 400 && "body" in err) {
    sendProblem(
      res,
      req,
      new AppError(
        400,
        "https://campus-coin.dev/problems/bad-json",
        "Bad Request",
        "Malformed JSON payload.",
      ),
    );
    return;
  }

  const detail =
    process.env.NODE_ENV === "production" ? "An unexpected error occurred." : String(err);
  sendProblem(
    res,
    req,
    new AppError(500, "https://campus-coin.dev/problems/internal", "Internal Server Error", detail),
  );
}
