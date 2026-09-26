import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import BookmarkButton from "@/components/bookmarks/BookmarkButton";
import { en } from "@/content/en";
import { useBookmarks, type BookmarkTargetType } from "@/features/bookmarks/hooks";

function sanitizeTab(value: string | null): BookmarkTargetType {
  if (value === "tip" || value === "insight" || value === "report") {
    return value;
  }

  return "tip";
}

function toTargetLink(type: BookmarkTargetType, ref: string): string {
  if (type === "tip") {
    return en.routes.tips;
  }

  if (type === "insight") {
    return `${en.routes.insights}?month=${encodeURIComponent(ref)}`;
  }

  return `${en.routes.reports}?${ref}`;
}

export default function SavedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = sanitizeTab(searchParams.get("tab"));
  const q = searchParams.get("q")?.trim() ?? "";

  const bookmarksQuery = useBookmarks({
    targetType: tab,
    q: q.length > 0 ? q : undefined,
  });

  const items = useMemo(() => bookmarksQuery.data?.items ?? [], [bookmarksQuery.data]);

  const updateFilters = (next: { tab?: BookmarkTargetType; q?: string }) => {
    const params = new URLSearchParams(searchParams);

    if (next.tab) {
      params.set("tab", next.tab);
    }

    if (next.q && next.q.trim().length > 0) {
      params.set("q", next.q.trim());
    } else {
      params.delete("q");
    }

    setSearchParams(params, { replace: true });
  };

  return (
    <section className="saved-page" aria-labelledby="saved-page-title">
      <header className="saved-page__header">
        <h1 id="saved-page-title">{en.saved.title}</h1>
        <p>{en.saved.subtitle}</p>
      </header>

      <div className="saved-page__filters panel">
        <div className="saved-page__tabs" role="tablist" aria-label={en.saved.tabsAriaLabel}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tip"}
            className={tab === "tip" ? "is-active" : ""}
            onClick={() => updateFilters({ tab: "tip" })}
          >
            {en.saved.tabs.tip}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "insight"}
            className={tab === "insight" ? "is-active" : ""}
            onClick={() => updateFilters({ tab: "insight" })}
          >
            {en.saved.tabs.insight}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "report"}
            className={tab === "report" ? "is-active" : ""}
            onClick={() => updateFilters({ tab: "report" })}
          >
            {en.saved.tabs.report}
          </button>
        </div>

        <div className="form-field">
          <label htmlFor="saved-search-note">{en.saved.searchLabel}</label>
          <input
            id="saved-search-note"
            type="search"
            value={q}
            placeholder={en.saved.searchPlaceholder}
            onChange={(event) => updateFilters({ q: event.target.value })}
          />
        </div>
      </div>

      {bookmarksQuery.isLoading ? <p>{en.common.loadingLabel}</p> : null}
      {!bookmarksQuery.isLoading && items.length === 0 ? <p>{en.saved.emptyState}</p> : null}

      <div className="saved-grid">
        {items.map((bookmark) => (
          <article key={bookmark.id} className="panel saved-card">
            <header className="saved-card__header">
              <h2>{en.saved.tabs[bookmark.targetType]}</h2>
              <p className="dashboard-widget__meta">{bookmark.targetRef}</p>
            </header>

            <p>{bookmark.note || en.saved.noNote}</p>

            <div className="saved-card__actions">
              <Link
                className="btn btn-outline"
                to={toTargetLink(bookmark.targetType, bookmark.targetRef)}
              >
                {en.saved.openAction}
              </Link>
              <BookmarkButton targetType={bookmark.targetType} targetRef={bookmark.targetRef} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
