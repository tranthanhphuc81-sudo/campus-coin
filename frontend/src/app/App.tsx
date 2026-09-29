/**
 * App.tsx
 * Root component: mounts the full provider tree + router (`AppProviders`).
 * Exports: App
 */
import { AppProviders } from './providers/AppProviders';

/** Application root. */
export function App() {
  return <AppProviders />;
}
