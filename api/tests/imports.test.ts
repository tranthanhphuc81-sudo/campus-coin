import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";
const TEST_EMAILS = ["imports.owner@campus-coin.local"] as const;

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

describe("CSV imports endpoints", () => {
  beforeEach(async () => {
    await prisma.transaction.deleteMany({
      where: {
        user: {
          email: { in: [...TEST_EMAILS] },
        },
      },
    });

    await prisma.importRow.deleteMany({
      where: {
        importBatch: {
          user: {
            email: { in: [...TEST_EMAILS] },
          },
        },
      },
    });

    await prisma.importBatch.deleteMany({
      where: {
        user: {
          email: { in: [...TEST_EMAILS] },
        },
      },
    });

    await prisma.idempotencyKey.deleteMany({
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

  it("parses BOM + semicolon CSV and decimal comma amount", async () => {
    const session = await registerAndLogin("imports.owner@campus-coin.local", "Import Owner");

    await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Food",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const csv =
      "\uFEFFdate;amount;type;description;category\n26/09/2026;4,50;;Campus Cafe latte;Food\n";

    const response = await request(APP)
      .post("/api/v1/imports")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .field("dateFormat", "DD/MM/YYYY")
      .attach("file", Buffer.from(csv, "utf8"), {
        filename: "transactions.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
    expect(response.body.preview).toHaveLength(1);
    expect(response.body.preview[0]).toMatchObject({
      rowNumber: 2,
      amount: "4.50",
      type: "expense",
      selected: true,
      duplicate: false,
      errors: [],
    });
  });

  it("reports missing amount with correct line number", async () => {
    const session = await registerAndLogin("imports.owner@campus-coin.local", "Import Owner");

    await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Food",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const csv =
      "date,amount,type,description,category\n2026-09-26,,expense,Campus Cafe latte,Food\n";

    const response = await request(APP)
      .post("/api/v1/imports")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .field("dateFormat", "YYYY-MM-DD")
      .attach("file", Buffer.from(csv, "utf8"), {
        filename: "transactions.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
        }),
      ]),
    );
  });

  it("commits only once for the same Idempotency-Key", async () => {
    const session = await registerAndLogin("imports.owner@campus-coin.local", "Import Owner");

    await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Food",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    const csv =
      "date,amount,type,description,category\n2026-09-26,4.50,expense,Campus Cafe latte,Food\n";

    const uploadResponse = await request(APP)
      .post("/api/v1/imports")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .field("dateFormat", "YYYY-MM-DD")
      .attach("file", Buffer.from(csv, "utf8"), {
        filename: "transactions.csv",
        contentType: "text/csv",
      });

    expect(uploadResponse.status).toBe(200);

    const batchId = String(uploadResponse.body.batchId);

    const firstCommit = await request(APP)
      .post(`/api/v1/imports/${batchId}/commit`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .set("Idempotency-Key", "test-key-1");

    const secondCommit = await request(APP)
      .post(`/api/v1/imports/${batchId}/commit`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .set("Idempotency-Key", "test-key-1");

    expect(firstCommit.status).toBe(200);
    expect(secondCommit.status).toBe(200);
    expect(secondCommit.body.committedRows).toBe(firstCommit.body.committedRows);

    const transactionsCount = await prisma.transaction.count({
      where: {
        userId: session.userId,
        importBatchId: batchId,
      },
    });

    expect(transactionsCount).toBe(1);
  });

  it("returns 413 when uploaded file exceeds 2 MB", async () => {
    const session = await registerAndLogin("imports.owner@campus-coin.local", "Import Owner");

    const hugeCsv = Buffer.concat([
      Buffer.from("date,amount,type,description,category\n", "utf8"),
      Buffer.alloc(3 * 1024 * 1024, "a"),
    ]);

    const response = await request(APP)
      .post("/api/v1/imports")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .field("dateFormat", "YYYY-MM-DD")
      .attach("file", hugeCsv, {
        filename: "too-large.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(413);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/payload-too-large");
  });
});
