/**
 * BookmarkNoteModal.tsx
 * "Save"/"Edit note" modal for a bookmark (docs/spec/05c §5.12): an optional note, capped at
 * `BOOKMARK_NOTE_MAX_CHARS` (reuses `createBookmarkSchema`'s note constraint client-side). Mirrors
 * `features/reports/components/ShareByEmailModal.tsx`'s React Hook Form + Zod shape.
 * Exports: BookmarkNoteModal
 * Spec: docs/spec/05c §5.12
 */
import { BOOKMARK_NOTE_MAX_CHARS } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { en } from '../../../i18n/en';

const formSchema = z.object({
  note: z.string().trim().max(BOOKMARK_NOTE_MAX_CHARS, `Note must be at most ${BOOKMARK_NOTE_MAX_CHARS} characters.`).optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface BookmarkNoteModalProps {
  show: boolean;
  onClose: () => void;
  /** The bookmark's current note, when editing an existing bookmark. */
  initialNote?: string | null;
  /** True when editing an already-saved bookmark (enables the "Remove" action). */
  isEditing: boolean;
  isSaving: boolean;
  onSave: (note: string | null) => void;
  onRemove?: () => void;
}

/** Modal collecting an optional note when saving a bookmark, or editing/removing an existing one. */
export function BookmarkNoteModal({ show, onClose, initialNote, isEditing, isSaving, onSave, onRemove }: BookmarkNoteModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), values: { note: initialNote ?? '' } });

  function submit(values: FormValues) {
    onSave(values.note?.trim() ? values.note.trim() : null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5 mb-0">
          {isEditing ? en.bookmarks.editNoteTitle : en.bookmarks.saveTitle}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form id="bookmark-note-form" onSubmit={handleSubmit(submit)} noValidate>
          <label htmlFor="bookmark-note" className="form-label">
            {en.bookmarks.noteLabel}
          </label>
          <textarea
            id="bookmark-note"
            rows={3}
            maxLength={BOOKMARK_NOTE_MAX_CHARS}
            className={`form-control ${errors.note ? 'is-invalid' : ''}`}
            aria-describedby={errors.note ? 'bookmark-note-error' : undefined}
            {...register('note')}
          />
          {errors.note ? (
            <div id="bookmark-note-error" className="invalid-feedback">
              {errors.note.message}
            </div>
          ) : null}
        </form>
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between">
        <div>
          {isEditing && onRemove ? (
            <button type="button" className="btn btn-outline-danger" onClick={onRemove} disabled={isSaving}>
              {en.bookmarks.remove}
            </button>
          ) : null}
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={handleClose} disabled={isSaving}>
            {en.common.cancel}
          </button>
          <button type="submit" form="bookmark-note-form" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? <Spinner animation="border" size="sm" aria-hidden="true" /> : en.bookmarks.save}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
