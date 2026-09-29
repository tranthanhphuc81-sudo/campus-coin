/**
 * ConfirmModal.tsx
 * Thin wrapper around `react-bootstrap`'s `Modal` for confirm/cancel dialogs (e.g. delete
 * confirmation). Relies on react-bootstrap's own focus trap and Escape handling.
 * Exports: ConfirmModal
 * Spec: docs/spec/08 §8.3 (dialogs)
 */
import type { ReactNode } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { en } from '../i18n/en';

interface ConfirmModalProps {
  show: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Bootstrap button variant for the confirm action (e.g. `'danger'` for destructive actions). */
  variant?: 'primary' | 'danger';
}

/** Accessible confirm/cancel dialog built on `react-bootstrap`'s `Modal`. */
export function ConfirmModal({
  show,
  title,
  body,
  confirmLabel = en.common.confirm,
  cancelLabel = en.common.cancel,
  onConfirm,
  onCancel,
  variant = 'primary',
}: ConfirmModalProps) {
  return (
    <Modal show={show} onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5 mb-0">
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{body}</Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
