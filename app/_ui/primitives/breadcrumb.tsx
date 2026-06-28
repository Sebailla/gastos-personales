/**
 * Breadcrumb primitive — <nav aria-label=Breadcrumb> with <ol>
 * of <Link>s. Last item (no href) is the current page and gets
 * aria-current=page.
 */

import { Link } from './link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: ReadonlyArray<BreadcrumbItem>;
}

export function Breadcrumb({ items }: BreadcrumbProps): React.JSX.Element {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-ui-space-1 text-ui-text-sm text-ui-fg-muted">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-ui-space-1">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className="text-ui-fg">
                  {item.label}
                </span>
              )}
              {!isLast && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
