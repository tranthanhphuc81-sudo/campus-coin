/**
 * cross-tenant-sweep.test.ts
 * P18: a single, self-checking integration test that dynamically discovers every registered
 * student route (mounted under `/api/v1/*`, excluding `/admin`, `/auth` and `/health`, and the one
 * public `GET /announcements/active`) that takes an Express param segment (`:id`, `:month`, ...),
 * then proves — for EVERY one of them — that user A hitting user B's resource gets 404 (never 403/
 * 500, CLAUDE.md's cross-tenant invariant), and that B's row is provably unchanged afterwards.
 *
 * "Dynamic" means literal: `routeIntrospection.ts` monkey-patches the live Express router to record
 * every route as it is registered, and this file's `it('registry matches discovered routes')` test
 * asserts the discovered set is EXACTLY the set of keys in the manually-written `registry` below —
 * so a new `:id` student route added later without sweep coverage fails this test loudly, by name,
 * instead of silently going untested.
 *
 * `/imports/:id*` is included here too (lightly) even though `imports-cross-tenant.test.ts` already
 * covers it in more depth — both are kept so this file's registry-vs-discovery equality holds
 * without an ad-hoc exclusion.
 * Spec: docs/spec/12 (testing plan) · CLAUDE.md security invariants
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
// Type-only import: fully erased at compile time, so this never triggers a runtime import of
// 'express' ahead of `patchRouterIntrospection()` below (unlike a value import would).
import type { Express } from 'express';
import { patchRouterIntrospection, discoverRoutes } from '../fixtures/routeIntrospection.js';

// MUST patch before `src/app.ts` (or anything importing it) is ever imported in this file's
// isolated module graph — every `*.routes.ts` module registers its routes at import time.
patchRouterIntrospection();

const { createApp } = await import('../../src/app.js');
const { prisma } = await import('../../src/lib/prisma.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../fixtures/auth.js');
const { toDbDate } = await import('../../src/lib/dates.js');
const importsService = await import('../../src/modules/imports/imports.service.js');

/** Prefixes that are never part of the student `:id` sweep (own dedicated RBAC/auth coverage). */
const EXCLUDED_PREFIXES = ['/api/v1/admin', '/api/v1/auth', '/api/v1/health'];

/** True when `{method, path}` belongs in the sweep: a student `/api/v1/*` route with a param. */
function isSweepCandidate(method: string, path: string): boolean {
  if (!path.startsWith('/api/v1/')) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;
  if (method === 'get' && path === '/api/v1/announcements/active') return false; // public, no auth
  if (!/:[A-Za-z0-9_]+/.test(path)) return false; // must have a param segment
  return true;
}

interface Actor {
  userId: string;
  token: string;
}

/** One cross-tenant check: an HTTP method against a discovered route pattern. */
interface RouteCheck {
  method: 'get' | 'post' | 'patch' | 'delete';
  /** Full discovered path pattern, e.g. `/api/v1/transactions/:id`. */
  path: string;
  /** Body to send (if the route's schema requires one to get past validation). */
  body?: Record<string, unknown>;
}

/** One resource type's full cross-tenant sweep spec. */
interface ResourceGroup {
  name: string;
  checks: RouteCheck[];
  /** Creates the resource as `b`, returning the id substituted into every check's `:param`. */
  setup(app: Express, b: Actor): Promise<string>;
  /** Re-reads the resource as `b` (or via Prisma) and asserts nothing changed. */
  verifyUnchanged(app: Express, b: Actor, id: string): Promise<void>;
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Substitutes the (single) `:param` segment of a discovered path with a concrete id. */
function fillPath(pattern: string, id: string): string {
  return pattern.replace(/:[A-Za-z0-9_]+/, id);
}

describe.skipIf(!process.env.DATABASE_URL)('Cross-tenant sweep: every student :id route -> 404, B unchanged', () => {
  const app = createApp();
  /** `TipTemplate` rows created by the `tips` group — not owned by a test user (no `createdBy`),
   * so `cleanupTestUsers()`'s cascade never removes them; tracked here and deleted explicitly. */
  const createdTipTemplateIds: number[] = [];

  beforeEach(async () => {
    await flushRateLimits();
  });

  afterEach(async () => {
    await cleanupTestUsers();
    if (createdTipTemplateIds.length > 0) {
      await prisma.tipTemplate.deleteMany({ where: { id: { in: createdTipTemplateIds } } });
      createdTipTemplateIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function loginAs(): Promise<Actor> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, token: res.body.accessToken as string };
  }

  // ---------------------------------------------------------------------------------------------
  // Registry: one entry per discovered route, grouped by resource for efficient fixture reuse.
  // ---------------------------------------------------------------------------------------------

  const groups: ResourceGroup[] = [
    {
      name: 'transactions',
      checks: [
        { method: 'get', path: '/api/v1/transactions/:id' },
        { method: 'patch', path: '/api/v1/transactions/:id', body: { version: 1, description: 'hacked' } },
        { method: 'get', path: '/api/v1/transactions/:id/history' },
        { method: 'post', path: '/api/v1/transactions/:id/resolve-flag', body: { flag: 'anomaly', action: 'keep' } },
        { method: 'post', path: '/api/v1/transactions/:id/restore' },
        { method: 'delete', path: '/api/v1/transactions/:id' },
      ],
      async setup(app, b) {
        const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });
        const res = await request(app)
          .post('/api/v1/transactions')
          .set(auth(b.token))
          .send({ type: 'expense', categoryId: category.id, amount: '12.34', txnDate: '2024-01-10', description: 'B only' });
        expect(res.status).toBe(201);
        return res.body.id as string;
      },
      async verifyUnchanged(app, b, id) {
        const res = await request(app).get(`/api/v1/transactions/${id}`).set(auth(b.token));
        expect(res.status).toBe(200);
        expect(res.body.version).toBe(1);
        expect(res.body.description).toBe('B only');
        expect(res.body.deletedAt).toBeNull();
      },
    },
    {
      name: 'categories',
      checks: [
        { method: 'patch', path: '/api/v1/categories/:id', body: { name: 'Hacked Name' } },
        { method: 'delete', path: '/api/v1/categories/:id' },
      ],
      async setup(app, b) {
        const res = await request(app).post('/api/v1/categories').set(auth(b.token)).send({ name: 'B Category', type: 'expense' });
        expect(res.status).toBe(201);
        return String(res.body.id);
      },
      async verifyUnchanged(app, b, id) {
        const res = await request(app).get('/api/v1/categories?includeInactive=true').set(auth(b.token));
        expect(res.status).toBe(200);
        const row = (res.body as Array<{ id: number; name: string; isActive: boolean }>).find((c) => String(c.id) === id);
        expect(row).toMatchObject({ name: 'B Category', isActive: true });
      },
    },
    {
      name: 'recurring-rules',
      checks: [
        { method: 'patch', path: '/api/v1/recurring-rules/:id', body: { amount: '1.00' } },
        { method: 'delete', path: '/api/v1/recurring-rules/:id' },
      ],
      async setup(app, b) {
        const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });
        const res = await request(app)
          .post('/api/v1/recurring-rules')
          .set(auth(b.token))
          .send({ type: 'expense', categoryId: category.id, amount: '9.99', frequency: 'monthly', dayOfMonth: 1, startDate: '2024-01-01' });
        expect(res.status).toBe(201);
        return String(res.body.id);
      },
      async verifyUnchanged(app, b, id) {
        const res = await request(app).get('/api/v1/recurring-rules').set(auth(b.token));
        expect(res.status).toBe(200);
        const row = (res.body as Array<{ id: number; amount: string; isActive: boolean }>).find((r) => String(r.id) === id);
        expect(row).toMatchObject({ amount: '9.99', isActive: true });
      },
    },
    {
      name: 'budgets',
      checks: [{ method: 'delete', path: '/api/v1/budgets/:id' }],
      async setup(app, b) {
        const category = await prisma.category.findFirstOrThrow({ where: { isDefault: true, type: 'expense' } });
        const res = await request(app)
          .put('/api/v1/budgets')
          .set(auth(b.token))
          .send({ month: '2024-01-01', budgets: [{ categoryId: category.id, limitAmount: '100.00' }] });
        expect(res.status).toBe(200);
        const row = (res.body as Array<{ id: number; categoryId: number }>).find((r) => r.categoryId === category.id)!;
        return String(row.id);
      },
      async verifyUnchanged(app, b, id) {
        const res = await request(app).get('/api/v1/budgets?month=2024-01-01').set(auth(b.token));
        expect(res.status).toBe(200);
        const row = (res.body as Array<{ id: number; limitAmount: string }>).find((r) => String(r.id) === id);
        expect(row).toMatchObject({ limitAmount: '100.00' });
      },
    },
    {
      name: 'bookmarks',
      checks: [
        { method: 'patch', path: '/api/v1/bookmarks/:id', body: { note: 'hacked' } },
        { method: 'delete', path: '/api/v1/bookmarks/:id' },
      ],
      async setup(app, b) {
        const res = await request(app).post('/api/v1/bookmarks').set(auth(b.token)).send({ targetType: 'report', targetRef: 'overview' });
        expect(res.status).toBe(201);
        return String(res.body.id);
      },
      async verifyUnchanged(app, b, id) {
        const res = await request(app).get('/api/v1/bookmarks').set(auth(b.token));
        expect(res.status).toBe(200);
        const row = (res.body.data as Array<{ id: number; note: string | null }>).find((r) => String(r.id) === id);
        expect(row).toMatchObject({ note: null });
      },
    },
    {
      name: 'notifications',
      checks: [{ method: 'post', path: '/api/v1/notifications/:id/read' }],
      async setup(_app, b) {
        const row = await prisma.notification.create({
          data: { userId: b.userId, type: 'system', title: 'Sweep test', dedupeKey: `sweep-${b.userId}` },
        });
        return row.id.toString();
      },
      async verifyUnchanged(_app, _b, id) {
        const row = await prisma.notification.findUniqueOrThrow({ where: { id: BigInt(id) } });
        expect(row.readAt).toBeNull();
      },
    },
    {
      name: 'tips',
      checks: [
        { method: 'post', path: '/api/v1/tips/:id/pin' },
        { method: 'post', path: '/api/v1/tips/:id/unpin' },
        { method: 'post', path: '/api/v1/tips/:id/dismiss' },
      ],
      async setup(_app, b) {
        const template = await prisma.tipTemplate.create({
          data: {
            code: `SWP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            ruleType: 'general',
            titleTpl: 'T',
            bodyTpl: 'B',
          },
        });
        createdTipTemplateIds.push(template.id);
        const tip = await prisma.userTip.create({
          data: {
            userId: b.userId,
            templateId: template.id,
            period: toDbDate('2024-01-01'),
            renderedTitle: 'T',
            renderedBody: 'B',
            impactAmount: '0.00',
            score: '0.0000',
            status: 'active',
          },
        });
        return tip.id.toString();
      },
      async verifyUnchanged(_app, _b, id) {
        const row = await prisma.userTip.findUniqueOrThrow({ where: { id: BigInt(id) } });
        expect(row.status).toBe('active');
        expect(row.dismissedUntil).toBeNull();
      },
    },
    {
      name: 'insights',
      checks: [
        { method: 'get', path: '/api/v1/insights/:month' },
        { method: 'post', path: '/api/v1/insights/:month/regenerate' },
      ],
      async setup(_app, b) {
        const row = await prisma.insight.create({
          data: {
            userId: b.userId,
            month: toDbDate('2024-01-01'),
            summaryText: 'Summary',
            tipText: 'Tip',
            flaggedPatterns: [],
            statsSnapshot: {},
            generator: 'template',
            status: 'completed',
            regenerateCount: 0,
            generatedAt: new Date(),
          },
        });
        // The registry key uses `:month` as the placeholder; the actual param value is the
        // month string itself (`2024-01-01`), not `row.id` — `fillPath` substitutes it directly.
        void row;
        return '2024-01-01';
      },
      async verifyUnchanged(_app, b, month) {
        const row = await prisma.insight.findUniqueOrThrow({ where: { userId_month: { userId: b.userId, month: toDbDate(month) } } });
        expect(row.regenerateCount).toBe(0);
        expect(row.status).toBe('completed');
      },
    },
    {
      name: 'imports',
      checks: [
        { method: 'get', path: '/api/v1/imports/:id' },
        { method: 'patch', path: '/api/v1/imports/:id/rows', body: { setAllSelected: true } },
        { method: 'post', path: '/api/v1/imports/:id/commit' },
        { method: 'get', path: '/api/v1/imports/:id/errors.csv' },
        { method: 'delete', path: '/api/v1/imports/:id' },
      ],
      async setup(app, b) {
        const csv = 'date,amount,type,description,category\n2024-01-20,4.00,expense,B-only row,Food\n';
        const upload = await request(app)
          .post('/api/v1/imports')
          .set(auth(b.token))
          .attach('file', Buffer.from(csv, 'utf8'), { filename: 'b-only.csv', contentType: 'text/csv' });
        expect(upload.status).toBe(202);
        const batchId = upload.body.batchId as string;
        await importsService.parseBatch({ batchId, userId: b.userId, rev: 0 });
        return batchId;
      },
      async verifyUnchanged(app, b, id) {
        const res = await request(app).get(`/api/v1/imports/${id}`).set(auth(b.token));
        expect(res.status).toBe(200);
      },
    },
    {
      name: 'sessions',
      checks: [{ method: 'delete', path: '/api/v1/me/sessions/:id' }],
      async setup(app, b) {
        const res = await request(app).get('/api/v1/me/sessions').set(auth(b.token));
        expect(res.status).toBe(200);
        return res.body[0].id as string;
      },
      async verifyUnchanged(app, b, id) {
        const res = await request(app).get('/api/v1/me/sessions').set(auth(b.token));
        expect(res.status).toBe(200);
        expect((res.body as Array<{ id: string }>).some((s) => s.id === id)).toBe(true);
      },
    },
  ];

  it('the registry above covers exactly the routes discovered live from the Express app (no drift)', () => {
    const discovered = discoverRoutes(app)
      .filter(({ method, path }) => isSweepCandidate(method, path))
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`)
      .sort();
    const registered = groups
      .flatMap((g) => g.checks.map((c) => `${c.method.toUpperCase()} ${c.path}`))
      .sort();
    expect(registered).toEqual(discovered);
  });

  describe.each(groups)('$name', (group) => {
    it('every route 404s for another user, and the owner\'s data is unchanged', async () => {
      const a = await loginAs();
      const b = await loginAs();
      const id = await group.setup(app, b);

      for (const check of group.checks) {
        const url = fillPath(check.path, id);
        const res = await request(app)
          [check.method](url)
          .set(auth(a.token))
          .send(check.body ?? {});
        expect(res.status, `${check.method.toUpperCase()} ${url} should 404 for a non-owner`).toBe(404);
        expect(res.body.type).toBe('not-found');
      }

      await group.verifyUnchanged(app, b, id);
    });
  });
});
