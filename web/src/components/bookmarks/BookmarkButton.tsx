import { useEffect, useMemo, useState, type FormEvent } from "react";

import { en } from "@/content/en";
import {
  useBookmarks,
  useCreateBookmark,
  useDeleteBookmark,
  useUpdateBookmark,
  type BookmarkTargetType,
} from "@/features/bookmarks/hooks";
import { parseProblem } from "@/lib/problem";

type BookmarkButtonProps = {
  targetType: BookmarkTargetType;
  targetRef: string;
  ariaLabel?: string;
};

export default function BookmarkButton({ targetType, targetRef, ariaLabel }: BookmarkButtonProps) {
  const bookmarkQuery = useBookmarks({ targetType, targetRef });
  const createMutation = useCreateBookmark();
  const updateMutation = useUpdateBookmark();
  const deleteMutation = useDeleteBookmark();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const existingBookmark = useMemo(
    () => bookmarkQuery.data?.items[0] ?? null,
    [bookmarkQuery.data],
  );

  useEffect(() => {
    if (isDialogOpen) {
      setNote(existingBookmark?.note ?? "");
      setErrorMessage(null);
    }
  }, [existingBookmark?.note, isDialogOpen]);

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    bookmarkQuery.isFetching;

  const submitBookmark = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    try {
      const payload = {
        targetType,
        targetRef,
        note,
      };

      if (existingBookmark) {
        await updateMutation.mutateAsync(payload);
      } else {
        await createMutation.mutateAsync(payload);
      }

      setIsDialogOpen(false);
    } catch (error) {
      const problem = parseProblem(error);
      setErrorMessage(problem.detail || en.bookmarks.messages.saveFailed);
    }
  };

  const removeBookmark = async () => {
    setErrorMessage(null);

    try {
      await deleteMutation.mutateAsync({ targetType, targetRef });
      setIsDialogOpen(false);
    } catch (error) {
      const problem = parseProblem(error);
      setErrorMessage(problem.detail || en.bookmarks.messages.deleteFailed);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-outline"
        aria-label={ariaLabel ?? en.bookmarks.actions.openDialog}
        aria-pressed={Boolean(existingBookmark)}
        onClick={() => setIsDialogOpen(true)}
      >
        {existingBookmark ? en.bookmarks.actions.bookmarked : en.bookmarks.actions.bookmark}
      </button>

      {isDialogOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bookmark-dialog-title"
          >
            <h2 id="bookmark-dialog-title">
              {existingBookmark ? en.bookmarks.dialog.editTitle : en.bookmarks.dialog.createTitle}
            </h2>
            <p>{en.bookmarks.dialog.description}</p>

            <form
              className="form-stack"
              onSubmit={(event) => void submitBookmark(event)}
              noValidate
            >
              <div className="form-field">
                <label htmlFor="bookmark-note">{en.bookmarks.dialog.noteLabel}</label>
                <textarea
                  id="bookmark-note"
                  className="field-textarea"
                  value={note}
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                />
                <small className="dashboard-widget__meta">
                  {en.bookmarks.dialog.noteCounter.replace("{count}", String(note.length))}
                </small>
              </div>

              {errorMessage ? (
                <p className="form-error" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <div className="dialog-actions">
                {existingBookmark ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      void removeBookmark();
                    }}
                    disabled={isBusy}
                  >
                    {en.bookmarks.actions.remove}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isBusy}
                >
                  {en.bookmarks.actions.cancel}
                </button>

                <button type="submit" className="btn btn-primary" disabled={isBusy}>
                  {isBusy ? en.common.loadingLabel : en.bookmarks.actions.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
