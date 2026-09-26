import type { NextFunction, Request, Response } from "express";
import { jwtVerify } from "jose";

import { config } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { forbidden, tokenExpired, unauthenticated } from "../lib/problem.js";

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

    const user = await prisma.user.findUnique({
      where: { id: parsed.sub },
      select: {
        id: true,
        role: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt || user.status !== "ACTIVE") {
      next(unauthenticated("Your account is disabled or unavailable."));
      return;
    }

    req.user = {
      id: user.id,
      role: user.role === "ADMIN" ? "admin" : "student",
    };

    next();
  } catch {
    next(tokenExpired());
  }
}

export function requireRole(role: "student" | "admin") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthenticated());
      return;
    }

    if (req.user.role !== role) {
      next(forbidden());
      return;
    }

    next();
  };
}
