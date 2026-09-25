import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();

const STUDENT_PASSWORD = "Password#1234";
const CATEGORY_TEST_EMAILS = [
  "cat.student@campus-coin.local",
  "delete.student@campus-coin.local",
  "owner.student@campus-coin.local",
  "another.student@campus-coin.local",
];

async function registerAndLogin(email: string, fullName: string) {
  await request(APP).post("/api/v1/auth/register").send({
    fullName,
    email,
    password: STUDENT_PASSWORD,
    confirmPassword: STUDENT_PASSWORD,
  });

  const loginResponse = await request(APP).post("/api/v1/auth/login").send({
    email,
    password: STUDENT_PASSWORD,
  });

  return {
    accessToken: String(loginResponse.body.accessToken),
    user: loginResponse.body.user as { id: string; email: string },
  };
}

describe("Categories endpoints", () => {
  beforeEach(async () => {
    await prisma.transaction.deleteMany({
      where: {
        user: {
          email: {
            in: CATEGORY_TEST_EMAILS,
          },
        },
      },
    });

    await prisma.category.deleteMany({
      where: {
        user: {
          email: {
            in: CATEGORY_TEST_EMAILS,
          },
        },
      },
    });

    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            in: CATEGORY_TEST_EMAILS,
          },
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          in: CATEGORY_TEST_EMAILS,
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates and lists personal categories by type", async () => {
    const session = await registerAndLogin("cat.student@campus-coin.local", "Category Student");

    const createResponse = await request(APP)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        name: "Part-time",
        type: "income",
        icon: "bi-briefcase",
        color: "#1A9F7A",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      name: "Part-time",
      type: "income",
      isDefault: false,
    });

    const listResponse = await request(APP)
      .get("/api/v1/categories?type=income")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.data)).toBe(true);
    expect(listResponse.body.data.some((item: { name: string }) => item.name === "Part-time")).toBe(
      true,
    );
  });

  it("returns 422 when deleting category with transactions without reassignTo", async () => {
    const session = await registerAndLogin("delete.student@campus-coin.local", "Delete Student");

    const category = await prisma.category.create({
      data: {
        userId: session.user.id,
        name: "Food Home",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
        sortOrder: 10,
      },
    });

    await prisma.transaction.create({
      data: {
        id: crypto.randomUUID(),
        userId: session.user.id,
        categoryId: category.id,
        type: "EXPENSE",
        amount: "12.50",
        description: "Lunch",
        txnDate: new Date("2026-09-01"),
      },
    });

    const response = await request(APP)
      .delete(`/api/v1/categories/${category.id}`)
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(422);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/validation-failed");
  });

  it("returns 404 when reassignTo category belongs to another user", async () => {
    const owner = await registerAndLogin("owner.student@campus-coin.local", "Owner Student");
    const anotherUser = await registerAndLogin(
      "another.student@campus-coin.local",
      "Another Student",
    );

    const sourceCategory = await prisma.category.create({
      data: {
        userId: owner.user.id,
        name: "Transport Cost",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
        sortOrder: 1,
      },
    });

    const anotherUsersCategory = await prisma.category.create({
      data: {
        userId: anotherUser.user.id,
        name: "Another Expense",
        type: "EXPENSE",
        isDefault: false,
        isActive: true,
        sortOrder: 1,
      },
    });

    await prisma.transaction.create({
      data: {
        id: crypto.randomUUID(),
        userId: owner.user.id,
        categoryId: sourceCategory.id,
        type: "EXPENSE",
        amount: "5.00",
        description: "Bus fare",
        txnDate: new Date("2026-09-02"),
      },
    });

    const response = await request(APP)
      .delete(`/api/v1/categories/${sourceCategory.id}?reassignTo=${anotherUsersCategory.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/not-found");
  });
});
