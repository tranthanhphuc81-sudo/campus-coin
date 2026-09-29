/**
 * App.test.tsx
 * Smoke test: mounting the whole app (providers + router) at `/` renders the public landing
 * page's real heading.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { App } from './App';

describe('App', () => {
  it('renders the landing page heading at the root route', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: en.landing.heroTitle })).toBeInTheDocument();
  });
});
