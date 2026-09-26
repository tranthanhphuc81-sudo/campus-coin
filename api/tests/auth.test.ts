import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

import request from "supertest";
import { describe, expect, it, beforeEach, afterAll } from "vitest";

const TEST_EMAIL = "student.auth.test@campus-coin.local";

describe("Auth endpoints", () => {
  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: TEST_EMAIL,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: TEST_EMAIL,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("TC-01 registers an account successfully", async () => {
    const app = createApp();

    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "Student Test",
      email: TEST_EMAIL,
      password: "Password#1234",
      confirmPassword: "Password#1234",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      message: expect.any(String),
    });
  });

  it("TC-02 rejects invalid registration payload", async () => {
    const app = createApp();

    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "A",
      email: "invalid-email",
      password: "weak",
      confirmPassword: "weak2",
    });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      type: "https://campus-coin.dev/problems/validation-failed",
      status: 422,
    });
    expect(Array.isArray(response.body.errors)).toBe(true);
  });

  it("TC-03 logs in, refreshes, and reads current user profile", async () => {
    const app = createApp();

    await request(app).post("/api/v1/auth/register").send({
      fullName: "Student Test",
      email: TEST_EMAIL,
      password: "Password#1234",
      confirmPassword: "Password#1234",
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: TEST_EMAIL,
      password: "Password#1234",
    });

    expect(loginResponse.status).toBe(200);
    expect(typeof loginResponse.body.accessToken).toBe("string");
    expect(loginResponse.body.user).toMatchObject({
      email: TEST_EMAIL,
      role: "student",
    });

    const cookieHeader = loginResponse.headers["set-cookie"];
    expect(Array.isArray(cookieHeader)).toBe(true);
    const cookies = Array.isArray(cookieHeader) ? cookieHeader : [];

    const meResponse = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${String(loginResponse.body.accessToken)}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toMatchObject({
      email: TEST_EMAIL,
      role: "student",
      aiOptIn: false,
    });

    const updateProfileResponse = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", `Bearer ${String(loginResponse.body.accessToken)}`)
      .send({ aiOptIn: true, preferences: { theme: "dark", fontScale: 115 } });

    expect(updateProfileResponse.status).toBe(200);
    expect(updateProfileResponse.body).toMatchObject({
      aiOptIn: true,
      preferences: { theme: "dark", fontScale: 115 },
    });

    const refreshedProfileResponse = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${String(loginResponse.body.accessToken)}`);

    expect(refreshedProfileResponse.body.preferences).toEqual({ theme: "dark", fontScale: 115 });

    const refreshResponse = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookies);

    expect(refreshResponse.status).toBe(200);
    expect(typeof refreshResponse.body.accessToken).toBe("string");
  });

  it("rejects an unauthenticated profile preference update", async () => {
    const app = createApp();
    const response = await request(app).patch("/api/v1/me").send({ aiOptIn: true });

    expect(response.status).toBe(401);
  });

  it("rejects profile updates outside the supported schema", async () => {
    const app = createApp();
    await request(app).post("/api/v1/auth/register").send({
      fullName: "Student Test",
      email: TEST_EMAIL,
      password: "Password#1234",
      confirmPassword: "Password#1234",
    });
    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: TEST_EMAIL,
      password: "Password#1234",
    });
    const response = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", `Bearer ${String(loginResponse.body.accessToken)}`)
      .send({ preferences: { theme: "system", fontScale: 95 } });

    expect(response.status).toBe(422);
  });
});
