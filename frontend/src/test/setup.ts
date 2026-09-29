/**
 * setup.ts
 * Global Vitest setup for React Testing Library: adds jest-dom matchers
 * (toBeInTheDocument, …), unmounts rendered trees after each test, and stubs
 * `window.matchMedia` (jsdom has no real implementation) so `ThemeProvider` and
 * `usePrefersReducedMotion` can be exercised without a real browser.
 * Spec: docs/spec/12 (testing plan)
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined' && !window.matchMedia) {
  // Minimal stub: `matches` defaults to false; tests override with `vi.stubGlobal` or by
  // reassigning `window.matchMedia` when they need a specific media query result.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
