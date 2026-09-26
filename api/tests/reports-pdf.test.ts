import request from "supertest";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";

const TEST_EMAILS = ["reports.owner@campus-coin.local"] as const;

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

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

describe("Monthly report PDF export and email share", () => {
  beforeEach(async () => {
    await prisma.transaction.deleteMany({
      where: { user: { email: { in: [...TEST_EMAILS] } } },
    });

    await prisma.category.deleteMany({
      where: { user: { email: { in: [...TEST_EMAILS] } } },
    });

    await prisma.refreshToken.deleteMany({
      where: { user: { email: { in: [...TEST_EMAILS] } } },
    });

    await prisma.user.deleteMany({
      where: { email: { in: [...TEST_EMAILS] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("exports a valid PDF containing only the caller's monthly data", async () => {
    const session = await registerAndLogin("reports.owner@campus-coin.local", "Reports Owner");
    const month = currentMonth();

    const category = await prisma.category.create({
      data: {
        userId: session.userId,
        name: "Food",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
      },
    });

    await prisma.transaction.create({
      data: {
        id: uuidv7(),
        userId: session.userId,
        categoryId: category.id,
        type: "EXPENSE",
        amount: "42.50",
        description: "Ăn uống ở canteen",
        source: "MANUAL",
        txnDate: new Date(`${month}-05T00:00:00.000Z`),
      },
    });

    const response = await request(APP)
      .get("/api/v1/reports/monthly/export")
      .query({ month, format: "pdf" })
      .set("Authorization", `Bearer ${session.accessToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).toContain(`campus-coin-report-${month}.pdf`);

    const buffer = response.body as Buffer;
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString("utf-8")).toBe("%PDF");
  });

  it("rejects a 6th email share in the same day with 429", async () => {
    const session = await registerAndLogin("reports.owner@campus-coin.local", "Reports Owner");
    const month = currentMonth();
    const shareBody = { month, toEmail: "friend@campus-coin.local" };

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request(APP)
        .post("/api/v1/reports/monthly/share")
        .set("Authorization", `Bearer ${session.accessToken}`)
        .send(shareBody);

      expect(response.status).toBe(200);
    }

    const sixthResponse = await request(APP)
      .post("/api/v1/reports/monthly/share")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send(shareBody);

    expect(sixthResponse.status).toBe(429);
  });
});
