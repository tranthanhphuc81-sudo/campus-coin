/**
 * ErrorBoundary.tsx
 * Class component catching render errors in its subtree and showing `ErrorState` with a
 * "Retry" that resets its own error state. One instance wraps each layout's `<Outlet/>` (not
 * the whole app) so one crashing widget never blanks the entire page.
 * Exports: ErrorBoundary
 * Spec: docs/spec/08 §8.6 (error state)
 */
import { Component, type ReactNode } from 'react';
import { en } from '../i18n/en';
import { ErrorState } from './ErrorState';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Catches render-time errors in `children` and shows a retryable {@link ErrorState}. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  /** React lifecycle: flips the boundary into its error-rendering state. */
  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  /** React lifecycle: logs the error for diagnostics (never rendered to the user). */
  override componentDidCatch(error: unknown, info: unknown): void {
    // Last-resort diagnostic; there is no client-side logger yet in the browser bundle.
    console.error('ErrorBoundary caught an error', error, info);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorState message={en.errors.generic} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
