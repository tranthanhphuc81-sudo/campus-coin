import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

function readRequired(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readIntWithDefault(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable: ${key}`);
  }

  return Math.trunc(parsed);
}

function readCorsOrigins(): string[] {
  const value = process.env.CORS_ORIGINS;
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function readJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.trim().length >= 16) {
    return fromEnv;
  }

  if ((process.env.NODE_ENV ?? "development") !== "production") {
    return "campus-coin-dev-jwt-secret-change-me";
  }

  throw new Error("Missing required environment variable: JWT_SECRET");
}

export const config = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? "3000"),
  APP_URL: readRequired("APP_URL"),
  CORS_ORIGINS: readCorsOrigins(),
  DATABASE_URL: readRequired("DATABASE_URL"),
  JWT_SECRET: readJwtSecret(),
  ACCESS_TOKEN_TTL_SECONDS: readIntWithDefault("ACCESS_TOKEN_TTL", 900),
  REFRESH_TOKEN_TTL_SECONDS: readIntWithDefault("REFRESH_TOKEN_TTL", 60 * 60 * 24 * 30),
} as const;
