import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";

const TEST_EMAILS = ["analytics.owner@campus-coin.local", "analytics.other@campus-coin.local"] as const;

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

describe("Analytics endpoints", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany({
      where: {
        user: {
          email: { in: [...TEST_EMAILS] },
        },
      },
    });

    await prisma.budget.deleteMany({
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

  it("returns dashboard summary and keeps month boundary transactions in the right month", async () => {
    const session = await registerAndLogin("analytics.owner@campus-coin.local", "Analytics Owner");

    const food = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Food",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const allowance = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Allowance",
        type: "INCOME",
        isDefault: false,
        isActive: true,
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          id: crypto.randomUUID(),
          userId: session.userId,
          categoryId: allowance.id,
          type: "INCOME",
          amount: "1000.00",
          description: "Monthly allowance",
          txnDate: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          id: crypto.randomUUID(),
          userId: session.userId,
          categoryId: food.id,
          type: "EXPENSE",
          amount: "123.45",
          description: "Dinner near campus",
          txnDate: new Date("2026-09-30T00:00:00.000Z"),
        },
        {
          id: crypto.randomUUID(),
          userId: session.userId,
          categoryId: food.id,
          type: "EXPENSE",
          amount: "50.00",
          description: "Previous month edge",
          txnDate: new Date("2026-08-31T00:00:00.000Z"),
        },
      ],
    });

    await prisma.budget.create({
      data: {
        userId: session.userId,
        categoryId: food.id,
        month: new Date("2026-09-01T00:00:00.000Z"),
        limitAmount: "300.00",
        alertThresholdPct: 80,
      },
    });

    const response = await request(APP)
      .get("/api/v1/dashboard/summary?month=2026-09&timezone=Asia/Ho_Chi_Minh")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toMatchObject({
      income: "1000.00",
      expense: "123.45",
      net: "876.55",
    });

    expect(Array.isArray(response.body.data.categoryBreakdown)).toBe(true);
    expect(response.body.data.categoryBreakdown[0]).toMatchObject({
      categoryId: food.id,
      amount: "123.45",
    });

    expect(response.body.data.budgetVsActual[0]).toMatchObject({
      categoryId: food.id,
      limitAmount: "300.00",
      spent: "123.45",
    });
  });

  it("returns category breakdown report and compares with previous range", async () => {
    const session = await registerAndLogin("analytics.owner@campus-coin.local", "Analytics Owner");

    const transport = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Transport",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          id: crypto.randomUUID(),
          userId: session.userId,
          categoryId: transport.id,
          type: "EXPENSE",
          amount: "30.00",
          txnDate: new Date("2026-09-10T00:00:00.000Z"),
        },
        {
          id: crypto.randomUUID(),
          userId: session.userId,
          categoryId: transport.id,
          type: "EXPENSE",
          amount: "20.00",
          txnDate: new Date("2026-09-12T00:00:00.000Z"),
        },
        {
          id: crypto.randomUUID(),
          userId: session.userId,
          categoryId: transport.id,
          type: "EXPENSE",
          amount: "15.00",
          txnDate: new Date("2026-09-08T00:00:00.000Z"),
        },
      ],
    });

    const response = await request(APP)
      .get("/api/v1/reports/category-breakdown?from=2026-09-10&to=2026-09-12&type=expense")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.totalAmount).toBe("50.00");
    expect(response.body.data.previousTotalAmount).toBe("15.00");
    expect(response.body.data.items[0]).toMatchObject({
      categoryId: transport.id,
      transactionCount: 2,
      amount: "50.00",
    });
  });

  it("returns 401 for dashboard summary when no token is provided", async () => {
    const response = await request(APP).get("/api/v1/dashboard/summary?month=2026-09");

    expect(response.status).toBe(401);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/unauthenticated");
  });

  it("returns 404 behavior for user isolation on reports", async () => {
    const owner = await registerAndLogin("analytics.owner@campus-coin.local", "Analytics Owner");
    const other = await registerAndLogin("analytics.other@campus-coin.local", "Analytics Other");

    const ownerCategory = await prisma.category.create({
      data: {
        userId: owner.userId,
        name: "Books",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    await prisma.transaction.create({
      data: {
        id: crypto.randomUUID(),
        userId: owner.userId,
        categoryId: ownerCategory.id,
        type: "EXPENSE",
        amount: "70.00",
        txnDate: new Date("2026-09-11T00:00:00.000Z"),
      },
    });

    const response = await request(APP)
      .get("/api/v1/reports/category-breakdown?from=2026-09-10&to=2026-09-12&type=expense")
      .set("Authorization", `Bearer ${other.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.totalAmount).toBe("0.00");
    expect(response.body.data.items).toHaveLength(0);
  });
});
