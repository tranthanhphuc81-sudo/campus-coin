/**
 * usePrefersReducedMotion.ts
 * Small hook mirroring the `prefers-reduced-motion: reduce` media query, so components can
 * skip non-essential animation (paired with the CSS override in `styles/_tokens.scss`).
 * Exports: usePrefersReducedMotion
 * Spec: docs/spec/08 §8.7 (accessibility)
 */
import { useEffect, useState } from 'react';

/** True while the user's OS/browser requests reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return reduced;
}
