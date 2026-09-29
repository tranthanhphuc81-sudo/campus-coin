/**
 * useDocumentMeta.ts
 * Sets `document.title` and the `description`/Open Graph `<meta>` tags for the current page.
 * The stack has no SSR/react-helmet (pages pre-render as plain static HTML, per spec), so public
 * pages that need per-page SEO metadata call this on mount instead.
 * Exports: useDocumentMeta
 * Spec: docs/spec/08 §8.3 (landing: meta title/description + Open Graph)
 */
import { useEffect } from 'react';

export interface DocumentMetaInput {
  title: string;
  description: string;
}

/** Finds (or creates) a `<meta>` tag matched by `attr="key"` and sets its `content`. */
function setMetaTag(attr: 'name' | 'property', key: string, content: string): void {
  let tag = document.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

/** Sets the document title + description/OG meta tags for the page currently mounted. */
export function useDocumentMeta({ title, description }: DocumentMetaInput): void {
  useEffect(() => {
    const fullTitle = title === 'CampusCoin' ? title : `${title} · CampusCoin`;
    document.title = fullTitle;
    setMetaTag('name', 'description', description);
    setMetaTag('property', 'og:title', fullTitle);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', 'website');
  }, [title, description]);
}
