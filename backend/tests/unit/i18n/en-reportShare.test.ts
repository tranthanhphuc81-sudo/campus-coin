/**
 * en-reportShare.test.ts
 * Unit test for `emailTemplates.reportShare` (backend/src/i18n/en.ts): defense-in-depth
 * control-character stripping (C-L4) on `senderName`/`message` before they're interpolated into
 * the plaintext/HTML email body, on top of the input-schema rejection in shared/src/schemas.
 * Spec: docs/security/review-p19.md C-L4/B-L7
 */
import { describe, expect, it } from 'vitest';
import { emailTemplates } from '../../../src/i18n/en.js';

describe('emailTemplates.reportShare', () => {
  it('strips control characters from senderName and message before building the email', () => {
    const clean = emailTemplates.reportShare('Jane Doe', 'September 2026', 'Hope this helps!');
    const withControlChars = emailTemplates.reportShare('Jane\r\nDoe', 'September 2026', 'Hi\r\nFake-Header: injected');

    // The subject is never joined with '\n', so an unstripped CR/LF would show up directly.
    expect(withControlChars.subject).not.toMatch(/[\r\n]/);
    expect(withControlChars.subject).toBe('JaneDoe shared a CampusCoin report with you – September 2026');

    // `text`/`html` are legitimately joined with '\n' between paragraphs (same line count as the
    // clean case) — an unstripped CR/LF inside a paragraph would add extra lines on top of that.
    expect(withControlChars.text.split('\n')).toHaveLength(clean.text.split('\n').length);
    expect(withControlChars.text).toContain('JaneDoe shared their CampusCoin monthly spending report');
    expect(withControlChars.text).toContain('Message from JaneDoe: "HiFake-Header: injected"');
  });

  it('renders a clean sender/message unchanged', () => {
    const result = emailTemplates.reportShare('Jane Doe', 'September 2026', 'Hope this helps!');
    expect(result.subject).toBe('Jane Doe shared a CampusCoin report with you – September 2026');
    expect(result.text).toContain('Message from Jane Doe: "Hope this helps!"');
  });
});
