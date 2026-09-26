import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";
const TEST_EMAILS = [
  "bookmarks.owner@campus-coin.local",
  "bookmarks.other@campus-coin.local",
] as const;

async function ensureBookmarksTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id CHAR(36) NOT NULL,
      target_type ENUM('TIP','INSIGHT','REPORT') NOT NULL,
      target_ref VARCHAR(255) NOT NULL,
      note VARCHAR(500) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_bookmarks_user_target (user_id, target_type, target_ref),
      KEY idx_bookmarks_user_type_created (user_id, target_type, created_at)
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

describe("Bookmarks endpoints", () => {
  beforeEach(async () => {
    await ensureBookmarksTable();

    await prisma.bookmark.deleteMany({
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

  it("supports create, list, update, and delete on /bookmarks", async () => {
    const owner = await registerAndLogin("bookmarks.owner@campus-coin.local", "Bookmarks Owner");

    const createResponse = await request(APP)
      .post("/api/v1/bookmarks")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        targetType: "report",
        targetRef: "tab=category&range=this-month&type=expense",
        note: "Review this report every Monday.",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data).toMatchObject({
      targetType: "report",
      targetRef: "tab=category&range=this-month&type=expense",
      note: "Review this report every Monday.",
    });

    const listResponse = await request(APP)
      .get("/api/v1/bookmarks")
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.items).toHaveLength(1);

    const patchResponse = await request(APP)
      .patch("/api/v1/bookmarks")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        targetType: "report",
        targetRef: "tab=category&range=this-month&type=expense",
        note: "Updated note",
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.data.note).toBe("Updated note");

    const deleteResponse = await request(APP)
      .delete("/api/v1/bookmarks")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        targetType: "report",
        targetRef: "tab=category&range=this-month&type=expense",
      });

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.success).toBe(true);
  });

  it("returns rejection responses for duplicate and missing bookmark operations", async () => {
    const owner = await registerAndLogin("bookmarks.owner@campus-coin.local", "Bookmarks Owner");

    await request(APP)
      .post("/api/v1/bookmarks")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        targetType: "tip",
        targetRef: "123",
        note: "Pin this tip",
      });

    const duplicateCreate = await request(APP)
      .post("/api/v1/bookmarks")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        targetType: "tip",
        targetRef: "123",
        note: "Duplicate",
      });

    expect(duplicateCreate.status).toBe(409);

    const missingPatch = await request(APP)
      .patch("/api/v1/bookmarks")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        targetType: "insight",
        targetRef: "2026-09",
        note: "Missing",
      });

    expect(missingPatch.status).toBe(404);

    const missingDelete = await request(APP)
      .delete("/api/v1/bookmarks")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        targetType: "insight",
        targetRef: "2026-09",
      });

    expect(missingDelete.status).toBe(404);
  });

  it("returns 401 when calling /bookmarks without token", async () => {
    const getResponse = await request(APP).get("/api/v1/bookmarks");
    const postResponse = await request(APP).post("/api/v1/bookmarks").send({
      targetType: "tip",
      targetRef: "1",
    });

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
  });
});
