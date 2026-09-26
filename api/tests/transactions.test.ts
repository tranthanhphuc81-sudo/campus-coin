import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";

const TEST_EMAILS = ["tx.owner@campus-coin.local", "tx.other@campus-coin.local"] as const;

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

describe("Transactions endpoints", () => {
  beforeEach(async () => {
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

  it("creates and lists transactions for the authenticated user", async () => {
    const session = await registerAndLogin("tx.owner@campus-coin.local", "Transaction Owner");

    const category = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Coffee",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const createResponse = await request(APP)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        categoryId: category.id,
        type: "expense",
        amount: "25.50",
        description: "Campus cafe",
        txnDate: "2026-09-26",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      categoryId: category.id,
      type: "expense",
      amount: "25.50",
      source: "manual",
      txnDate: "2026-09-26",
    });

    const listResponse = await request(APP)
      .get("/api/v1/transactions?month=2026-09&type=expense")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.data)).toBe(true);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      categoryId: category.id,
      description: "Campus cafe",
    });
  });

  it("updates and soft-deletes an owned transaction", async () => {
    const session = await registerAndLogin("tx.owner@campus-coin.local", "Transaction Owner");

    const category = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Transport",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const transaction = await prisma.transaction.create({
      data: {
        id: crypto.randomUUID(),
        userId: session.userId,
        categoryId: category.id,
        type: "EXPENSE",
        amount: "18.00",
        description: "Bus ticket",
        txnDate: new Date("2026-09-15"),
      },
    });

    const patchResponse = await request(APP)
      .patch(`/api/v1/transactions/${transaction.id}`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        amount: "20.00",
        description: "Bus ticket updated",
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      id: transaction.id,
      amount: "20.00",
      description: "Bus ticket updated",
    });

    const deleteResponse = await request(APP)
      .delete(`/api/v1/transactions/${transaction.id}`)
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.deleted).toBe(true);

    const listResponse = await request(APP)
      .get("/api/v1/transactions?month=2026-09&type=expense")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(0);
  });

  it("returns 404 when user B updates user A transaction", async () => {
    const owner = await registerAndLogin("tx.owner@campus-coin.local", "Transaction Owner");
    const other = await registerAndLogin("tx.other@campus-coin.local", "Transaction Other");

    const category = await prisma.category.create({
      data: {
        userId: owner.userId,
        name: "Groceries",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const transaction = await prisma.transaction.create({
      data: {
        id: crypto.randomUUID(),
        userId: owner.userId,
        categoryId: category.id,
        type: "EXPENSE",
        amount: "40.00",
        description: "Weekly groceries",
        txnDate: new Date("2026-09-10"),
      },
    });

    const response = await request(APP)
      .patch(`/api/v1/transactions/${transaction.id}`)
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send({
        amount: "45.00",
      });

    expect(response.status).toBe(404);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/not-found");
  });

  it("returns 401 when listing transactions without access token", async () => {
    const response = await request(APP).get("/api/v1/transactions?month=2026-09&type=expense");

    expect(response.status).toBe(401);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/unauthenticated");
  });
});
