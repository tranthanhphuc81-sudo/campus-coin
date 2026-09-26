import { Prisma } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";

const TEST_EMAILS = ["rr.owner@campus-coin.local", "rr.other@campus-coin.local"] as const;

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

async function cleanupTestDataWithRetry(maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.transaction.deleteMany({
        where: {
          user: {
            email: { in: [...TEST_EMAILS] },
          },
        },
      });

      await prisma.recurringRule.deleteMany({
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

      return;
    } catch (error) {
      const isRetryableConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

      if (!isRetryableConflict || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 80 * attempt);
      });
    }
  }
}

describe("Recurring rules endpoints", () => {
  beforeEach(async () => {
    await cleanupTestDataWithRetry();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates recurring rule successfully", async () => {
    const session = await registerAndLogin("rr.owner@campus-coin.local", "Recurring Owner");

    const category = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Dorm",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const response = await request(APP)
      .post("/api/v1/recurring-rules")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        categoryId: category.id,
        type: "expense",
        amount: "150.00",
        description: "Dorm rent",
        frequency: "monthly",
        intervalCount: 1,
        dayOfMonth: 31,
        startDate: "2026-01-31",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      categoryId: category.id,
      type: "expense",
      amount: "150",
      frequency: "monthly",
      dayOfMonth: 31,
    });
  });

  it("returns 404 when updating another user's recurring rule", async () => {
    const owner = await registerAndLogin("rr.owner@campus-coin.local", "Recurring Owner");
    const other = await registerAndLogin("rr.other@campus-coin.local", "Recurring Other");

    const ownerCategory = await prisma.category.create({
      data: {
        userId: owner.userId,
        name: "Transport",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const ownersRule = await prisma.recurringRule.create({
      data: {
        userId: owner.userId,
        categoryId: ownerCategory.id,
        type: "EXPENSE",
        amount: "20.00",
        description: "Bus pass",
        frequency: "WEEKLY",
        intervalCount: 1,
        dayOfWeek: 1,
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        nextRunDate: new Date("2026-09-07T00:00:00.000Z"),
        isActive: true,
      },
    });

    const response = await request(APP)
      .patch(`/api/v1/recurring-rules/${ownersRule.id}`)
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send({
        amount: "22.00",
      });

    expect(response.status).toBe(404);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/not-found");
  });
});
