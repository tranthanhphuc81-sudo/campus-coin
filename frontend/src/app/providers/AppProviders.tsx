/**
 * AppProviders.tsx
 * Composes every app-wide provider in the required order: TanStack Query → Auth → Theme →
 * Toast → Router. `ThemeProvider` reads `useAuth()`, so `AuthProvider` must wrap it; `Router`
 * is last so route components can use every context above.
 * Exports: AppProviders
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ToastProvider } from '../../components/ToastProvider';
import { AuthProvider } from '../../lib/auth/AuthContext';
import { queryClient } from '../../lib/queryClient';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { router } from '../router';

/** Root provider tree + router for the whole app. */
export function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
