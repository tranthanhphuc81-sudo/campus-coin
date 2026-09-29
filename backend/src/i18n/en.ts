/**
 * en.ts (backend)
 * English strings for outbound email and PDF text (CLAUDE.md golden rule 1: UI language is
 * English). Each template returns both an HTML and a plain-text body — never HTML-only, so
 * clients that block HTML still get a readable message. Feature phases (P04 verify/reset
 * password, P12 report sharing, …) add their own template functions here; `layout` is the
 * shared wrapper so every email looks the same.
 * Main exports: EmailContent, layout, emailTemplates (test, verifyEmail, accountExists,
 *   accountLocked, resetPassword, passwordChanged, finishSignUp, reportShare,
 *   accountDeletionRequested), notifications (anomaly, duplicate — P14 §5.14 in-app alert copy)
 * Spec: docs/spec/09 §9.10 (no HTML from untrusted sources) · CLAUDE.md golden rule 1 (English) ·
 *   docs/security/review-p19.md C-L4 (reportShare control-char stripping)
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const HTML_ESCAPES = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

/** Escapes text for safe interpolation into the HTML email body. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES.get(ch) ?? ch);
}

/**
 * Strips ASCII control characters (C-L4 defense-in-depth). The input schemas
 * (`shared/src/schemas/auth.ts` fullName, `report.ts` share message) already reject these, but a
 * template-level guard also protects rows written before that fix and any future caller of
 * `reportShare` that forgets to validate first — without it, an embedded CR/LF/NUL can fake a
 * paragraph break in the plaintext part of an email sent from CampusCoin's own trusted domain.
 */
function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: this IS the control-char filter.
  return value.replace(/[\u0000-\u001F\u007F]/g, '');
}

/** Wraps a heading + paragraphs in the shared plain-HTML/plain-text email layout. */
function layout(heading: string, paragraphs: string[]): Pick<EmailContent, 'html' | 'text'> {
  const html = [
    `<h1 style="font-family:sans-serif;font-size:20px;">${escapeHtml(heading)}</h1>`,
    ...paragraphs.map((p) => `<p style="font-family:sans-serif;font-size:14px;">${escapeHtml(p)}</p>`),
    '<p style="font-family:sans-serif;font-size:12px;color:#666;">CampusCoin – Smart Spending, Student Style</p>',
  ].join('\n');
  const text = [heading, '', ...paragraphs, '', 'CampusCoin – Smart Spending, Student Style'].join('\n');
  return { html, text };
}

/** English email templates, keyed by purpose. */
export const emailTemplates = {
  /** Used to prove the mailer pipeline works end to end (integrations/mailer, tests). */
  test(): EmailContent {
    return { subject: 'CampusCoin test email', ...layout('Test email', ['This is a test email from CampusCoin.']) };
  },

  /** Sent on registration (and resend) with the email-verification link (BR-AU-01, P04). */
  verifyEmail(name: string, link: string): EmailContent {
    return {
      subject: 'Verify your CampusCoin email address',
      ...layout(`Welcome, ${name}!`, [
        'Thanks for signing up for CampusCoin. Please verify your email address to activate your account.',
        `Verify your email: ${link}`,
        'This link expires in 24 hours. If you did not create this account, you can ignore this email.',
      ]),
    };
  },

  /** Sent when someone tries to register with an email that already has an account (BR-AU-03). */
  accountExists(name: string, loginLink: string, resetLink: string): EmailContent {
    return {
      subject: 'Someone tried to sign up with your email',
      ...layout(`Hi ${name},`, [
        'Someone just tried to create a CampusCoin account using your email address, but you already have one.',
        `If this was you, sign in here: ${loginLink}`,
        `Forgot your password? Reset it here: ${resetLink}`,
        'If this was not you, no action is needed — your account is safe.',
      ]),
    };
  },

  /** Sent when repeated failed logins lock the account (BR-AU-04). */
  accountLocked(name: string, minutes: number, resetLink: string): EmailContent {
    return {
      subject: 'Your CampusCoin account was temporarily locked',
      ...layout(`Hi ${name},`, [
        `We locked your account for ${minutes} minutes after several failed sign-in attempts.`,
        `If this was not you, reset your password now: ${resetLink}`,
        'If this was you, just wait and try again after the lock expires.',
      ]),
    };
  },

  /** Sent when a password-reset link is requested for an active account (BR-AU-03). */
  resetPassword(name: string, link: string, minutes: number): EmailContent {
    return {
      subject: 'Reset your CampusCoin password',
      ...layout(`Hi ${name},`, [
        'We received a request to reset your CampusCoin password.',
        `Reset your password: ${link}`,
        `This link expires in ${minutes} minutes. If you did not request this, you can ignore this email.`,
      ]),
    };
  },

  /**
   * Sent when `/auth/register` targets an email that already has a still-pending (unverified)
   * account (security review B): never changes the pending row's credentials — this link lets
   * whoever actually owns the inbox choose the account's real password and activate it.
   */
  finishSignUp(name: string, link: string): EmailContent {
    return {
      subject: 'Finish creating your CampusCoin account',
      ...layout(`Hi ${name},`, [
        'Someone (hopefully you) tried to sign up again with this email.',
        `Choose your password to finish creating your account: ${link}`,
        'If this was not you, no action is needed — no account has been created or changed yet.',
      ]),
    };
  },

  /** Sent after a password change/reset completes (BR-AU-06). */
  passwordChanged(name: string, resetLink: string): EmailContent {
    return {
      subject: 'Your CampusCoin password was changed',
      ...layout(`Hi ${name},`, [
        'Your CampusCoin password was just changed.',
        `If this wasn't you, reset your password now: ${resetLink}`,
      ]),
    };
  },

  /**
   * Sent by `POST /reports/monthly/share` (P12) with the monthly PDF attached. The recipient is
   * an arbitrary email the sender typed in — never assumed to have a CampusCoin account of their
   * own — so the greeting names the sender, not the recipient. Never includes a public link to
   * the sender's data (docs/spec/05b §5.8): the PDF attachment is the only thing shared.
   */
  reportShare(senderName: string, monthLabel: string, message?: string): EmailContent {
    const safeName = stripControlChars(senderName);
    const safeMessage = message ? stripControlChars(message) : undefined;
    const paragraphs = [
      `${safeName} shared their CampusCoin monthly spending report for ${monthLabel} with you.`,
      'The report is attached to this email as a PDF.',
    ];
    if (safeMessage) paragraphs.push(`Message from ${safeName}: "${safeMessage}"`);
    paragraphs.push('This report is for personal reference only and is not financial advice.');
    return {
      subject: `${safeName} shared a CampusCoin report with you – ${monthLabel}`,
      ...layout('A CampusCoin report was shared with you', paragraphs),
    };
  },

  /**
   * Sent by `DELETE /me` (P16, docs/spec/09 §9.14): the account is disabled immediately; it is
   * permanently deleted after the 30-day grace period unless the user contacts support to cancel.
   * @param name - The account holder's full name.
   * @param purgeDateLabel - Human-readable purge date, e.g. "October 28, 2026".
   * @param supportEmail - Contact address (config.mail.supportEmail) the user can reply to/reach out to.
   */
  accountDeletionRequested(name: string, purgeDateLabel: string, supportEmail: string): EmailContent {
    return {
      subject: 'Your CampusCoin account will be deleted',
      ...layout(`Hi ${name},`, [
        'We received a request to delete your CampusCoin account. Your account has been disabled immediately and you have been signed out of every device.',
        `Your account and all of its data will be permanently deleted on ${purgeDateLabel}.`,
        `If you did not request this, or you change your mind, contact us at ${supportEmail} before that date and we will cancel the deletion.`,
      ]),
    };
  },
};

/**
 * English copy for in-app notifications raised by the anomaly/duplicate detector (P14 §5.14,
 * `modules/transactions/transactions.flags.ts`). Kept in one place, same reasoning as
 * `emailTemplates` above, so a second locale only ever needs to change this file.
 */
export const notifications = {
  anomaly: {
    title: 'Unusually large expense – is this correct?',
    /** @param amount - Decimal string, e.g. "500.00". @param categoryName - The transaction's category. @param txnDate - Local date `YYYY-MM-DD`. */
    body: (amount: string, categoryName: string, txnDate: string): string =>
      `A ${categoryName} expense of ${amount} on ${txnDate} is much larger than usual for this category. Please check it.`,
  },
  duplicate: {
    title: 'Possible duplicate transaction',
    /** @param amount - Decimal string, e.g. "12.50". @param txnDate - Local date `YYYY-MM-DD`. */
    body: (amount: string, txnDate: string): string =>
      `Another transaction for ${amount} on ${txnDate} looks similar to one you just added. Please check it isn't a duplicate.`,
  },
};
