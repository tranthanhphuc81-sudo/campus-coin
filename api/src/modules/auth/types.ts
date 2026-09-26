import type { User } from "@prisma/client";

export type AuthRole = "student" | "admin";

export type UserWithAiOptIn = User & { aiOptIn: boolean };

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: AuthRole;
  emailVerifiedAt?: string | null;
  aiOptIn: boolean;
};

export type AuthSessionResult = {
  accessToken: string;
  user: AuthUser;
  refreshToken: string;
};

export type PublicAuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: AuthRole;
  emailVerifiedAt: string | null;
  aiOptIn: boolean;
  preferences: {
    theme: "light" | "dark";
    fontScale: 90 | 100 | 115 | 130;
  } | null;
};

export type RequestClientMeta = {
  userAgent: string | null;
  ipAddress: string | null;
};
