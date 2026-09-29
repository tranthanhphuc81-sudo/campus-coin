/**
 * mailpit.ts
 * Shared Mailpit helpers used by every E2E spec that needs to read a real outbound email
 * (register verification, password reset, etc.) instead of typing a link a human never saw.
 * Deduplicates what used to be copy-pasted into `register-verify-login-onboarding.spec.ts` and
 * `transactions-categories.spec.ts`.
 * Main exports: waitForEmailBody, extractLink
 * Spec: docs/spec/12 (testing plan – E2E)
 */
import type { APIRequestContext } from '@playwright/test';

export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitMessageSummary {
  ID: string;
}
interface MailpitSearchResult {
  messages: MailpitMessageSummary[];
}
interface MailpitMessage {
  Text: string;
}

/** Polls Mailpit's search API until an email to `toEmail` arrives, then returns its plain-text body. */
export async function waitForEmailBody(request: APIRequestContext, toEmail: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const searchResponse = await request.get(`${MAILPIT_URL}/api/v1/search`, {
      params: { query: `to:${toEmail}` },
    });
    const result = (await searchResponse.json()) as MailpitSearchResult;
    if (result.messages.length > 0) {
      const message = result.messages[result.messages.length - 1] as MailpitMessageSummary;
      const messageResponse = await request.get(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
      const body = (await messageResponse.json()) as MailpitMessage;
      return body.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for an email to ${toEmail}`);
}

/**
 * Extracts the first absolute link containing `pathSegment` from a plain-text email body.
 * `pathSegment` is always one of this file's own literal call-site strings, never attacker
 * input, so the dynamic `RegExp` here can't be used for a ReDoS.
 */
export function extractLink(emailBody: string, pathSegment: string): string {
  // eslint-disable-next-line security/detect-non-literal-regexp
  const pattern = new RegExp(`(https?://\\S*${pathSegment}\\?token=[A-Za-z0-9_-]+)`);
  const match = pattern.exec(emailBody);
  if (!match) throw new Error(`No "${pathSegment}" link found in email body:\n${emailBody}`);
  return match[1] as string;
}
