/**
 * SkipToContent.tsx
 * Visually-hidden-until-focused link letting keyboard users jump straight to `#main-content`,
 * skipping repeated nav/header markup (spec §8.7 accessibility).
 * Exports: SkipToContent
 * Spec: docs/spec/08 §8.7 (accessibility)
 */
import { en } from '../i18n/en';

/** Keyboard-only "skip to main content" link; every layout renders one before its nav. */
export function SkipToContent() {
  return (
    <a href="#main-content" className="visually-hidden-focusable">
      {en.layout.skipToContent}
    </a>
  );
}
