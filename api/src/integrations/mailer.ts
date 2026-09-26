import nodemailer, { type Transporter } from "nodemailer";

import { config } from "../config/env.js";

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

let transporter: Transporter | null = null;

function createTransporter(): Transporter {
  if (config.SMTP_HOST && config.SMTP_PORT) {
    return nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
          : undefined,
    });
  }

  if (config.NODE_ENV === "production") {
    throw new Error("SMTP is not configured. Set SMTP_HOST and SMTP_PORT.");
  }

  // Dev/test fallback: captures the message in memory instead of a real network call.
  return nodemailer.createTransport({ jsonTransport: true });
}

function getTransporter(): Transporter {
  transporter ??= createTransporter();
  return transporter;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Sends an email, retrying up to 3 times (design doc 10.x graceful degradation for SMTP). */
export async function sendMail(input: SendMailInput): Promise<void> {
  const transport = getTransporter();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await transport.sendMail({
        from: config.MAIL_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await delay(attempt * RETRY_DELAY_MS);
      }
    }
  }

  process.stderr.write(
    `[mailer] Failed to send email to ${input.to} after ${MAX_ATTEMPTS} attempts: ${String(lastError)}\n`,
  );
  throw lastError instanceof Error ? lastError : new Error("Failed to send email.");
}
