/**
 * privacy.controller.ts
 * HTTP <-> DTO glue for `GET /me/export` and `DELETE /me` (docs/spec/09 §9.14). All business logic
 * lives in `privacy.service.ts`.
 * Main exports: getExport, deleteMe
 * Spec: docs/spec/09 §9.14 · docs/spec/07 §7.3.1 (users/me)
 */
import type { DeleteAccountInput, ExportQueryInput } from '@campuscoin/shared';
import type { Request, RequestHandler } from 'express';
import { clearRefreshCookie } from '../../lib/cookies.js';
import { streamCsvZip } from './privacy.export.js';
import * as privacyService from './privacy.service.js';

/** Builds the request context (IP/User-Agent) shared by the service calls below. */
function contextFrom(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.header('user-agent') };
}

/** `today` as `YYYY-MM-DD`, used in the export filename. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * `GET /me/export?format=json|csv` — `format=json` returns the full data export inline;
 * `format=csv` returns a ZIP containing a single `transactions.csv` entry.
 */
export const getExport: RequestHandler = async (req, res) => {
  const { format } = req.validated?.query as ExportQueryInput;
  const result = await privacyService.exportData(req.auth!.userId, format, contextFrom(req));
  const stamp = todayStamp();

  if (result.format === 'csv') {
    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="campuscoin-export-${stamp}.zip"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    await streamCsvZip(res, result.csv);
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="campuscoin-export-${stamp}.json"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(JSON.stringify(result.document));
};

/**
 * `DELETE /me` — requests self-deletion: disables the account immediately, schedules a permanent
 * purge after the grace period, and clears the caller's own refresh cookie (same helper `logout` uses).
 */
export const deleteMe: RequestHandler = async (req, res) => {
  const body = req.validated?.body as DeleteAccountInput;
  const { scheduledPurgeAt } = await privacyService.requestAccountDeletion(req.auth!.userId, body.password, contextFrom(req));
  clearRefreshCookie(res);
  res.status(202).json({ scheduledPurgeAt: scheduledPurgeAt.toISOString() });
};
