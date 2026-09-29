/**
 * audit-actions.test.ts
 * Unit test asserting every example action code named in docs/spec/09 §9.12 (Table 58) is present
 * in {@link AUDIT_ACTIONS} — the single source of truth `audit.service.ts` types `record()`
 * against.
 * Spec: docs/spec/09 §9.12 (Table 58)
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '../../../src/modules/audit/audit.actions.js';

/** Every example action literally named in Table 58's five event-group rows. */
const TABLE_58_ACTIONS = [
  // Xác thực
  'auth.login.success',
  'auth.login.failed',
  'auth.locked',
  'auth.refresh.reuse_detected',
  'auth.password.reset',
  // Tài khoản
  'user.register',
  'user.email.verified',
  'user.export',
  'user.delete.requested',
  // Quản trị
  'admin.login',
  'admin.mfa.failed',
  'admin.user.disable',
  'admin.user.enable',
  'admin.category.create',
  'admin.category.update',
  'admin.category.archive',
  'admin.category.delete',
  'admin.template.create',
  'admin.template.update',
  'admin.template.delete',
  // Dữ liệu
  'import.committed',
  'transaction.bulk_delete',
  // Hệ thống
  'job.failed',
  'ai.provider.error',
  'backup.failed',
] as const;

describe('AUDIT_ACTIONS (Table 58 coverage)', () => {
  it('contains every action named in docs/spec/09 §9.12 Table 58', () => {
    for (const action of TABLE_58_ACTIONS) {
      expect(AUDIT_ACTIONS as readonly string[]).toContain(action);
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it('every action code fits the audit_logs.action column (VarChar(80))', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(action.length).toBeLessThanOrEqual(80);
    }
  });
});
