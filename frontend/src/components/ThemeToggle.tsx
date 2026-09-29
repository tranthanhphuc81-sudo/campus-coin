/**
 * ThemeToggle.tsx
 * Single button cycling light → dark → system → light, showing a distinct icon + text label
 * for the current choice (never colour alone, per spec §8.5/§8.7).
 * Exports: ThemeToggle
 * Spec: docs/spec/08 §8.2 (theme toggle)
 */
import { Theme } from '@campuscoin/shared';
import { en } from '../i18n/en';
import { useTheme, type ThemeChoice } from '../lib/theme/ThemeProvider';

const ORDER: ThemeChoice[] = [Theme.LIGHT, Theme.DARK, Theme.SYSTEM];

const ICON: Record<ThemeChoice, string> = {
  [Theme.LIGHT]: 'bi-sun-fill',
  [Theme.DARK]: 'bi-moon-stars-fill',
  [Theme.SYSTEM]: 'bi-circle-half',
};

const LABEL: Record<ThemeChoice, string> = {
  [Theme.LIGHT]: en.layout.themeLight,
  [Theme.DARK]: en.layout.themeDark,
  [Theme.SYSTEM]: en.layout.themeSystem,
};

/** Button that cycles the colour theme and announces the resulting state to assistive tech. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function handleClick() {
    const nextIndex = (ORDER.indexOf(theme) + 1) % ORDER.length;
    setTheme(ORDER[nextIndex] as ThemeChoice);
  }

  return (
    <button
      type="button"
      className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
      onClick={handleClick}
      aria-label={`${en.layout.toggleTheme}: ${LABEL[theme]}`}
    >
      <i className={`bi ${ICON[theme]}`} aria-hidden="true" />
      <span className="d-none d-md-inline">{LABEL[theme]}</span>
    </button>
  );
}
