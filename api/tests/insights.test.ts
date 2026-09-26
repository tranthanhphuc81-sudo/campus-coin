import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";
const TEST_EMAILS = [
  "insights.owner@campus-coin.local",
  "insights.other@campus-coin.local",
] as const;

async function ensureInsightsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS insights (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id CHAR(36) NOT NULL,
      month DATE NOT NULL,
      status ENUM('QUEUED','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'QUEUED',
      summary_text VARCHAR(600) NOT NULL,
      tip_text VARCHAR(300) NOT NULL,
      stats_snapshot JSON NOT NULL,
      flagged_patterns JSON NOT NULL,
      generator VARCHAR(20) NOT NULL DEFAULT 'template',
      regenerate_count INT NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_insights_user_month (user_id, month),
      KEY idx_insights_user_status_month (user_id, status, month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function registerAndLogin(email: string, fullName: string) {
  await request(APP).post("/api/v1/auth/register").send({
    fullName,
    email,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });

  const loginResponse = await request(APP).post("/api/v1/auth/login").send({
    email,
    password: PASSWORD,
  });

  return {
    accessToken: String(loginResponse.body.accessToken),
    userId: String(loginResponse.body.user.id),
  };
}

describe("Insights endpoints", () => {
  beforeEach(async () => {
    await ensureInsightsTable();

    await prisma.notification.deleteMany({
      where: {
        user: {
          email: { in: [...TEST_EMAILS] },
        },
      },
    });

    await prisma.insight.deleteMany({
      where: {
        user: {
          email: { in: [...TEST_EMAILS] },
        },
      },
    });

    await prisma.transaction.deleteMany({
      where: {
        user: {
          email: { in: [...TEST_EMAILS] },
        },
      },
    });

    await prisma.category.deleteMany({
      where: {
        user: {
          email: { in: [...TEST_EMAILS] },
        },
      },
    });

    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: { in: [...TEST_EMAILS] },
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: { in: [...TEST_EMAILS] },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns insight history for authenticated user", async () => {
    const owner = await registerAndLogin("insights.owner@campus-coin.local", "Insights Owner");

    await prisma.insight.create({
      data: {
        userId: owner.userId,
        month: new Date("2026-08-01T00:00:00.000Z"),
        status: "COMPLETED",
        summaryText: "Food spending increased.",
        tipText: "Try a weekly cap.",
        statsSnapshot: {},
        flaggedPatterns: [],
        generator: "template",
      },
    });

    const response = await request(APP)
      .get("/api/v1/insights")
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data[0]).toMatchObject({
      month: "2026-08",
      status: "completed",
    });
  });

  it("returns 202 for regenerate and blocks after 3 attempts", async () => {
    const owner = await registerAndLogin("insights.owner@campus-coin.local", "Insights Owner");

    await prisma.insight.create({
      data: {
        userId: owner.userId,
        month: new Date("2026-09-01T00:00:00.000Z"),
        status: "COMPLETED",
        summaryText: "Monthly summary",
        tipText: "Monthly tip",
        statsSnapshot: {},
        flaggedPatterns: [],
        generator: "template",
        regenerateCount: 2,
      },
    });

    const accepted = await request(APP)
      .post("/api/v1/insights/2026-09/regenerate")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({});

    expect(accepted.status).toBe(202);

    await prisma.insight.update({
      where: {
        userId_month: {
          userId: owner.userId,
          month: new Date("2026-09-01T00:00:00.000Z"),
        },
      },
      data: {
        regenerateCount: 3,
      },
    });

    const blocked = await request(APP)
      .post("/api/v1/insights/2026-09/regenerate")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({});

    expect(blocked.status).toBe(409);
    expect(blocked.body.type).toBe("https://campus-coin.dev/problems/conflict");
  });

  it("returns 401 when insights endpoints are called without token", async () => {
    const response = await request(APP).get("/api/v1/insights");

    expect(response.status).toBe(401);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/unauthenticated");
  });
});
