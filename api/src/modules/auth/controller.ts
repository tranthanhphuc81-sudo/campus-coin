import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";

import {
  adminLogin,
  forgotPassword,
  getMe,
  login,
  logout,
  refresh,
  register,
  resetPassword,
  updateProfile,
  verifyEmail,
} from "./service.js";

function getClientMeta(req: Request) {
  return {
    userAgent: req.header("user-agent") ?? null,
    ipAddress: req.ip ?? null,
  };
}

function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/api/v1/auth",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  };
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const message = await register(req.body, getClientMeta(req));
  res.status(201).json({ message });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const result = await login(req.body, getClientMeta(req));
  res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());
  res.status(200).json({ accessToken: result.accessToken, user: result.user });
}

export async function adminLoginHandler(req: Request, res: Response): Promise<void> {
  const result = await adminLogin(req.body, getClientMeta(req));
  res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());
  res.status(200).json({ accessToken: result.accessToken, user: result.user });
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies.refreshToken as string | undefined;
  const result = await refresh(refreshToken ?? "", getClientMeta(req));
  res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());
  res.status(200).json({ accessToken: result.accessToken, user: result.user });
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const refreshToken = (req.cookies.refreshToken as string | undefined) ?? null;
  await logout(refreshToken);
  res.clearCookie("refreshToken", getRefreshCookieOptions());
  res.status(204).send();
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw unauthenticated();
  }

  const me = await getMe(userId);
  res.status(200).json(me);
}

export async function patchMeHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw unauthenticated();
  }

  const me = await updateProfile(userId, req.body);
  res.status(200).json(me);
}

export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const message = await verifyEmail(req.body);
  res.status(200).json({ message });
}

export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  const message = await forgotPassword(req.body);
  res.status(200).json({ message });
}

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  const message = await resetPassword(req.body);
  res.status(200).json({ message });
}
