/**
 * QuickAddContext.tsx
 * App-wide quick-add-transaction modal: mounted once by `StudentLayout` so it is reachable from
 * the navbar button, the mobile FAB, the dashboard's own button (P09) and the **N** keyboard
 * shortcut, wherever the user currently is in `/app/*`. Enter-to-save and Esc-to-close come for
 * free from the native form + `react-bootstrap` Modal (see `TransactionForm`/`ConfirmModal`).
 * Exports: QuickAddProvider, useQuickAdd
 * Spec: docs/spec/05a §5.4.1 (quick-add: N opens, Enter saves, Esc closes, ≤3 actions)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { QuickAddModal } from './QuickAddModal';

interface QuickAddContextValue {
  open: () => void;
}

const QuickAddContext = createContext<QuickAddContextValue | undefined>(undefined);

/** True when the keyboard shortcut should be ignored: the user is typing somewhere, or a modifier is held. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Mounts the quick-add modal once and exposes `useQuickAdd().open()` plus the global "N" shortcut. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  const open = useCallback(() => setShow(true), []);
  const close = useCallback(() => setShow(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (show || event.key !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      open();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, open]);

  const value = useMemo<QuickAddContextValue>(() => ({ open }), [open]);

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <QuickAddModal show={show} onClose={close} />
    </QuickAddContext.Provider>
  );
}

/** Opens the app-wide quick-add-transaction modal from anywhere in `/app/*`. */
export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error('useQuickAdd must be used within QuickAddProvider');
  return ctx;
}
