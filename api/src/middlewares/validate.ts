import type { RequestHandler } from "express";
import { type ZodTypeAny, z } from "zod";

import { validationFailed } from "../lib/problem.js";

type ValidateOptions = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

function formatZodErrors(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

export function validate(options: ValidateOptions): RequestHandler {
  return (req, _res, next) => {
    try {
      if (options.body) {
        req.body = options.body.parse(req.body);
      }

      if (options.query) {
        const parsedQuery = options.query.parse(req.query) as Record<string, unknown>;
        const currentQuery = req.query as Record<string, unknown>;

        for (const key of Object.keys(currentQuery)) {
          delete currentQuery[key];
        }

        Object.assign(currentQuery, parsedQuery);
      }

      if (options.params) {
        const parsedParams = options.params.parse(req.params) as Record<string, unknown>;
        const currentParams = req.params as Record<string, unknown>;

        for (const key of Object.keys(currentParams)) {
          delete currentParams[key];
        }

        Object.assign(currentParams, parsedParams);
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(validationFailed(formatZodErrors(error)));
        return;
      }

      next(error);
    }
  };
}
