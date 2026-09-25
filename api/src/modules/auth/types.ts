export type AuthRole = "student" | "admin";

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: AuthRole;
  emailVerifiedAt?: string | null;
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
};

export type RequestClientMeta = {
  userAgent: string | null;
  ipAddress: string | null;
};
