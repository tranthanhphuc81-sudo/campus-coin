/**
 * SavedPage.tsx
 * Student bookmarked tips/insights/reports page (`/app/saved`, P14, docs/spec/05c §5.12): a type
 * filter (All/Tips/Insights/Reports) and a debounced search, both URL-synced, backing
 * `GET /bookmarks`. Each row shows a type badge, a title (the tip's own title, "Insight – <Month>
 * <Year>" formatted from the bookmark's own `targetRef`, or a label derived from the report ref's
 * view via `describeReportRef`), an excerpt/note, saved date, and Open/Edit note/Remove actions.
 * "Open" is disabled once `target.available` is false (the tip/insight was since deleted) — report
 * bookmarks are always available (they're just a view + filters, not a stored object).
 * Exports: default (SavedPage)
 * Spec: docs/spec/05c §5.12
 */
import { BookmarkTargetType, type BookmarkDto } from '@campuscoin/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { PageHeader } from '../../../components/PageHeader';
import { TableSkeleton } from '../../../components/Skeletons';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { formatDateTime, formatMonthLabel } from '../../../lib/dates';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { BookmarkNoteModal } from '../../bookmarks/components/BookmarkNoteModal';
import { useBookmarksQuery, useDeleteBookmarkMutation, useUpdateBookmarkMutation } from '../../bookmarks/hooks';
import { describeReportRef, reportTargetRefToPath } from '../../bookmarks/reportRef';

const PAGE_SIZE = 20;

const TYPE_FILTERS: Array<{ value: BookmarkTargetType | undefined; label: string }> = [
  { value: undefined, label: en.saved.filterAll },
  { value: BookmarkTargetType.TIP, label: en.saved.filterTips },
  { value: BookmarkTargetType.INSIGHT, label: en.saved.filterInsights },
  { value: BookmarkTargetType.REPORT, label: en.saved.filterReports },
];

/** A bookmark's display title: the tip's own title, a formatted insight month, or a report label. */
function bookmarkTitle(bookmark: BookmarkDto): string {
  if (bookmark.targetType === BookmarkTargetType.INSIGHT) return en.saved.insightTitle(formatMonthLabel(bookmark.targetRef));
  if (bookmark.targetType === BookmarkTargetType.REPORT) return describeReportRef(bookmark.targetRef);
  return bookmark.target.title ?? en.saved.unavailable;
}

/** Where "Open" navigates to, or `null` when the target is no longer available. */
function bookmarkOpenPath(bookmark: BookmarkDto): string | null {
  if (!bookmark.target.available) return null;
  if (bookmark.targetType === BookmarkTargetType.TIP) return `/app/tips?highlight=${bookmark.targetRef}`;
  if (bookmark.targetType === BookmarkTargetType.INSIGHT) return `/app/insights?month=${bookmark.targetRef}`;
  return reportTargetRefToPath(bookmark.targetRef);
}

/** `/app/saved`: bookmarked tips/insights/reports, with a type filter, search and pagination. */
export default function SavedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  const type =
    typeParam === BookmarkTargetType.TIP || typeParam === BookmarkTargetType.INSIGHT || typeParam === BookmarkTargetType.REPORT
      ? typeParam
      : undefined;
  const q = searchParams.get('q') ?? '';
  const pageParam = Number(searchParams.get('page'));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const [searchInput, setSearchInput] = useState(q);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Pushes the debounced search into the URL (resetting to page 1), only once it actually differs
  // from what's already there — avoids re-writing the URL on every keystroke or on mount.
  useEffect(() => {
    if (debouncedSearch === q) return;
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (debouncedSearch) next.set('q', debouncedSearch);
        else next.delete('q');
        next.set('page', '1');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function setType(next: BookmarkTargetType | undefined) {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (next) params.set('type', next);
        else params.delete('type');
        params.set('page', '1');
        return params;
      },
      { replace: true },
    );
  }

  function setPage(next: number) {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        params.set('page', String(next));
        return params;
      },
      { replace: true },
    );
  }

  const { showToast } = useToast();
  const [editingBookmark, setEditingBookmark] = useState<BookmarkDto | null>(null);
  const [removingBookmark, setRemovingBookmark] = useState<BookmarkDto | null>(null);

  const query = useBookmarksQuery({ type, q: q || undefined, page, limit: PAGE_SIZE });
  const updateMutation = useUpdateBookmarkMutation();
  const deleteMutation = useDeleteBookmarkMutation();

  function handleSaveNote(note: string | null) {
    if (!editingBookmark) return;
    updateMutation.mutate(
      { id: editingBookmark.id, input: { note } },
      {
        onSuccess: () => {
          showToast({ message: en.bookmarks.saved });
          setEditingBookmark(null);
        },
      },
    );
  }

  function handleConfirmRemove() {
    if (!removingBookmark) return;
    const id = removingBookmark.id;
    setRemovingBookmark(null);
    deleteMutation.mutate(id, { onSuccess: () => showToast({ message: en.saved.removed }) });
  }

  const bookmarks = query.data?.data ?? [];
  const meta = query.data?.meta;
  const hasFilter = Boolean(type || q);

  return (
    <div>
      <PageHeader title={en.saved.pageTitle} subtitle={en.saved.subtitle} />

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div className="btn-group" role="group" aria-label={en.saved.pageTitle}>
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              className={`btn btn-sm ${type === filter.value ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setType(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="saved-search" className="visually-hidden">
            {en.saved.searchLabel}
          </label>
          <input
            id="saved-search"
            type="search"
            className="form-control form-control-sm"
            placeholder={en.saved.searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {query.isLoading ? (
        <TableSkeleton rows={5} />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : bookmarks.length === 0 ? (
        hasFilter ? <EmptyState icon="bi-search" message={en.saved.noResults} /> : <EmptyState icon="bi-bookmark" message={en.saved.empty} />
      ) : (
        <div className="d-flex flex-column gap-2">
          {bookmarks.map((bookmark) => {
            const openPath = bookmarkOpenPath(bookmark);
            return (
              <div className="card" key={bookmark.id}>
                <div className="card-body d-flex flex-wrap justify-content-between gap-3">
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <span className="badge text-bg-secondary">{en.saved.typeLabels[bookmark.targetType]}</span>
                      <h2 className="h6 mb-0">{bookmarkTitle(bookmark)}</h2>
                      {!bookmark.target.available ? <span className="badge text-bg-warning">{en.saved.unavailable}</span> : null}
                    </div>
                    {bookmark.target.excerpt ? <p className="mb-1">{bookmark.target.excerpt}</p> : null}
                    {bookmark.note ? (
                      <p className="mb-1 fst-italic text-body-secondary">{bookmark.note}</p>
                    ) : null}
                    <p className="small text-body-secondary mb-0">{en.saved.savedOn(formatDateTime(bookmark.createdAt))}</p>
                  </div>
                  <div className="d-flex flex-column gap-2 flex-shrink-0">
                    {openPath ? (
                      <Link to={openPath} className="btn btn-sm btn-primary">
                        {en.saved.open}
                      </Link>
                    ) : (
                      <button type="button" className="btn btn-sm btn-primary" disabled>
                        {en.saved.open}
                      </button>
                    )}
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditingBookmark(bookmark)}>
                      {en.saved.editNote}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setRemovingBookmark(bookmark)}>
                      {en.saved.remove}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {meta && meta.totalPages > 1 ? (
            <nav className="d-flex justify-content-between align-items-center mt-2" aria-label={en.saved.pagination.pageOf(meta.page, meta.totalPages)}>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)}>
                {en.saved.pagination.previous}
              </button>
              <span className="small text-body-secondary">{en.saved.pagination.pageOf(meta.page, meta.totalPages)}</span>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage(meta.page + 1)}
              >
                {en.saved.pagination.next}
              </button>
            </nav>
          ) : null}
        </div>
      )}

      <BookmarkNoteModal
        show={editingBookmark !== null}
        onClose={() => setEditingBookmark(null)}
        initialNote={editingBookmark?.note}
        isEditing
        isSaving={updateMutation.isPending}
        onSave={handleSaveNote}
      />

      <ConfirmModal
        show={removingBookmark !== null}
        title={en.saved.removeConfirmTitle}
        body={en.saved.removeConfirmBody}
        variant="danger"
        confirmLabel={en.saved.remove}
        onCancel={() => setRemovingBookmark(null)}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
