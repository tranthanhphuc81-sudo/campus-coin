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

export const config = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? "3000"),
  APP_URL: readRequired("APP_URL"),
  DATABASE_URL: readRequired("DATABASE_URL"),
} as const;
