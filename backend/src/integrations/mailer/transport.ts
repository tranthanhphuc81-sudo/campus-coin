/**
 * transport.ts
 * nodemailer SMTP transport (Mailpit in dev, real SMTP relay in prod). Bounded timeouts so a
 * slow/unreachable SMTP server fails fast instead of hanging a worker job — retries are handled
 * by BullMQ, not by this module. Only the `email.send` processor (jobs/processors) may call
 * `sendMail`; every other module sends mail through the queue (`queueEmail`), never directly.
 * C-M3: outside dev/test, the transport requires TLS (STARTTLS on 587, implicit TLS on 465) with
 * a TLSv1.2 floor — without this, nodemailer only opportunistically upgrades via STARTTLS, so a
 * network attacker (or a misconfigured relay) can strip it and read SMTP_PASS plus every
 * plaintext password-reset/verify-email link and shared-report body in cleartext. Mailpit (dev/
 * test) has no TLS support, so that branch keeps the original permissive behaviour unchanged.
 * Main exports: sendMail, SendMailInput, MailAttachment
 * Spec: docs/spec/04 §4.2 (integrations have timeout + fallback) · docs/spec/10 §10.5 ·
 *   docs/spec/05b §5.8 (P12: monthly report PDF attached to the share email) ·
 *   docs/security/review-p19.md C-M3
 */
import type { SecureVersion } from 'node:tls';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../config/env.js';

const CONNECTION_TIMEOUT_MS = 5000;
const GREETING_TIMEOUT_MS = 5000;
const SOCKET_TIMEOUT_MS = 10_000;
/** Implicit-TLS SMTP port (as opposed to 587/25, which upgrade via STARTTLS). */
const SMTPS_PORT = 465;
/** Floor enforced outside dev/test (C-M3) — TLS 1.0/1.1 are deprecated/broken. */
const TLS_MIN_VERSION: SecureVersion = 'TLSv1.2';

/** A file attached to an outbound email. Content is base64 so it survives BullMQ's JSON job data untouched. */
export interface MailAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  // C-M3: never force TLS in dev/test — Mailpit doesn't speak TLS at all, and requiring it would
  // just break local dev/the test suite. Everywhere else, require it.
  const enforceTls = !config.app.isDev && !config.app.isTest;
  const secure = enforceTls && config.mail.smtpPort === SMTPS_PORT;
  transporter ??= nodemailer.createTransport({
    host: config.mail.smtpHost,
    port: config.mail.smtpPort,
    secure,
    // requireTLS forces the STARTTLS upgrade on a non-465 port; redundant (and left false) once
    // `secure` already means the whole connection started as TLS.
    requireTLS: enforceTls && !secure,
    tls: enforceTls ? { minVersion: TLS_MIN_VERSION } : undefined,
    // Mailpit (dev) accepts unauthenticated connections; auth is only sent when credentials exist.
    auth: config.mail.smtpUser ? { user: config.mail.smtpUser, pass: config.mail.smtpPass } : undefined,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
  return transporter;
}

/** Sends one email via SMTP. Called only from the `email.send` worker processor. */
export async function sendMail(input: SendMailInput): Promise<void> {
  const { attachments, ...mail } = input;
  await getTransporter().sendMail({
    from: config.mail.mailFrom,
    ...mail,
    attachments: attachments?.map((a) => ({ filename: a.filename, content: a.contentBase64, encoding: 'base64', contentType: a.contentType })),
  });
}
