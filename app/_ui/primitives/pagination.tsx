/**
 * Pagination primitive — server-rendered <nav> with <Link> controls.
 *
 * Per design §3.2.10. The pagination appends ?page=N to the
 * baseUrl; the consumer can override the param name via `queryKey`.
 * No client-side state; the page change is a full Server
 * Component re-render.
 */

import Link from 'next/link';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
  queryKey?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  baseUrl,
  queryKey = 'page',
}: PaginationProps): React.JSX.Element {
  const pageHref = (n: number): string => {
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}${queryKey}=${n}`;
  };

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav aria-label="Pagination" className="flex items-center gap-ui-space-2">
      {currentPage > 1 && (
        <Link
          href={pageHref(currentPage - 1)}
          aria-label="Previous page"
          className="rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-1 text-ui-text-sm text-ui-fg hover:bg-ui-bg-muted focus-visible:ring-2 focus-visible:ring-ui-accent"
        >
          ‹ Previous
        </Link>
      )}
      {pages.map((n) => {
        const isCurrent = n === currentPage;
        return (
          <Link
            key={n}
            href={pageHref(n)}
            aria-label={`Page ${n}`}
            aria-current={isCurrent ? 'page' : undefined}
            className={
              isCurrent
                ? 'rounded-ui-md bg-ui-accent px-ui-space-3 py-ui-space-1 text-ui-text-sm text-ui-accent-fg'
                : 'rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-1 text-ui-text-sm text-ui-fg hover:bg-ui-bg-muted focus-visible:ring-2 focus-visible:ring-ui-accent'
            }
          >
            {n}
          </Link>
        );
      })}
      {currentPage < totalPages && (
        <Link
          href={pageHref(currentPage + 1)}
          aria-label="Next page"
          className="rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-1 text-ui-text-sm text-ui-fg hover:bg-ui-bg-muted focus-visible:ring-2 focus-visible:ring-ui-accent"
        >
          Next ›
        </Link>
      )}
    </nav>
  );
}
