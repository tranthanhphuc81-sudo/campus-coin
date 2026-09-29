/**
 * chartColors.ts
 * Reads CampusCoin's dark-mode-aware CSS custom properties (`_tokens.scss`) at render time, so
 * Chart.js colours (which cannot use CSS variables directly in every browser/canvas combination
 * the way DOM elements can) stay correct in both light and dark theme.
 * Exports: cssVar, CATEGORY_FALLBACK_PALETTE
 * Spec: docs/spec/08 §8.2 (design tokens) · docs/spec/10 §10.2 (chart dark-mode colours)
 */

/** Reads a CSS custom property's current computed value off `<html>`, or `fallback` if unset/SSR. */
export function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Palette used for categories with no `color` of their own (cycled by index). */
export const CATEGORY_FALLBACK_PALETTE = ['#1f4e79', '#f5b400', '#1e8e3e', '#c62828', '#5b6b7f', '#6ea8fe', '#b26a00', '#9fb0c3'];
