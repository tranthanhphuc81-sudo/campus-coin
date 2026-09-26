import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";
const TEST_EMAILS = ["tips.owner@campus-coin.local", "tips.other@campus-coin.local"] as const;

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

describe("Tips endpoints", () => {
  beforeEach(async () => {
    await prisma.userTip.deleteMany({
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

    await prisma.tipTemplate.upsert({
      where: { code: "R0_GENERAL" },
      update: {
        ruleType: "GENERAL",
        titleTpl: "Quick savings habit",
        bodyTpl: "Review one category every week and keep your plan simple.",
        locale: "en",
        isActive: true,
      },
      create: {
        code: "R0_GENERAL",
        ruleType: "GENERAL",
        titleTpl: "Quick savings habit",
        bodyTpl: "Review one category every week and keep your plan simple.",
        locale: "en",
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns tips and allows pin/unpin/dismiss actions", async () => {
    const session = await registerAndLogin("tips.owner@campus-coin.local", "Tips Owner");

    const listResponse = await request(APP)
      .get("/api/v1/tips")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.data.tips)).toBe(true);

    const firstTip = listResponse.body.data.tips[0] as { id: string } | undefined;
    expect(firstTip).toBeDefined();

    if (!firstTip) {
      return;
    }

    const pinResponse = await request(APP)
      .post(`/api/v1/tips/${firstTip.id}/pin`)
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(pinResponse.status).toBe(200);

    const unpinResponse = await request(APP)
      .post(`/api/v1/tips/${firstTip.id}/unpin`)
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(unpinResponse.status).toBe(200);

    const dismissResponse = await request(APP)
      .post(`/api/v1/tips/${firstTip.id}/dismiss`)
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(dismissResponse.status).toBe(200);
  });

  it("returns 404 when another user tries to mutate tip ownership", async () => {
    const owner = await registerAndLogin("tips.owner@campus-coin.local", "Tips Owner");
    const other = await registerAndLogin("tips.other@campus-coin.local", "Tips Other");

    const ownerTips = await request(APP)
      .get("/api/v1/tips")
      .set("Authorization", `Bearer ${owner.accessToken}`);

    const firstTip = ownerTips.body.data.tips[0] as { id: string } | undefined;
    expect(firstTip).toBeDefined();

    if (!firstTip) {
      return;
    }

    const response = await request(APP)
      .post(`/api/v1/tips/${firstTip.id}/pin`)
      .set("Authorization", `Bearer ${other.accessToken}`);

    expect(response.status).toBe(404);
  });

  it("requires authentication to list tips", async () => {
    const response = await request(APP).get("/api/v1/tips");

    expect(response.status).toBe(401);
  });
});
