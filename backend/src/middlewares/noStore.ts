/**
 * noStore.ts
 * Sets `Cache-Control: no-store` on every API response so a shared proxy/browser cache never
 * retains personal financial data. Mounted on the whole `/api/v1` prefix in app.ts.
 * Main exports: noStore
 * Spec: docs/spec/09 §9.11 (Table 57 – Cache-Control)
 */
import type { RequestHandler } from 'express';

/** Express middleware: adds `Cache-Control: no-store` to the response. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
