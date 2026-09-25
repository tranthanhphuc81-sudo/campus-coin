import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import api from "@/lib/api";

export type ThemeMode = "light" | "dark";
export type FontScale = "90" | "100" | "115" | "130";

type ThemeState = {
  theme: ThemeMode;
  fontScale: FontScale;
  isDark: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setFontScale: (scale: FontScale) => void;
};

const STORAGE_THEME_KEY = "campus-coin-theme";
const STORAGE_FONT_SCALE_KEY = "campus-coin-font-scale";
const DEFAULT_FONT_SCALE: FontScale = "100";
const FONT_SCALE_TO_SIZE: Record<FontScale, string> = {
  "90": "90%",
  "100": "100%",
  "115": "115%",
  "130": "130%",
};

const ThemeContext = createContext<ThemeState | undefined>(undefined);

function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function parseTheme(value: string | null): ThemeMode | null {
  if (value === "light" || value === "dark") {
    return value;
  }

  return null;
}

function parseScale(value: string | null): FontScale | null {
  if (value === "90" || value === "100" || value === "115" || value === "130") {
    return value;
  }

  return null;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    const stored = parseTheme(window.localStorage.getItem(STORAGE_THEME_KEY));
    return stored ?? getSystemTheme();
  });

  const [fontScale, setFontScaleState] = useState<FontScale>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_FONT_SCALE;
    }

    return parseScale(window.localStorage.getItem(STORAGE_FONT_SCALE_KEY)) ?? DEFAULT_FONT_SCALE;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
    document.documentElement.style.fontSize = FONT_SCALE_TO_SIZE[fontScale];
  }, [fontScale, theme]);

  const syncPreferences = useCallback((nextTheme: ThemeMode, nextFontScale: FontScale) => {
    window.localStorage.setItem(STORAGE_THEME_KEY, nextTheme);
    window.localStorage.setItem(STORAGE_FONT_SCALE_KEY, nextFontScale);

    void api
      .patch("/me", {
        preferences: {
          theme: nextTheme,
          fontScale: Number(nextFontScale),
        },
      })
      .catch(() => {
        // Best effort sync: keep local preference even when backend profile is not ready.
      });
  }, []);

  const setTheme = useCallback(
    (nextTheme: ThemeMode) => {
      setThemeState(nextTheme);
      syncPreferences(nextTheme, fontScale);
    },
    [fontScale, syncPreferences],
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const setFontScale = useCallback(
    (nextScale: FontScale) => {
      setFontScaleState(nextScale);
      syncPreferences(theme, nextScale);
    },
    [syncPreferences, theme],
  );

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      fontScale,
      isDark: theme === "dark",
      setTheme,
      toggleTheme,
      setFontScale,
    }),
    [fontScale, setFontScale, setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return context;
}
