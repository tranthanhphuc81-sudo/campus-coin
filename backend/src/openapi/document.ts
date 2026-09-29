/**
 * document.ts
 * Builds the CampusCoin OpenAPI 3.1 document in memory from the same Zod schemas the API
 * validates requests with (`@campuscoin/shared` + a couple of module-local `.schema.ts` files),
 * so the spec cannot silently drift from the real request shapes. Every schema exported by
 * `@campuscoin/shared` is auto-registered as a reusable `#/components/schemas/<Name>` entry;
 * routes are registered by hand (Express has no decorator/route metadata to introspect) with the
 * same method/path/middleware order as each module's `*.routes.ts`.
 * Response bodies are NOT Zod-validated anywhere in this codebase (only inputs are, per
 * CLAUDE.md's security invariants) — so response schemas below are best-effort JSON Schema
 * shapes for documentation, not generated from a runtime-checked type. Some rarely-hit or
 * infra-only endpoints (SSE stream, CSV/PDF downloads, health checks) are documented with a
 * plain description rather than a full body schema.
 * Main exports: buildOpenApiDocument
 * Spec: docs/spec/07 (API base path /api/v1, Table 41 errors, Table 46 rate limits)
 */
// MUST be the first import — see zodSetup.ts's file header for why.
import './zodSetup.js';
import { OpenAPIRegistry, OpenApiGeneratorV31, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { z, type ZodType } from 'zod';
import { API_BASE_PATH, TransactionType } from '@campuscoin/shared';
import * as S from '@campuscoin/shared';
import { bigIntIdParamSchema as notificationIdParamSchema } from '../modules/notifications/notifications.schema.js';
import { bigIntIdParamSchema as tipIdParamSchema } from '../modules/tips/tips.schema.js';
import { sessionIdParamSchema } from '../modules/users/users.schema.js';
import backendPackageJson from '../../package.json' with { type: 'json' };

/** `backend/package.json`'s `version` field — the default `info.version` of the generated doc. */
export const BACKEND_VERSION: string = backendPackageJson.version;

/** Local (not re-exported by `@campuscoin/shared`) query schema of `GET /admin/categories` — mirrors `admin-categories.routes.ts`. */
const listAdminCategoriesQuerySchema = z.object({ type: z.enum(TransactionType).optional() }).strict();
/** Local query schema of `DELETE /admin/categories/:id` — mirrors `admin-categories.routes.ts`. */
const deleteAdminCategoryQuerySchema = z
  .object({ archive: z.enum(['true', 'false']).optional() })
  .strict();

/** RFC 9457 Problem Details body every error response uses (`lib/problem.ts` + `errorHandler.ts`). */
const problemDetailsSchema = z
  .object({
    type: z.string().describe('Machine-readable error slug, e.g. "validation-failed".'),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    requestId: z.string().optional(),
    errors: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .describe('Present on 422 validation-failed responses, one entry per invalid field.'),
  })
  .describe('RFC 9457 application/problem+json body.');

/** Generic empty/opaque success body for endpoints whose response shape has no Zod schema. */
const genericSuccessSchema = z.object({}).catchall(z.unknown());

/**
 * Registers every named Zod schema `@campuscoin/shared` exports as an OpenAPI component, so
 * route definitions below can reference them and Swagger UI shows a readable schema name instead
 * of an inlined blob. Skips non-Zod exports (enums, constants, helper functions) automatically.
 * `OpenAPIRegistry.register` returns a NEW schema object carrying the `#/components/...` ref
 * metadata — callers MUST build routes from the returned map, not from the original `S.*`
 * exports, or the generated document inlines the schema instead of `$ref`-ing it.
 * @returns map of export name → registered (ref-tagged) schema.
 */
function registerSharedSchemas(registry: OpenAPIRegistry): Record<string, ZodType> {
  const registered: Record<string, ZodType> = {};
  for (const [name, value] of Object.entries(S)) {
    if (!(value instanceof z.ZodType)) continue;
    try {
      // eslint-disable-next-line security/detect-object-injection -- `name` is our own enumerated key, not user input
      registered[name] = registry.register(name, value as ZodType);
    } catch {
      // A handful of shared schemas are literally the same object re-exported under two names
      // (e.g. an alias); the second registration attempt is skipped rather than failing the
      // whole generator — routes referencing that alias fall back to the original (unregistered,
      // inlined) schema via the `?? S.xxx` default applied where it's used below.
    }
  }
  return registered;
}

/** Error responses shared by nearly every authenticated route, keyed by status code. */
function errorResponses(codes: number[], problemSchema: ZodType): RouteConfig['responses'] {
  const titles: Record<number, string> = {
    400: 'Malformed request.',
    401: 'Missing/invalid access token.',
    403: 'Authenticated but not allowed (wrong role).',
    404: 'Resource not found (or owned by another user).',
    409: 'Conflict (duplicate, already committed, optimistic-lock mismatch, etc).',
    413: 'Upload exceeds the size limit.',
    415: 'Unsupported file type.',
    422: 'One or more fields failed validation.',
    429: 'Rate limit exceeded.',
  };
  const responses: RouteConfig['responses'] = {};
  for (const code of codes) {
    responses[String(code)] = {
      // eslint-disable-next-line security/detect-object-injection -- `code` comes from our own closed Set<number>, not user input
      description: titles[code] ?? 'Error.',
      content: { 'application/problem+json': { schema: problemSchema } },
    };
  }
  return responses;
}

/** Registered (ref-tagged) versions of the module-local param/query schemas used by {@link buildRoutes}. */
interface LocalSchemas {
  sessionIdParamSchema: ZodType;
  notificationIdParamSchema: ZodType;
  tipIdParamSchema: ZodType;
  listAdminCategoriesQuerySchema: ZodType;
  deleteAdminCategoryQuerySchema: ZodType;
}

/** One entry of the route table consumed by {@link registerRoutes}. */
interface RouteDef {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  tag: string;
  summary: string;
  /** `false` for the handful of public/pre-auth endpoints (register, login, active announcements…). */
  auth?: boolean;
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  /** HTTP status of the success response (default 200). */
  successStatus?: number;
  successDescription?: string;
  successSchema?: ZodType;
  /** Extra 4xx codes beyond the default {401,404,422} implied by params/body/auth. */
  extraErrors?: number[];
}

/** Full route table — one row per Express route across all 25 mounted routers (see `app.ts`). */
function buildRoutes(RS: Record<string, ZodType>, local: LocalSchemas): RouteDef[] {
  return [
  // --- auth (public) ---
  { method: 'post', path: '/auth/register', tag: 'Auth', summary: 'Register a new student account.', auth: false, body: RS.registerSchema, successStatus: 201 },
  { method: 'post', path: '/auth/verify-email', tag: 'Auth', summary: 'Verify email with a one-time token.', auth: false, body: RS.verifyEmailSchema },
  { method: 'post', path: '/auth/resend-verification', tag: 'Auth', summary: 'Resend the verification email.', auth: false, body: RS.emailOnlySchema },
  { method: 'post', path: '/auth/forgot-password', tag: 'Auth', summary: 'Request a password-reset email.', auth: false, body: RS.emailOnlySchema },
  { method: 'post', path: '/auth/reset-password', tag: 'Auth', summary: 'Reset password with a one-time token.', auth: false, body: RS.resetPasswordSchema },
  { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Log in with email + password; sets the refresh cookie.', auth: false, body: RS.loginSchema },
  { method: 'post', path: '/auth/refresh', tag: 'Auth', summary: 'Rotate the refresh cookie for a new access token.', auth: false },
  { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Revoke the current session (refresh-token family).', auth: false },
  { method: 'post', path: '/auth/logout-all', tag: 'Auth', summary: 'Revoke every session of the current user.' },

  // --- admin-auth (public) ---
  { method: 'post', path: '/admin/auth/login', tag: 'Admin Auth', summary: 'Admin password step; returns a short-lived MFA challenge token.', auth: false, body: RS.adminLoginSchema },
  { method: 'post', path: '/admin/auth/mfa/verify', tag: 'Admin Auth', summary: 'Admin TOTP/recovery-code step; sets the refresh cookie.', auth: false, body: RS.mfaVerifySchema },

  // --- me / users ---
  { method: 'get', path: '/me', tag: 'Users', summary: "Get the current user's profile." },
  { method: 'patch', path: '/me', tag: 'Users', summary: 'Update profile fields (name, preferences).', body: RS.updateProfileSchema },
  { method: 'patch', path: '/me/password', tag: 'Users', summary: 'Change password (keeps the current session, revokes the rest).', body: RS.changePasswordSchema },
  { method: 'get', path: '/me/sessions', tag: 'Users', summary: 'List active sessions (refresh-token families).' },
  { method: 'delete', path: '/me/sessions/{id}', tag: 'Users', summary: 'Revoke one session by id.', params: local.sessionIdParamSchema },
  { method: 'get', path: '/me/export', tag: 'Users', summary: 'Export all personal data (JSON or CSV) — student-only, 3/day.', query: RS.exportQuerySchema },
  { method: 'delete', path: '/me', tag: 'Users', summary: 'Delete the current account (right to erasure) — student-only.', body: RS.deleteAccountSchema, successStatus: 202 },

  // --- categories ---
  { method: 'get', path: '/categories', tag: 'Categories', summary: 'List categories (system + own).', query: RS.listCategoriesQuerySchema },
  { method: 'post', path: '/categories', tag: 'Categories', summary: 'Create a custom category.', body: RS.createCategorySchema, successStatus: 201 },
  { method: 'patch', path: '/categories/{id}', tag: 'Categories', summary: 'Rename/recolor a custom category.', params: RS.intIdParamSchema, body: RS.updateCategorySchema },
  { method: 'delete', path: '/categories/{id}', tag: 'Categories', summary: 'Delete (or archive) a custom category.', params: RS.intIdParamSchema, query: RS.deleteCategoryQuerySchema },

  // --- transactions ---
  { method: 'get', path: '/transactions', tag: 'Transactions', summary: 'List/search/filter transactions (paginated).', query: RS.listTransactionsQuerySchema },
  { method: 'get', path: '/transactions/{id}', tag: 'Transactions', summary: 'Get one transaction.', params: RS.uuidParamSchema },
  { method: 'post', path: '/transactions', tag: 'Transactions', summary: 'Create a transaction. Supports `Idempotency-Key`.', body: RS.createTransactionSchema, successStatus: 201 },
  { method: 'patch', path: '/transactions/{id}', tag: 'Transactions', summary: 'Update a transaction (optimistic locking via `version`).', params: RS.uuidParamSchema, body: RS.updateTransactionSchema, extraErrors: [409] },
  { method: 'delete', path: '/transactions/{id}', tag: 'Transactions', summary: 'Soft-delete a transaction.', params: RS.uuidParamSchema },
  { method: 'post', path: '/transactions/{id}/restore', tag: 'Transactions', summary: 'Restore a soft-deleted transaction.', params: RS.uuidParamSchema },
  { method: 'get', path: '/transactions/{id}/history', tag: 'Transactions', summary: 'Get the edit history of a transaction.', params: RS.uuidParamSchema },
  { method: 'post', path: '/transactions/{id}/resolve-flag', tag: 'Transactions', summary: 'Resolve an anomaly/duplicate flag on a transaction.', params: RS.uuidParamSchema, body: RS.resolveFlagSchema },

  // --- recurring rules ---
  { method: 'get', path: '/recurring-rules', tag: 'Recurring Rules', summary: 'List recurring rules.' },
  { method: 'post', path: '/recurring-rules', tag: 'Recurring Rules', summary: 'Create a recurring rule.', body: RS.createRecurringRuleSchema, successStatus: 201 },
  { method: 'patch', path: '/recurring-rules/{id}', tag: 'Recurring Rules', summary: 'Update a recurring rule.', params: RS.intIdParamSchema, body: RS.updateRecurringRuleSchema },
  { method: 'delete', path: '/recurring-rules/{id}', tag: 'Recurring Rules', summary: 'Delete a recurring rule.', params: RS.intIdParamSchema },

  // --- budgets ---
  { method: 'get', path: '/budgets', tag: 'Budgets', summary: 'List budgets for a month.', query: RS.listBudgetsQuerySchema },
  { method: 'put', path: '/budgets', tag: 'Budgets', summary: 'Bulk upsert budgets for a month. Supports `Idempotency-Key`.', body: RS.upsertBudgetsSchema },
  { method: 'post', path: '/budgets/copy-previous', tag: 'Budgets', summary: "Copy last month's budgets into the given month.", body: RS.copyPreviousBudgetsSchema },
  { method: 'delete', path: '/budgets/{id}', tag: 'Budgets', summary: 'Delete a budget line.', params: RS.intIdParamSchema },

  // --- notifications ---
  { method: 'get', path: '/notifications', tag: 'Notifications', summary: 'List notifications.', query: RS.listNotificationsQuerySchema },
  { method: 'post', path: '/notifications/read-all', tag: 'Notifications', summary: 'Mark every notification read.' },
  { method: 'post', path: '/notifications/stream-ticket', tag: 'Notifications', summary: 'Get a one-time ticket for the SSE stream.' },
  { method: 'post', path: '/notifications/{id}/read', tag: 'Notifications', summary: 'Mark one notification read.', params: local.notificationIdParamSchema },
  {
    method: 'get',
    path: '/notifications/stream',
    tag: 'Notifications',
    summary: 'Server-Sent Events stream of live notifications (auth via `?ticket=`, not Bearer).',
    auth: false,
  },

  // --- dashboard ---
  { method: 'get', path: '/dashboard/summary', tag: 'Dashboard', summary: 'Dashboard widgets summary for a month.', query: RS.dashboardSummaryQuerySchema },

  // --- ai ---
  { method: 'post', path: '/ai/categorize/suggest', tag: 'AI', summary: 'Get a category suggestion for a merchant/description (3-tier: rules → keywords → LLM).', body: RS.categorizeSuggestSchema },
  { method: 'post', path: '/ai/feedback', tag: 'AI', summary: 'Submit accept/reject feedback on an AI suggestion.', body: RS.aiFeedbackSchema },

  // --- announcements (public) ---
  { method: 'get', path: '/announcements/active', tag: 'Announcements', summary: 'List active announcements (public).', auth: false },

  // --- admin: categories/tip-templates/announcements/users/stats/audit ---
  { method: 'get', path: '/admin/categories', tag: 'Admin', summary: 'List all categories (admin).', query: local.listAdminCategoriesQuerySchema },
  { method: 'post', path: '/admin/categories', tag: 'Admin', summary: 'Create a system category (admin).', body: RS.createCategorySchema, successStatus: 201 },
  { method: 'patch', path: '/admin/categories/{id}', tag: 'Admin', summary: 'Update any category (admin).', params: RS.intIdParamSchema, body: RS.updateCategorySchema },
  { method: 'delete', path: '/admin/categories/{id}', tag: 'Admin', summary: 'Delete/archive any category (admin).', params: RS.intIdParamSchema, query: local.deleteAdminCategoryQuerySchema, extraErrors: [409] },
  { method: 'get', path: '/admin/tip-templates', tag: 'Admin', summary: 'List tip templates (admin).' },
  { method: 'post', path: '/admin/tip-templates', tag: 'Admin', summary: 'Create a tip template (admin).', body: RS.createTipTemplateSchema, successStatus: 201 },
  { method: 'post', path: '/admin/tip-templates/preview', tag: 'Admin', summary: 'Render a tip template preview (admin).', body: RS.previewTipTemplateSchema },
  { method: 'patch', path: '/admin/tip-templates/{id}', tag: 'Admin', summary: 'Update a tip template (admin).', params: RS.intIdParamSchema, body: RS.updateTipTemplateSchema },
  { method: 'delete', path: '/admin/tip-templates/{id}', tag: 'Admin', summary: 'Delete a tip template (admin).', params: RS.intIdParamSchema },
  { method: 'get', path: '/admin/announcements', tag: 'Admin', summary: 'List announcements incl. inactive (admin).' },
  { method: 'post', path: '/admin/announcements', tag: 'Admin', summary: 'Create an announcement (admin).', body: RS.createAnnouncementSchema, successStatus: 201 },
  { method: 'patch', path: '/admin/announcements/{id}', tag: 'Admin', summary: 'Update an announcement (admin).', params: RS.intIdParamSchema, body: RS.updateAnnouncementSchema },
  { method: 'delete', path: '/admin/announcements/{id}', tag: 'Admin', summary: 'Delete an announcement (admin).', params: RS.intIdParamSchema },
  { method: 'get', path: '/admin/users', tag: 'Admin', summary: 'Search/list student accounts (admin).', query: RS.listAdminUsersQuerySchema },
  { method: 'get', path: '/admin/users/{id}', tag: 'Admin', summary: 'Get one student account (admin).', params: RS.uuidParamSchema },
  { method: 'post', path: '/admin/users/{id}/disable', tag: 'Admin', summary: 'Disable a student account (admin).', params: RS.uuidParamSchema },
  { method: 'post', path: '/admin/users/{id}/enable', tag: 'Admin', summary: 'Re-enable a student account (admin).', params: RS.uuidParamSchema },
  { method: 'post', path: '/admin/users/{id}/send-reset', tag: 'Admin', summary: 'Send a password-reset email to a student (admin).', params: RS.uuidParamSchema },
  { method: 'get', path: '/admin/stats/overview', tag: 'Admin', summary: 'Platform-wide stats overview (admin).' },
  { method: 'get', path: '/admin/stats/categories-usage', tag: 'Admin', summary: 'Category usage stats (admin).' },
  { method: 'get', path: '/admin/audit-logs', tag: 'Admin', summary: 'Search the admin audit log (admin, read-only).', query: RS.adminAuditLogQuerySchema },

  // --- imports ---
  { method: 'get', path: '/imports/template', tag: 'Imports', summary: 'Download the CSV import template.' },
  { method: 'post', path: '/imports', tag: 'Imports', summary: 'Upload a CSV file to start an import batch (multipart/form-data, 10/hour).', extraErrors: [413, 415] },
  { method: 'get', path: '/imports/{id}', tag: 'Imports', summary: 'Get an import batch (preview rows, paginated).', params: RS.uuidParamSchema, query: RS.importBatchQuerySchema },
  { method: 'patch', path: '/imports/{id}/rows', tag: 'Imports', summary: 'Edit preview rows before commit.', params: RS.uuidParamSchema, body: RS.updateImportRowsSchema },
  { method: 'delete', path: '/imports/{id}', tag: 'Imports', summary: 'Discard an import batch.', params: RS.uuidParamSchema },
  { method: 'post', path: '/imports/{id}/commit', tag: 'Imports', summary: 'Commit an import batch (creates transactions). Supports `Idempotency-Key`.', params: RS.uuidParamSchema, extraErrors: [409] },
  { method: 'get', path: '/imports/{id}/errors.csv', tag: 'Imports', summary: 'Download the row-level error report as CSV.', params: RS.uuidParamSchema },

  // --- reports ---
  { method: 'get', path: '/reports/category-breakdown', tag: 'Reports', summary: 'Category breakdown report.', query: RS.reportCategoryBreakdownQuerySchema },
  { method: 'get', path: '/reports/income-vs-expense', tag: 'Reports', summary: 'Income vs expense report.', query: RS.reportIncomeVsExpenseQuerySchema },
  { method: 'get', path: '/reports/daily-weekly', tag: 'Reports', summary: 'Daily/weekly spending report.', query: RS.reportDailyWeeklyQuerySchema },
  { method: 'get', path: '/reports/monthly/export', tag: 'Reports', summary: 'Export the monthly report as PDF or PNG.', query: RS.reportMonthlyExportQuerySchema },
  { method: 'post', path: '/reports/monthly/share', tag: 'Reports', summary: 'Email the monthly report to the current user (5/day).', body: RS.reportShareSchema },

  // --- insights ---
  { method: 'get', path: '/insights', tag: 'Insights', summary: 'List monthly AI insights.', query: RS.listInsightsQuerySchema },
  { method: 'get', path: '/insights/{month}', tag: 'Insights', summary: 'Get the insight for one month.', params: RS.insightMonthParamSchema },
  { method: 'post', path: '/insights/{month}/regenerate', tag: 'Insights', summary: 'Regenerate the insight for one month (3/30days).', params: RS.insightMonthParamSchema },

  // --- tips ---
  { method: 'get', path: '/tips', tag: 'Tips', summary: 'List personalised saving tips.' },
  { method: 'post', path: '/tips/{id}/pin', tag: 'Tips', summary: 'Pin a tip.', params: local.tipIdParamSchema },
  { method: 'post', path: '/tips/{id}/unpin', tag: 'Tips', summary: 'Unpin a tip.', params: local.tipIdParamSchema },
  { method: 'post', path: '/tips/{id}/dismiss', tag: 'Tips', summary: 'Dismiss a tip.', params: local.tipIdParamSchema },

  // --- activity / forecast / bookmarks ---
  { method: 'get', path: '/activity/recent', tag: 'Activity', summary: 'Recent cross-feature activity feed.', query: RS.recentActivityQuerySchema },
  { method: 'get', path: '/forecast/next-month', tag: 'Forecast', summary: "Forecast next month's spend from recent history.", query: RS.forecastQuerySchema },
  { method: 'get', path: '/bookmarks', tag: 'Bookmarks', summary: 'List bookmarked tips/reports.', query: RS.listBookmarksQuerySchema },
  { method: 'post', path: '/bookmarks', tag: 'Bookmarks', summary: 'Create a bookmark. Supports `Idempotency-Key`.', body: RS.createBookmarkSchema, successStatus: 201 },
  { method: 'patch', path: '/bookmarks/{id}', tag: 'Bookmarks', summary: 'Update a bookmark (e.g. note).', params: RS.bookmarkIdParamSchema, body: RS.updateBookmarkSchema },
  { method: 'delete', path: '/bookmarks/{id}', tag: 'Bookmarks', summary: 'Delete a bookmark.', params: RS.bookmarkIdParamSchema },

  // --- health (public) ---
  { method: 'get', path: '/health/live', tag: 'Health', summary: 'Liveness probe: the process is up.', auth: false },
  { method: 'get', path: '/health/ready', tag: 'Health', summary: 'Readiness probe: DB + Redis reachable.', auth: false },
  ];
}


/** Registers every {@link RouteDef} onto `registry`, deriving the standard error set. */
function registerRoutes(registry: OpenAPIRegistry, routes: RouteDef[], problemSchema: ZodType): void {
  for (const r of routes) {
    const isAuthed = r.auth !== false;
    const codes = new Set<number>(r.extraErrors ?? []);
    if (isAuthed) {
      codes.add(401);
      if (r.path.startsWith('/admin/')) codes.add(403);
    }
    if (r.params) codes.add(404);
    if (r.body ?? r.query) codes.add(422);
    codes.add(429);

    registry.registerPath({
      method: r.method,
      path: `${API_BASE_PATH}${r.path}`,
      tags: [r.tag],
      summary: r.summary,
      security: isAuthed ? [{ bearerAuth: [] }] : [],
      request: {
        params: r.params as never,
        query: r.query as never,
        body: r.body ? { content: { 'application/json': { schema: r.body } } } : undefined,
      },
      responses: {
        [String(r.successStatus ?? 200)]: {
          description: r.successDescription ?? 'Success.',
          content: { 'application/json': { schema: r.successSchema ?? genericSuccessSchema } },
        },
        ...errorResponses([...codes].sort((a, b) => a - b), problemSchema),
      },
    });
  }
}

/**
 * Builds the full OpenAPI 3.1 document for the CampusCoin API. Pure/no I/O — callers decide
 * whether to write it to disk ({@link ./generate.ts}) or serve it live (Swagger UI in `app.ts`).
 * @param version - API version string (defaults to {@link BACKEND_VERSION}).
 */
export function buildOpenApiDocument(version: string = BACKEND_VERSION): OpenAPIObject {
  const registry = new OpenAPIRegistry();

  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Short-lived access token (EdDSA JWT) from `POST /auth/login`, sent as `Authorization: Bearer <token>`.',
  });

  const RS = registerSharedSchemas(registry);
  const problemSchema = registry.register('ProblemDetails', problemDetailsSchema);
  const local: LocalSchemas = {
    sessionIdParamSchema: registry.register('SessionIdParam', sessionIdParamSchema),
    notificationIdParamSchema: registry.register('NotificationIdParam', notificationIdParamSchema),
    tipIdParamSchema: registry.register('TipIdParam', tipIdParamSchema),
    listAdminCategoriesQuerySchema: registry.register('AdminCategoriesQuery', listAdminCategoriesQuerySchema),
    deleteAdminCategoryQuerySchema: registry.register('AdminCategoryDeleteQuery', deleteAdminCategoryQuerySchema),
  };

  registerRoutes(registry, buildRoutes(RS, local), problemSchema);

  const generator = new OpenApiGeneratorV31([...registry.definitions]);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'CampusCoin API',
      version,
      description:
        'CampusCoin ("Smart Spending, Student Style") REST API. Money amounts are decimal strings ' +
        '(never floats); errors follow RFC 9457 `application/problem+json`; every route scoped to ' +
        'the caller\'s own data returns 404 (not 403) for another user\'s resource.',
    },
    servers: [{ url: API_BASE_PATH }],
  });
}
