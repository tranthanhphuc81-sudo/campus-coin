import { TransactionType } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { domainEventBus } from "../src/events/bus.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";

const TEST_EMAILS = ["budget.owner@campus-coin.local", "budget.other@campus-coin.local"] as const;

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

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
  }

  throw new Error("Condition was not satisfied before timeout.");
}

describe("Budgets and notifications endpoints", () => {
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

  it("returns 401 when listing budgets without access token", async () => {
    const response = await request(APP).get("/api/v1/budgets?month=2026-09");

    expect(response.status).toBe(401);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/unauthenticated");
  });

  it("upserts, lists, copies and deletes monthly budgets", async () => {
    const session = await registerAndLogin("budget.owner@campus-coin.local", "Budget Owner");

    const expenseCategory = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Food Personal",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const upsertResponse = await request(APP)
      .put("/api/v1/budgets")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        month: "2026-09",
        items: [
          {
            categoryId: expenseCategory.id,
            limitAmount: "100.00",
            alertThresholdPct: 80,
          },
        ],
      });

    expect(upsertResponse.status).toBe(200);

    const listResponse = await request(APP)
      .get("/api/v1/budgets?month=2026-09")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.data)).toBe(true);
    const categoryBudget = listResponse.body.data.find(
      (item: { categoryId: number }) => item.categoryId === expenseCategory.id,
    );
    expect(categoryBudget).toMatchObject({
      categoryId: expenseCategory.id,
      limitAmount: "100.00",
      alertThresholdPct: 80,
    });

    const copyResponse = await request(APP)
      .post("/api/v1/budgets/copy-previous")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ month: "2026-10" });

    expect(copyResponse.status).toBe(200);
    expect(copyResponse.body.copied).toBe(1);

    const deleteResponse = await request(APP)
      .delete(`/api/v1/budgets/${categoryBudget.id}`)
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ deleted: true });
  });

  it("lists notifications and supports mark read / read all", async () => {
    const session = await registerAndLogin("budget.owner@campus-coin.local", "Budget Owner");

    const created = await prisma.notification.createMany({
      data: [
        {
          userId: session.userId,
          type: "BUDGET_NEAR",
          title: "Budget alert: Food",
          body: "You reached 80%.",
          payload: { source: "test" },
          dedupeKey: "test-key-1",
        },
        {
          userId: session.userId,
          type: "SYSTEM",
          title: "Maintenance",
          body: "Maintenance notice",
          payload: { source: "test" },
          dedupeKey: "test-key-2",
        },
      ],
    });

    expect(created.count).toBe(2);

    const listResponse = await request(APP)
      .get("/api/v1/notifications?page=1&limit=10")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.unreadCount).toBe(2);
    expect(Array.isArray(listResponse.body.data)).toBe(true);

    const firstNotificationId = String(listResponse.body.data[0].id);

    const readOneResponse = await request(APP)
      .post(`/api/v1/notifications/${firstNotificationId}/read`)
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(readOneResponse.status).toBe(200);
    expect(readOneResponse.body.read).toBe(true);

    const readAllResponse = await request(APP)
      .post("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(readAllResponse.status).toBe(200);
    expect(readAllResponse.body.updated).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 when reading another user's notification", async () => {
    const owner = await registerAndLogin("budget.owner@campus-coin.local", "Budget Owner");
    const other = await registerAndLogin("budget.other@campus-coin.local", "Budget Other");

    const ownersNotification = await prisma.notification.create({
      data: {
        userId: owner.userId,
        type: "SYSTEM",
        title: "Owner only",
        body: "Owner notification",
        dedupeKey: "owner-only-notification",
      },
    });

    const response = await request(APP)
      .post(`/api/v1/notifications/${ownersNotification.id.toString()}/read`)
      .set("Authorization", `Bearer ${other.accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/not-found");
  });
});

describe("Budget alerts dedupe rules", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.budget.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.recurringRule.deleteMany();
    await prisma.category.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates only one NEAR_LIMIT notification when threshold is crossed multiple times in one month", async () => {
    const session = await registerAndLogin("budget.owner@campus-coin.local", "Budget Owner");

    const category = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Food",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    await prisma.budget.create({
      data: {
        userId: session.userId,
        categoryId: category.id,
        month: new Date("2026-09-01T00:00:00.000Z"),
        limitAmount: "100.00",
        alertThresholdPct: 80,
      },
    });

    const firstTransaction = await prisma.transaction.create({
      data: {
        id: crypto.randomUUID(),
        userId: session.userId,
        categoryId: category.id,
        type: TransactionType.EXPENSE,
        amount: "81.00",
        description: "Meal 1",
        txnDate: new Date("2026-09-05T00:00:00.000Z"),
      },
    });

    domainEventBus.emit("transaction.created", {
      transactionId: firstTransaction.id,
      userId: session.userId,
      categoryId: category.id,
      type: "expense",
      amount: "81.00",
      txnDate: "2026-09-05",
      source: "manual",
    });

    await waitFor(async () => {
      const count = await prisma.notification.count({
        where: {
          userId: session.userId,
          type: "BUDGET_NEAR",
        },
      });

      return count === 1;
    });

    const secondTransaction = await prisma.transaction.create({
      data: {
        id: crypto.randomUUID(),
        userId: session.userId,
        categoryId: category.id,
        type: TransactionType.EXPENSE,
        amount: "5.00",
        description: "Meal 2",
        txnDate: new Date("2026-09-10T00:00:00.000Z"),
      },
    });

    domainEventBus.emit("transaction.created", {
      transactionId: secondTransaction.id,
      userId: session.userId,
      categoryId: category.id,
      type: "expense",
      amount: "5.00",
      txnDate: "2026-09-10",
      source: "manual",
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });

    const nearNotifications = await prisma.notification.findMany({
      where: {
        userId: session.userId,
        type: "BUDGET_NEAR",
      },
    });

    expect(nearNotifications).toHaveLength(1);
  });

  it("creates a new notification after spending drops below threshold then crosses again", async () => {
    const session = await registerAndLogin("budget.owner@campus-coin.local", "Budget Owner");

    const category = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Transport",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    await prisma.budget.create({
      data: {
        userId: session.userId,
        categoryId: category.id,
        month: new Date("2026-09-01T00:00:00.000Z"),
        limitAmount: "100.00",
        alertThresholdPct: 80,
      },
    });

    const firstTransaction = await prisma.transaction.create({
      data: {
        id: crypto.randomUUID(),
        userId: session.userId,
        categoryId: category.id,
        type: TransactionType.EXPENSE,
        amount: "85.00",
        description: "Ride pass",
        txnDate: new Date("2026-09-05T00:00:00.000Z"),
      },
    });

    domainEventBus.emit("transaction.created", {
      transactionId: firstTransaction.id,
      userId: session.userId,
      categoryId: category.id,
      type: "expense",
      amount: "85.00",
      txnDate: "2026-09-05",
      source: "manual",
    });

    await waitFor(async () => {
      const count = await prisma.notification.count({
        where: {
          userId: session.userId,
          type: "BUDGET_NEAR",
        },
      });
      return count === 1;
    });

    await prisma.transaction.update({
      where: {
        id: firstTransaction.id,
      },
      data: {
        deletedAt: new Date("2026-09-06T08:00:00.000Z"),
      },
    });

    domainEventBus.emit("transaction.deleted", {
      transaction: {
        transactionId: firstTransaction.id,
        userId: session.userId,
        categoryId: category.id,
        type: "expense",
        amount: "85.00",
        txnDate: "2026-09-05",
      },
    });

    await waitFor(async () => {
      const withDedupe = await prisma.notification.count({
        where: {
          userId: session.userId,
          type: "BUDGET_NEAR",
          dedupeKey: {
            not: null,
          },
        },
      });

      return withDedupe === 0;
    });

    const secondTransaction = await prisma.transaction.create({
      data: {
        id: crypto.randomUUID(),
        userId: session.userId,
        categoryId: category.id,
        type: TransactionType.EXPENSE,
        amount: "90.00",
        description: "Fuel",
        txnDate: new Date("2026-09-15T00:00:00.000Z"),
      },
    });

    domainEventBus.emit("transaction.created", {
      transactionId: secondTransaction.id,
      userId: session.userId,
      categoryId: category.id,
      type: "expense",
      amount: "90.00",
      txnDate: "2026-09-15",
      source: "manual",
    });

    await waitFor(async () => {
      const count = await prisma.notification.count({
        where: {
          userId: session.userId,
          type: "BUDGET_NEAR",
        },
      });

      return count === 2;
    });

    const nearNotifications = await prisma.notification.findMany({
      where: {
        userId: session.userId,
        type: "BUDGET_NEAR",
      },
      orderBy: [{ id: "asc" }],
    });

    expect(nearNotifications).toHaveLength(2);
    expect(nearNotifications[0]?.dedupeKey).toBeNull();
    expect(nearNotifications[1]?.dedupeKey).not.toBeNull();
  });
});
