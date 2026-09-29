/**
 * MonthlyExportShareBar.tsx
 * The month-scoped report actions shared by every `/app/reports/*` tab (docs/spec/05b §5.8):
 * pick a month, download its PDF, or email it. Rendered once by `ReportsLayout` so switching
 * tabs never loses the chosen month. "Bookmark this report" is intentionally not built yet — the
 * phase prompt asks to hide it until P14 wires up the save-filters API.
 * Exports: MonthlyExportShareBar
 * Spec: docs/spec/05b §5.8
 */
import { useState } from 'react';
import Spinner from 'react-bootstrap/Spinner';
import { MonthSelector } from '../../../components/MonthSelector';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { downloadBlob } from '../../../lib/download';
import { useExportMonthlyReportPdfMutation } from '../hooks';
import { ShareByEmailModal } from './ShareByEmailModal';

interface MonthlyExportShareBarProps {
  month: string;
  onMonthChange: (month: string) => void;
}

/** Month selector + "Export PDF" + "Share by email" for the monthly report PDF. */
export function MonthlyExportShareBar({ month, onMonthChange }: MonthlyExportShareBarProps) {
  const { showToast } = useToast();
  const [showShare, setShowShare] = useState(false);
  const exportMutation = useExportMonthlyReportPdfMutation();

  async function handleExport() {
    try {
      const blob = await exportMutation.mutateAsync(month);
      downloadBlob(blob, `campuscoin-report-${month.slice(0, 7)}.pdf`);
    } catch {
      showToast({ message: en.reports.exportPdfFailed });
    }
  }

  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <MonthSelector month={month} onChange={onMonthChange} label={en.reports.exportMonthLabel} />
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleExport} disabled={exportMutation.isPending}>
        {exportMutation.isPending ? (
          <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
        ) : (
          <i className="bi bi-file-earmark-pdf me-1" aria-hidden="true" />
        )}
        {en.reports.exportPdf}
      </button>
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowShare(true)}>
        <i className="bi bi-envelope me-1" aria-hidden="true" />
        {en.reports.shareByEmail}
      </button>
      <ShareByEmailModal show={showShare} month={month} onClose={() => setShowShare(false)} />
    </div>
  );
}
