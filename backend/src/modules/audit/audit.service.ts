/**
 * audit.service.ts
 * Immutable audit trail (docs/spec/09 §9.12 Table 58): every sensitive action calls `record(...)`.
 * The client IP is never stored in the clear — only its HMAC-SHA256 (keyed by IP_HASH_SECRET),
 * so the log is useless for tracking but still lets an investigation correlate events from the
 * same address. `actorId` is nullable for system/scheduler-triggered actions (no FK by design,
 * see PROGRESS.md P02 decisions — a deleted user's audit trail must survive the delete).
 * Main exports: record, hashIp, AuditAction
 * Spec: docs/spec/09 §9.12 (Table 58) · §9.8 (IP minimisation)
 */
import { createHmac } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { config } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { truncate } from '../../lib/strings.js';
import type { AuditActionCode } from './audit.actions.js';

/** Max lengths of the audit-log columns a caller could overflow (security review: a very long
 * User-Agent/action/entityId must be clamped, never silently corrupt/evade the log). */
const USER_AGENT_MAX_LENGTH = 255;
const ENTITY_ID_MAX_LENGTH = 64;
const ACTION_MAX_LENGTH = 80;

export interface AuditAction {
  /** Dotted action code, e.g. "auth.login.failed", "admin.user.disable" (Table 58). */
  action: AuditActionCode;
  /** Acting user id, or omitted for system/scheduler-triggered actions. */
  actorId?: string;
  actorRole?: string;
  entityType?: string;
  entityId?: string;
  /** Raw client IP (from `req.ip`); hashed before storage, never persisted in the clear. */
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/** HMAC-SHA256(IP) with IP_HASH_SECRET, hex-encoded — never reversible back to the raw IP. */
export function hashIp(ip: string): string {
  return createHmac('sha256', config.auth.ipHashSecret).update(ip).digest('hex');
}

/**
 * Appends one immutable audit record. Never rejects: a failed audit write is logged here and
 * must not block (or fail) the action it is recording.
 */
export async function record(input: AuditAction): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: truncate(input.action, ACTION_MAX_LENGTH) as string,
        entityType: input.entityType,
        entityId: truncate(input.entityId, ENTITY_ID_MAX_LENGTH),
        ipHash: input.ip ? hashIp(input.ip) : undefined,
        userAgent: truncate(input.userAgent, USER_AGENT_MAX_LENGTH),
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, '[audit] failed to write audit log');
  }
}
