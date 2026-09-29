/**
 * index.ts
 * Public entry point of @campuscoin/shared. Re-exports enums, constants, small helpers
 * (parsePort) and (later) Zod schemas + DTO types so both apps import from a single place.
 * Spec: docs/spec/03 §3.2 (shared Zod schemas between frontend and backend)
 */
export * from './enums.js';
export * from './constants.js';
export * from './ports.js';
export * from './schemas/auth.js';
export * from './schemas/common.js';
export * from './schemas/category.js';
export * from './schemas/transaction.js';
export * from './schemas/recurring.js';
export * from './schemas/budget.js';
export * from './schemas/notification.js';
export * from './schemas/dashboard.js';
export * from './schemas/announcement.js';
export * from './schemas/ai.js';
export * from './schemas/import.js';
export * from './schemas/report.js';
export * from './schemas/insight.js';
export * from './schemas/tips.js';
export * from './schemas/activity.js';
export * from './schemas/forecast.js';
export * from './schemas/bookmark.js';
export * from './schemas/tipTemplate.js';
export * from './schemas/adminUser.js';
export * from './schemas/adminStats.js';
export * from './schemas/adminAuditLog.js';
export * from './schemas/privacy.js';
