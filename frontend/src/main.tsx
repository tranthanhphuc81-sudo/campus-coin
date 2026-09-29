/**
 * main.tsx
 * Browser entry point: loads global styles (self-hosted Inter font, Bootstrap SCSS, Bootstrap
 * Icons) and mounts <App /> (full provider tree + router) into #root.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initSentry } from './lib/sentry';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.scss';

// P20: no-op unless VITE_SENTRY_DSN is set; loads as its own chunk (see lib/sentry.ts).
initSentry();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
