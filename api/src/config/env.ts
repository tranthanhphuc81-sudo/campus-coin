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

function readBooleanWithDefault(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${key}`);
}

function readOptional(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalPort(key: string): number | undefined {
  const value = readOptional(key);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable: ${key}`);
  }

  return Math.trunc(parsed);
}

function readAiProvider(): "gemini" | "openai" | "none" {
  const raw = (process.env.AI_PROVIDER ?? "none").trim().toLowerCase();
  if (raw === "gemini" || raw === "openai" || raw === "none") {
    return raw;
  }

  throw new Error("Invalid AI_PROVIDER. Expected gemini, openai, or none.");
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
  ENABLE_CRON: readBooleanWithDefault("ENABLE_CRON", false),
  ACCESS_TOKEN_TTL_SECONDS: readIntWithDefault("ACCESS_TOKEN_TTL", 900),
  REFRESH_TOKEN_TTL_SECONDS: readIntWithDefault("REFRESH_TOKEN_TTL", 60 * 60 * 24 * 30),
  SMTP_HOST: readOptional("SMTP_HOST"),
  SMTP_PORT: readOptionalPort("SMTP_PORT"),
  SMTP_USER: readOptional("SMTP_USER"),
  SMTP_PASS: readOptional("SMTP_PASS"),
  MAIL_FROM: readOptional("MAIL_FROM") ?? "Campus Coin <no-reply@campus-coin.dev>",
  AI_PROVIDER: readAiProvider(),
  GEMINI_API_KEY: readOptional("GEMINI_API_KEY"),
  OPENAI_API_KEY: readOptional("OPENAI_API_KEY"),
  AI_CATEGORIZE_TIMEOUT_MS: readIntWithDefault("AI_CATEGORIZE_TIMEOUT_MS", 3000),
  AI_DAILY_QUOTA: readIntWithDefault("AI_DAILY_QUOTA", 200),
  AI_CACHE_TTL_DAYS: readIntWithDefault("AI_CACHE_TTL_DAYS", 7),
  AI_CACHE_MAX_ENTRIES: readIntWithDefault("AI_CACHE_MAX_ENTRIES", 5000),
} as const;
