import type { Prisma, User } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";

import type { UserWithAiOptIn } from "./types.js";

export async function findUserByEmail(email: string): Promise<UserWithAiOptIn | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string): Promise<UserWithAiOptIn | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(data: Prisma.UserCreateInput): Promise<User> {
  return prisma.user.create({ data });
}

export async function updateUserAiOptIn(id: string, aiOptIn: boolean): Promise<User> {
  return prisma.user.update({ where: { id }, data: { aiOptIn } });
}

export async function updateUserProfile(
  id: string,
  data: { aiOptIn?: boolean; preferences?: Prisma.InputJsonValue },
): Promise<UserWithAiOptIn> {
  return prisma.user.update({ where: { id }, data });
}

export async function createRefreshTokenSession(data: {
  id: string;
  userId: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}): Promise<void> {
  await prisma.refreshToken.create({ data });
}

export async function findRefreshTokenSession(id: string) {
  return prisma.refreshToken.findUnique({ where: { id } });
}

export async function revokeRefreshTokenSession(id: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function revokeAllUserRefreshTokenSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function touchLastLoginAt(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
    },
  });
}
