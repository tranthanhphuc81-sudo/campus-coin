/**
 * TawkWidget.test.tsx
 * Verifies: no script is injected when `VITE_TAWK_PROPERTY_ID` is unset, the embed script is
 * injected exactly once when configured and the page has finished loading, it is never injected
 * while the current route is under `/admin`, and — the security-hardening case — navigating (via
 * SPA routing) from a public route where the script is already live into an admin route forces a
 * full page reload instead of merely hiding the widget. Also covers C-H1/C-M1
 * (docs/security/review-p19.md): the widget must never inject on `/reset-password`,
 * `/verify-email`, `/login`, `/register`, or `/admin/login` (query string included, since the
 * live secret token sits there), while it still loads normally on allowed public routes.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Number of `<script src="https://embed.tawk.to/...">` tags currently in the document. */
function countTawkScripts(): number {
  return document.querySelectorAll('script[src*="embed.tawk.to"]').length;
}

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom reports `readyState: 'complete'` once the test environment has finished loading, so the
  // widget's "inject after load" branch runs synchronously inside the effect.
  Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('TawkWidget', () => {
  it('renders nothing and injects no script when VITE_TAWK_PROPERTY_ID is unset', async () => {
    vi.stubEnv('VITE_TAWK_PROPERTY_ID', '');
    const { TawkWidget } = await import('./TawkWidget');

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <TawkWidget />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(countTawkScripts()).toBe(0);
  });

  it('injects the embed script exactly once when configured and the page has loaded', async () => {
    vi.stubEnv('VITE_TAWK_PROPERTY_ID', 'abc123');
    vi.stubEnv('VITE_TAWK_WIDGET_ID', 'xyz789');
    const { TawkWidget } = await import('./TawkWidget');

    const first = render(
      <MemoryRouter initialEntries={['/']}>
        <TawkWidget />
      </MemoryRouter>,
    );
    expect(countTawkScripts()).toBe(1);
    const script = document.querySelector('script[src*="embed.tawk.to"]');
    expect(script?.getAttribute('src')).toBe('https://embed.tawk.to/abc123/xyz789');

    // Remounting (e.g. navigating between PublicLayout and StudentLayout) must never inject twice.
    first.unmount();
    render(
      <MemoryRouter initialEntries={['/']}>
        <TawkWidget />
      </MemoryRouter>,
    );
    expect(countTawkScripts()).toBe(1);
  });

  it('does not inject the script while the current route is under /admin', async () => {
    vi.stubEnv('VITE_TAWK_PROPERTY_ID', 'abc123');
    const { TawkWidget } = await import('./TawkWidget');

    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <TawkWidget />
      </MemoryRouter>,
    );

    expect(countTawkScripts()).toBe(0);
  });

  describe('denylisted auth routes (C-H1/C-M1)', () => {
    it.each([
      ['/reset-password?token=abc'],
      ['/verify-email?token=abc'],
      ['/login'],
      ['/register'],
      ['/forgot-password'],
      ['/admin/login'],
    ])('never injects the embed script on %s', async (path) => {
      vi.stubEnv('VITE_TAWK_PROPERTY_ID', 'abc123');
      const { TawkWidget } = await import('./TawkWidget');

      render(
        <MemoryRouter initialEntries={[path]}>
          <TawkWidget />
        </MemoryRouter>,
      );

      expect(countTawkScripts()).toBe(0);
    });

    it.each([['/'], ['/help']])('still injects the embed script on the allowed route %s (control case)', async (path) => {
      vi.stubEnv('VITE_TAWK_PROPERTY_ID', 'abc123');
      const { TawkWidget } = await import('./TawkWidget');

      render(
        <MemoryRouter initialEntries={[path]}>
          <TawkWidget />
        </MemoryRouter>,
      );

      expect(countTawkScripts()).toBe(1);
    });
  });

  it('forces a full page reload (not just hideWidget) when SPA-navigating into /admin with the script already live', async () => {
    vi.stubEnv('VITE_TAWK_PROPERTY_ID', 'abc123');
    const { TawkWidget } = await import('./TawkWidget');
    // jsdom's `window.location.assign` isn't a configurable own property, so `vi.spyOn` can't
    // replace it directly — swap the whole `location` object for one whose `assign` is a spy.
    const originalLocation = window.location;
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy },
    });
    const hideWidget = vi.fn();
    window.Tawk_API = { hideWidget, showWidget: vi.fn() };

    // Minimal harness: mounts <TawkWidget/> alongside a button that triggers an in-app (SPA)
    // navigation into the admin portal, exactly like clicking through the app would.
    function Harness() {
      const navigate = useNavigate();
      return (
        <>
          <TawkWidget />
          <button type="button" onClick={() => navigate('/admin/login')}>
            go to admin
          </button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <Harness />
      </MemoryRouter>,
    );
    // Sanity check: the script is live before the SPA navigation into /admin/login.
    expect(countTawkScripts()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'go to admin' }));

    // The full-reload mechanism fired instead of (or in addition to) hiding the widget in place —
    // this is the whole point: a compromised script must not be left resident in this JS context.
    expect(assignSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledWith('/admin/login');
    expect(hideWidget).not.toHaveBeenCalled();

    delete window.Tawk_API;
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });
});
