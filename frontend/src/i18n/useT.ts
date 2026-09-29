/**
 * useT.ts
 * Thin i18n accessor hook. Only English exists today, but call sites use `useT()` instead of
 * importing `en` directly so a second locale can be added later without touching every
 * component (CLAUDE.md golden rule 1).
 * Exports: useT
 */
import { en, type Messages } from './en';

/** Returns the active locale's message bundle (English only for now). */
export function useT(): Messages {
  return en;
}
