/**
 * ThemeProvider.tsx
 * Colour theme (light/dark/system) + font-size scale state. Applies both to
 * `<html data-bs-theme>` / `style.fontSize` (Bootstrap 5.3 colour-mode + spec §8.7's font-size
 * control), persists to `localStorage`, and – for a logged-in user – syncs the choice to
 * `PATCH /me` (debounced) so it follows them across devices.
 * Exports: ThemeProvider, useTheme, ThemeChoice, ResolvedTheme, FontScale
 * Spec: docs/spec/08 §8.2 (theme), §8.7 (accessibility font scale)
 */
import { Theme } from '@campuscoin/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '../apiClient/apiClient';
import { useAuth } from '../auth/AuthContext';

/** Theme preference as stored/chosen (`'system'` resolves via `prefers-color-scheme`). */
export type ThemeChoice = (typeof Theme)[keyof typeof Theme];
/** Theme actually applied to the DOM, after resolving `'system'`. */
export type ResolvedTheme = 'light' | 'dark';
/** One of the four supported text-size multipliers (90% / 100% / 115% / 130%). */
export type FontScale = 0.9 | 1 | 1.15 | 1.3;

const THEME_KEY = 'cc.theme';
const FONT_SCALE_KEY = 'cc.fontScale';
const PATCH_DEBOUNCE_MS = 800;
const VALID_FONT_SCALES: readonly FontScale[] = [0.9, 1, 1.15, 1.3];

/** Value exposed by {@link useTheme}. */
export interface ThemeContextValue {
  theme: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeChoice) => void;
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/** Reads the stored theme choice; falls back to `'system'` when unset/unavailable/invalid. */
function readStoredTheme(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === Theme.LIGHT || stored === Theme.DARK || stored === Theme.SYSTEM) return stored;
  } catch {
    // localStorage unavailable (private mode, disabled storage) – fall back to the default.
  }
  return Theme.SYSTEM;
}

/** Reads the stored font scale; falls back to `1` (100%) when unset/unavailable/invalid. */
function readStoredFontScale(): FontScale {
  try {
    const stored = window.localStorage.getItem(FONT_SCALE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (VALID_FONT_SCALES.includes(parsed as FontScale)) return parsed as FontScale;
  } catch {
    // ignore
  }
  return 1;
}

/** Reads the OS/browser's current colour-scheme preference. */
function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Provides theme + font-scale state to the app; must be nested inside `AuthProvider`. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeChoice>(readStoredTheme);
  const [fontScale, setFontScaleState] = useState<FontScale>(readStoredFontScale);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  const resolvedTheme: ResolvedTheme = theme === Theme.SYSTEM ? (systemDark ? 'dark' : 'light') : theme;

  // Track prefers-color-scheme changes live (only matters while theme === 'system').
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Apply resolved theme + font scale to the document root.
  useEffect(() => {
    document.documentElement.dataset.bsTheme = resolvedTheme;
  }, [resolvedTheme]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
  }, [fontScale]);

  // Persist locally so the choice survives a refresh even before a session is bootstrapped.
  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);
  useEffect(() => {
    try {
      window.localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
    } catch {
      // ignore
    }
  }, [fontScale]);

  // Sync from the server once per login – applying the user's saved preference must NOT itself
  // trigger the PATCH-back below (that would just echo the value the server already has).
  const skipNextPatchRef = useRef(false);
  const lastSyncedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || lastSyncedUserIdRef.current === user.id) return;
    lastSyncedUserIdRef.current = user.id;
    const prefs = user.preferences;
    // Genuine external-system sync (the user object arrives asynchronously after login), not a
    // derived-during-render value, so an effect is the right tool despite the general
    // "avoid setState-in-effect" guidance.
    if (prefs?.theme) {
      skipNextPatchRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(prefs.theme);
    }
    if (prefs?.fontScale && VALID_FONT_SCALES.includes(prefs.fontScale as FontScale)) {
      skipNextPatchRef.current = true;
      setFontScaleState(prefs.fontScale as FontScale);
    }
  }, [user]);

  // Debounced PATCH /me – only for changes the signed-in user actually made.
  const isFirstRunRef = useRef(true);
  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    if (skipNextPatchRef.current) {
      skipNextPatchRef.current = false;
      return;
    }
    if (!user) return;
    const handle = window.setTimeout(() => {
      apiClient.patch('/me', { preferences: { theme, fontScale } }).catch(() => {
        // Best-effort sync; a failed PATCH must never block the UI.
      });
    }, PATCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // `user` intentionally excluded: this effect only reacts to the user's own theme/font edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, fontScale]);

  const setTheme = useCallback((next: ThemeChoice) => setThemeState(next), []);
  const setFontScale = useCallback((next: FontScale) => setFontScaleState(next), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, fontScale, setFontScale }),
    [theme, resolvedTheme, setTheme, fontScale, setFontScale],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Reads theme/font-scale state; throws if used outside {@link ThemeProvider}. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
