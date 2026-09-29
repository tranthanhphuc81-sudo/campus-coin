/**
 * BookmarkButton.tsx
 * Toggleable "Save"/"Saved" button for a tip, insight or report view (docs/spec/05c §5.12).
 * Clicking always opens `BookmarkNoteModal` — in "create" mode (empty note) when not yet saved, or
 * in "edit" mode (pre-filled note, with a Remove action) when already saved — rather than silently
 * deleting on a second click, so a note is never lost to an accidental re-click.
 * Exports: BookmarkButton
 * Spec: docs/spec/05c §5.12
 */
import type { BookmarkTargetType, CreateBookmarkInput } from '@campuscoin/shared';
import { useState } from 'react';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { useBookmarkLookup, useCreateBookmarkMutation, useDeleteBookmarkMutation, useUpdateBookmarkMutation } from '../hooks';
import { BookmarkNoteModal } from './BookmarkNoteModal';

interface BookmarkButtonProps {
  targetType: BookmarkTargetType;
  /** Identifies the bookmarked object per `targetType` (tip id / insight month / report ref). */
  targetRef: string;
  /** Accessible label override; defaults to a generic "Save"/"Saved". */
  label?: string;
}

/** Filled/outline bookmark icon button; opens a note modal to create, or edit/remove, the bookmark. */
export function BookmarkButton({ targetType, targetRef, label }: BookmarkButtonProps) {
  const { byTargetRef } = useBookmarkLookup(targetType);
  const bookmark = byTargetRef.get(targetRef);
  const isBookmarked = Boolean(bookmark);
  const [showModal, setShowModal] = useState(false);
  const { showToast } = useToast();

  const createMutation = useCreateBookmarkMutation();
  const updateMutation = useUpdateBookmarkMutation();
  const deleteMutation = useDeleteBookmarkMutation();
  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  function handleSave(note: string | null) {
    if (bookmark) {
      updateMutation.mutate(
        { id: bookmark.id, input: { note } },
        {
          onSuccess: () => {
            showToast({ message: en.bookmarks.saved });
            setShowModal(false);
          },
        },
      );
      return;
    }
    // `targetType`/`targetRef` come straight from the caller's own props (each call site already
    // pairs the right type with the right ref shape — e.g. `TipCard` passes `'tip'` + the tip's own
    // id) so this reconstructs exactly one branch of the discriminated union at a time.
    const input = { targetType, targetRef, note } as CreateBookmarkInput;
    createMutation.mutate(input, {
      onSuccess: () => {
        showToast({ message: en.bookmarks.saved });
        setShowModal(false);
      },
    });
  }

  function handleRemove() {
    if (!bookmark) return;
    deleteMutation.mutate(bookmark.id, {
      onSuccess: () => {
        showToast({ message: en.bookmarks.removed });
        setShowModal(false);
      },
    });
  }

  return (
    <>
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowModal(true)} aria-pressed={isBookmarked}>
        <i className={`bi ${isBookmarked ? 'bi-bookmark-fill' : 'bi-bookmark'} me-1`} aria-hidden="true" />
        {label ?? (isBookmarked ? en.bookmarks.saved : en.bookmarks.save)}
      </button>
      <BookmarkNoteModal
        show={showModal}
        onClose={() => setShowModal(false)}
        initialNote={bookmark?.note}
        isEditing={isBookmarked}
        isSaving={isSaving}
        onSave={handleSave}
        onRemove={isBookmarked ? handleRemove : undefined}
      />
    </>
  );
}
