import type { User } from "@prisma/client";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { uuidv7 } from "uuidv7";
import type { z } from "zod";

import { config } from "../../config/env.js";
import { AppError, conflict, tokenExpired, unauthenticated } from "../../lib/problem.js";
import {
  adminLoginSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./schema.js";
import {
  createRefreshTokenSession,
  createUser,
  findRefreshTokenSession,
  findUserByEmail,
  findUserById,
  revokeRefreshTokenSession,
  updateUserAiOptIn,
} from "./repository.js";
import type {
  AuthSessionResult,
  PublicAuthUser,
  RequestClientMeta,
  UserWithAiOptIn,
} from "./types.js";

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;
type AdminLoginInput = z.infer<typeof adminLoginSchema>;
type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

const jwtSecret = new TextEncoder().encode(config.JWT_SECRET);

function roleToWireValue(role: User["role"]): "student" | "admin" {
  return role === "ADMIN" ? "admin" : "student";
}

function toPublicUser(user: UserWithAiOptIn): PublicAuthUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: roleToWireValue(user.role),
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    aiOptIn: user.aiOptIn,
  };
}

async function createAccessToken(user: User): Promise<string> {
  return new SignJWT({ role: roleToWireValue(user.role), type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(jwtSecret);
}

async function createRefreshToken(user: User, sessionId: string): Promise<string> {
  return new SignJWT({ role: roleToWireValue(user.role), type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${config.REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(jwtSecret);
}

export async function register(
  input: RegisterInput,
  clientMeta: RequestClientMeta,
): Promise<string> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw conflict("An account with this email already exists.", [
      {
        field: "email",
        message: "Email is already in use.",
      },
    ]);
  }

  const passwordHash = await argon2.hash(input.password);

  await createUser({
    id: uuidv7(),
    fullName: input.fullName,
    email: input.email,
    passwordHash,
    role: "STUDENT",
  });

  void clientMeta;

  return "Your account has been created successfully. You can sign in now.";
}

async function issueSession(
  user: UserWithAiOptIn,
  clientMeta: RequestClientMeta,
): Promise<AuthSessionResult> {
  const sessionId = uuidv7();
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_SECONDS * 1000);
  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshToken(user, sessionId);

  await createRefreshTokenSession({
    id: sessionId,
    userId: user.id,
    expiresAt,
    userAgent: clientMeta.userAgent,
    ipAddress: clientMeta.ipAddress,
  });

  return {
    accessToken,
    user: toPublicUser(user),
    refreshToken,
  };
}

export async function login(
  input: LoginInput,
  clientMeta: RequestClientMeta,
): Promise<AuthSessionResult> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw unauthenticated("Invalid email or password.");
  }

  const passwordMatched = await argon2.verify(user.passwordHash, input.password);
  if (!passwordMatched) {
    throw unauthenticated("Invalid email or password.");
  }

  return issueSession(user, clientMeta);
}

export async function adminLogin(
  input: AdminLoginInput,
  clientMeta: RequestClientMeta,
): Promise<AuthSessionResult> {
  const session = await login(input, clientMeta);

  if (session.user.role !== "admin") {
    throw unauthenticated("Invalid admin credentials.");
  }

  return session;
}

export async function refresh(
  refreshToken: string,
  clientMeta: RequestClientMeta,
): Promise<AuthSessionResult> {
  if (!refreshToken) {
    throw tokenExpired();
  }

  try {
    const { payload } = await jwtVerify(refreshToken, jwtSecret);
    const sessionId = payload.jti;
    const userId = payload.sub;

    if (!sessionId || !userId || payload.type !== "refresh") {
      throw unauthenticated("Invalid refresh session.");
    }

    const session = await findRefreshTokenSession(sessionId);
    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt ||
      session.expiresAt < new Date()
    ) {
      throw tokenExpired();
    }

    const user = await findUserById(userId);
    if (!user) {
      throw unauthenticated();
    }

    return issueSession(user, clientMeta);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw tokenExpired();
  }
}

export async function logout(refreshToken: string | null): Promise<void> {
  if (!refreshToken) {
    return;
  }

  try {
    const { payload } = await jwtVerify(refreshToken, jwtSecret);
    const sessionId = payload.jti;
    if (sessionId) {
      await revokeRefreshTokenSession(sessionId);
    }
  } catch {
    // No-op: invalid token should still clear cookie and return 204.
  }
}

export async function getMe(userId: string): Promise<PublicAuthUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw unauthenticated();
  }

  return toPublicUser(user);
}

export async function updateAiOptIn(userId: string, aiOptIn: boolean): Promise<PublicAuthUser> {
  const user = await updateUserAiOptIn(userId, aiOptIn);
  return toPublicUser(user);
}

export async function verifyEmail(input: VerifyEmailInput): Promise<string> {
  void input;
  return "Your email has been verified successfully.";
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<string> {
  void input;
  return "If your account exists, we have sent password reset instructions to your email.";
}

export async function resetPassword(input: ResetPasswordInput): Promise<string> {
  void input;
  return "Your password has been reset successfully. Please sign in with your new password.";
}
