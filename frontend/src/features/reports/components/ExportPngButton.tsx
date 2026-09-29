/**
 * ExportPngButton.tsx
 * "Export PNG" button (docs/spec/05b §5.8): captures whatever report region `targetRef` points at
 * as a PNG, client-side, via `html-to-image` (lazy-imported so it never inflates the reports
 * route's own chunk). Exports/downloads the file directly — no server round-trip.
 * Exports: ExportPngButton
 * Spec: docs/spec/05b §5.8
 */
import { useState, type RefObject } from 'react';
import Spinner from 'react-bootstrap/Spinner';
import { cssVar } from '../../dashboard/components/charts/chartColors';
import { en } from '../../../i18n/en';
import { downloadBlob } from '../../../lib/download';
import { useToast } from '../../../components/ToastProvider';

interface ExportPngButtonProps {
  /** The DOM node to capture (the report's chart + table region). */
  targetRef: RefObject<HTMLElement | null>;
  /** Download filename, e.g. `campuscoin-report-by-category-2026-09.png`. */
  filename: string;
}

/** Captures `targetRef`'s current contents as a PNG and downloads it. */
export function ExportPngButton({ targetRef, filename }: ExportPngButtonProps) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!targetRef.current) return;
    setPending(true);
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(targetRef.current, { backgroundColor: cssVar('--bs-body-bg', '#ffffff'), pixelRatio: 2 });
      if (!blob) throw new Error('empty capture');
      downloadBlob(blob, filename);
    } catch {
      showToast({ message: en.reports.exportPngFailed });
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleClick} disabled={pending}>
      {pending ? <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" /> : <i className="bi bi-image me-1" aria-hidden="true" />}
      {en.reports.exportPng}
    </button>
  );
}
