/**
 * transport.test.ts
 * Unit tests for the SMTP transport's TLS enforcement (C-M3): outside dev/test, `nodemailer` must
 * be configured with `requireTLS`/`secure` + a TLS floor so a network attacker can't strip
 * STARTTLS and read SMTP_PASS / password-reset / verify-email links / shared-report bodies in
 * cleartext. `nodemailer.createTransport` is spied; `config/env.ts` is mocked with a plain object
 * (not the real Zod-validated Proxy) so the dev/test branch can be flipped without real secrets.
 * Each test loads a fresh module instance (`vi.resetModules`) because the transporter is cached
 * at module scope after the first `sendMail` call.
 * Spec: docs/security/review-p19.md C-M3
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const createTransportMock = vi.fn().mockReturnValue({ sendMail: vi.fn().mockResolvedValue(undefined) });
vi.mock('nodemailer', () => ({ default: { createTransport: createTransportMock } }));

/** Minimal shape of `config` that `transport.ts` actually reads. */
interface MailConfigFixture {
  mail: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; mailFrom: string };
  app: { isDev: boolean; isTest: boolean };
}

/** Loads a fresh `transport.ts` with `config/env.js` mocked to `fixture`, sends one mail, and returns the options object nodemailer.createTransport was called with. */
async function createTransportOptionsFor(fixture: MailConfigFixture): Promise<Record<string, unknown>> {
  vi.resetModules();
  createTransportMock.mockClear();
  vi.doMock('../../../src/config/env.js', () => ({ config: fixture }));
  const { sendMail } = await import('../../../src/integrations/mailer/transport.js');
  await sendMail({ to: 'student@example.com', subject: 'Subject', html: '<p>hi</p>', text: 'hi' });
  return createTransportMock.mock.calls[0]![0] as Record<string, unknown>;
}

describe('mailer transport TLS enforcement (C-M3)', () => {
  afterEach(() => {
    vi.doUnmock('../../../src/config/env.js');
  });

  it('requires STARTTLS on port 587 outside dev/test', async () => {
    const opts = await createTransportOptionsFor({
      mail: { smtpHost: 'smtp.example.com', smtpPort: 587, smtpUser: 'u', smtpPass: 'p', mailFrom: 'CampusCoin <noreply@campuscoin.app>' },
      app: { isDev: false, isTest: false },
    });
    expect(opts.secure).toBe(false);
    expect(opts.requireTLS).toBe(true);
    expect((opts.tls as { minVersion: string }).minVersion).toBe('TLSv1.2');
  });

  it('uses implicit TLS (secure) on port 465 outside dev/test, without also requiring STARTTLS', async () => {
    const opts = await createTransportOptionsFor({
      mail: { smtpHost: 'smtp.example.com', smtpPort: 465, smtpUser: 'u', smtpPass: 'p', mailFrom: 'CampusCoin <noreply@campuscoin.app>' },
      app: { isDev: false, isTest: false },
    });
    expect(opts.secure).toBe(true);
    expect(opts.requireTLS).toBe(false);
    expect((opts.tls as { minVersion: string }).minVersion).toBe('TLSv1.2');
  });

  it('keeps the permissive Mailpit-friendly default in dev (no forced TLS)', async () => {
    const opts = await createTransportOptionsFor({
      mail: { smtpHost: 'localhost', smtpPort: 1025, smtpUser: '', smtpPass: '', mailFrom: 'CampusCoin Dev <dev@campuscoin.local>' },
      app: { isDev: true, isTest: false },
    });
    expect(opts.secure).toBe(false);
    expect(opts.requireTLS).toBe(false);
    expect(opts.tls).toBeUndefined();
  });

  it('keeps the permissive Mailpit-friendly default in test (no forced TLS)', async () => {
    const opts = await createTransportOptionsFor({
      mail: { smtpHost: 'localhost', smtpPort: 1025, smtpUser: '', smtpPass: '', mailFrom: 'CampusCoin Test <test@campuscoin.local>' },
      app: { isDev: false, isTest: true },
    });
    expect(opts.secure).toBe(false);
    expect(opts.requireTLS).toBe(false);
    expect(opts.tls).toBeUndefined();
  });
});
