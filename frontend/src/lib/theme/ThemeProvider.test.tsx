/**
 * ThemeProvider.test.tsx
 * Verifies: defaults to the OS/browser colour-scheme preference when `theme === 'system'`,
 * and that `setTheme`/`setFontScale` update `document.documentElement` attributes and persist
 * to `localStorage`. `useAuth` is mocked so this test never touches the network.
 */
import { Theme } from '@campuscoin/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as AuthContextModule from '../auth/AuthContext';
import { ThemeProvider, useTheme } from './ThemeProvider';

vi.mock('../apiClient/apiClient', () => ({
  apiClient: { patch: vi.fn().mockResolvedValue({}) },
}));

/** Makes `window.matchMedia('(prefers-color-scheme: dark)')` resolve to `prefersDark`. */
function stubMatchMedia(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark') ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** Exposes theme state + setters as clickable controls for assertions. */
function ThemeConsumer() {
  const { theme, resolvedTheme, fontScale, setTheme, setFontScale } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <span data-testid="scale">{fontScale}</span>
      <button type="button" onClick={() => setTheme(Theme.DARK)}>
        set-dark
      </button>
      <button type="button" onClick={() => setFontScale(1.3)}>
        set-large
      </button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-bs-theme');
    document.documentElement.style.fontSize = '';
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isBootstrapping: false,
      login: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });
  });

  it('defaults to the system colour-scheme preference', () => {
    stubMatchMedia(true);

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent(Theme.SYSTEM);
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.dataset.bsTheme).toBe('dark');
  });

  it('setTheme updates document.documentElement and persists to localStorage', () => {
    stubMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-dark' }));

    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.dataset.bsTheme).toBe('dark');
    expect(window.localStorage.getItem('cc.theme')).toBe(Theme.DARK);
  });

  it('setFontScale updates document.documentElement and persists to localStorage', () => {
    stubMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-large' }));

    expect(screen.getByTestId('scale')).toHaveTextContent('1.3');
    expect(document.documentElement.style.fontSize).toBe('130%');
    expect(window.localStorage.getItem('cc.fontScale')).toBe('1.3');
  });
});
