/**
 * OfflineBanner.tsx
 * Fixed banner shown while the browser reports it is offline (`window` `online`/`offline`
 * events). No dismiss action – it disappears automatically once connectivity returns.
 * Exports: OfflineBanner
 * Spec: docs/spec/08 §8.6 (offline state)
 */
import { useEffect, useState } from 'react';
import { en } from '../i18n/en';

/** Banner announcing the browser is offline; renders nothing while online. */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="bg-warning-subtle text-center py-1 small" role="status">
      <i className="bi bi-wifi-off me-1" aria-hidden="true" />
      {en.layout.offline}
    </div>
  );
}
