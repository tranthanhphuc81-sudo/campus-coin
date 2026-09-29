/**
 * ToastProvider.tsx
 * App-wide toast notifications on top of `react-bootstrap`'s `Toast`/`ToastContainer`.
 * `showToast` auto-dismisses after 3s and optionally renders an action button (e.g. "Undo").
 * Exports: ToastProvider, useToast
 * Spec: docs/spec/08 §8.3 (feedback)
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Toast from 'react-bootstrap/Toast';
import ToastContainer from 'react-bootstrap/ToastContainer';

const TOAST_AUTOHIDE_MS = 3000;

/** Options accepted by {@link ToastContextValue.showToast}. */
export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss delay in ms (default {@link TOAST_AUTOHIDE_MS}) — e.g. a longer window for an Undo action. */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

/** Value exposed by {@link useToast}. */
export interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/** Renders queued toasts and exposes {@link useToast} to trigger new ones. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((prev) => [...prev, { ...options, id }]);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1080 }}>
        {toasts.map((toast) => (
          <Toast key={toast.id} onClose={() => dismiss(toast.id)} delay={toast.durationMs ?? TOAST_AUTOHIDE_MS} autohide>
            <Toast.Body className="d-flex justify-content-between align-items-center gap-3">
              <span>{toast.message}</span>
              {toast.actionLabel && toast.onAction ? (
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-decoration-underline"
                  onClick={() => {
                    toast.onAction?.();
                    dismiss(toast.id);
                  }}
                >
                  {toast.actionLabel}
                </button>
              ) : null}
            </Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}

/** Reads the toast API; throws if used outside {@link ToastProvider}. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
