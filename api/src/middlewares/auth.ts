import type { NextFunction, Request, Response } from "express";
import { jwtVerify } from "jose";

import { config } from "../config/env.js";
import { tokenExpired, unauthenticated } from "../lib/problem.js";

const jwtSecret = new TextEncoder().encode(config.JWT_SECRET);

type AccessTokenPayload = {
  sub: string;
  role: "student" | "admin";
  type: "access";
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const rawAuthorization = req.header("authorization");
  if (!rawAuthorization?.startsWith("Bearer ")) {
    next(unauthenticated());
    return;
  }

  const token = rawAuthorization.slice("Bearer ".length).trim();
  if (!token) {
    next(unauthenticated());
    return;
  }

  try {
    const { payload } = await jwtVerify(token, jwtSecret);
    const parsed: AccessTokenPayload = {
      sub: String(payload.sub ?? ""),
      role: payload.role === "admin" ? "admin" : "student",
      type: payload.type === "access" ? "access" : "access",
    };

    if (!parsed.sub || parsed.type !== "access") {
      next(unauthenticated());
      return;
    }

    req.user = {
      id: parsed.sub,
      role: parsed.role,
    };

    next();
  } catch {
    next(tokenExpired());
  }
}
