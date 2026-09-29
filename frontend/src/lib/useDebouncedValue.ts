/**
 * useDebouncedValue.ts
 * Generic debounce hook: returns `value` but only updates its own copy after `delayMs` of no
 * further changes. Used by the AI category-suggestion hook to avoid spamming the suggest
 * endpoint on every keystroke.
 * Exports: useDebouncedValue
 */
import { useEffect, useState } from 'react';

/**
 * Debounces `value`, re-emitting it only after `delayMs` milliseconds have passed without it
 * changing again. The first render returns `value` immediately (no artificial initial delay).
 * @param value the fast-changing value to debounce.
 * @param delayMs how long to wait, in milliseconds, after the last change before updating.
 * @returns the debounced value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
