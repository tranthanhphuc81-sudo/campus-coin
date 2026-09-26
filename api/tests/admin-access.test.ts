import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const APP = createApp();
const PASSWORD = "Password#1234";

const ADMIN_EMAIL = "admin.p14@campus-coin.local";
const STUDENT_EMAIL = "student.p14@campus-coin.local";
const OTHER_STUDENT_EMAIL = "student.p14.other@campus-coin.local";

async function ensureAdminSchema() {
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE users ADD COLUMN status ENUM('PENDING','ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE'",
    );
  } catch {
    // Column already exists in updated schemas.
  }

  try {
    await prisma.$executeRawUnsafe("ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL");
  } catch {
    // Column already exists in updated schemas.
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INT NOT NULL AUTO_INCREMENT,
      title VARCHAR(150) NOT NULL,
      body VARCHAR(1000) NOT NULL,
      level ENUM('INFO','WARNING') NOT NULL DEFAULT 'INFO',
      starts_at DATE NOT NULL,
      ends_at DATE NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by CHAR(36) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_announcements_active_window (is_active, starts_at, ends_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT NOT NULL AUTO_INCREMENT,
      actor_id CHAR(36) NOT NULL,
      actor_role ENUM('STUDENT','ADMIN') NOT NULL,
      action VARCHAR(120) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id VARCHAR(64) NULL,
      ip_hash CHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      metadata JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_audit_logs_actor_created (actor_id, created_at),
      INDEX idx_audit_logs_action_created (action, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function createAdminAccount() {
  const passwordHash = await argon2.hash(PASSWORD);

  const admin = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      fullName: "System Admin",
      email: ADMIN_EMAIL,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const login = await request(APP).post("/api/v1/admin/auth/login").send({
    email: ADMIN_EMAIL,
    password: PASSWORD,
  });

  return {
    admin,
    accessToken: String(login.body.accessToken),
  };
}

async function registerAndLoginStudent(email: string, fullName: string) {
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
    cookies: (loginResponse.headers["set-cookie"] as string[] | undefined) ?? [],
  };
}

describe("Admin access controls", () => {
  beforeEach(async () => {
    await ensureAdminSchema();

    await prisma.auditLog.deleteMany();

    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            in: [ADMIN_EMAIL, STUDENT_EMAIL, OTHER_STUDENT_EMAIL],
          },
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [ADMIN_EMAIL, STUDENT_EMAIL, OTHER_STUDENT_EMAIL],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns 403 when a student calls /admin/* endpoints", async () => {
    const student = await registerAndLoginStudent(STUDENT_EMAIL, "Student Admin Probe");

    const response = await request(APP)
      .get("/api/v1/admin/stats/overview")
      .set("Authorization", `Bearer ${student.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/forbidden");
  });

  it("returns 403 when an admin tries to call transactions API", async () => {
    const adminSession = await createAdminAccount();

    const response = await request(APP)
      .get("/api/v1/transactions?month=2026-09&type=expense")
      .set("Authorization", `Bearer ${adminSession.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.type).toBe("https://campus-coin.dev/problems/forbidden");
  });

  it("revokes refresh tokens immediately after admin disables a student", async () => {
    const adminSession = await createAdminAccount();
    const student = await registerAndLoginStudent(STUDENT_EMAIL, "Student To Disable");

    const disableResponse = await request(APP)
      .post(`/api/v1/admin/users/${student.userId}/disable`)
      .set("Authorization", `Bearer ${adminSession.accessToken}`);

    expect(disableResponse.status).toBe(200);

    const refreshResponse = await request(APP)
      .post("/api/v1/auth/refresh")
      .set("Cookie", student.cookies);

    expect(refreshResponse.status).toBe(401);
  });
});
