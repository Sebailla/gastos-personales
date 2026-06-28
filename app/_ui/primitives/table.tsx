/**
 * Table compound primitive — Table + TableHeader + TableBody +
 * TableRow + TableCell.
 *
 * Per design §3.2.5 + §7.1 + REQ-UI-8:
 * - Table requires `caption` (visible or sr-only via hideCaption).
 * - TableHeader requires `columns` and renders <th scope=col> per
 *   column.
 * - Sortable columns render aria-sort reflecting sortDirection
 *   and a <button> inside the <th> for keyboard activation.
 * - Composition via children (no variant / as props).
 */

import { cx } from '../_shared/cx';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  sortDirection?: 'ascending' | 'descending' | 'none';
  onSort?: (key: string) => void;
}

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  caption: string;
  hideCaption?: boolean;
}

export function Table({
  caption,
  hideCaption,
  className,
  children,
  ...rest
}: TableProps): React.JSX.Element {
  return (
    <table className={cx('w-full border-collapse text-ui-text-sm', className)} {...rest}>
      <caption
        className={hideCaption ? 'sr-only' : 'text-ui-text-sm text-ui-fg-muted pb-ui-space-2'}
      >
        {caption}
      </caption>
      {children}
    </table>
  );
}

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  columns: ReadonlyArray<TableColumn>;
}

export function TableHeader({ columns, className }: TableHeaderProps): React.JSX.Element {
  return (
    <thead className={cx('bg-ui-bg-muted', className)}>
      <tr>
        {columns.map((col) => {
          const ariaSort =
            col.sortable && col.sortDirection && col.sortDirection !== 'none'
              ? col.sortDirection
              : col.sortable
                ? 'none'
                : undefined;
          return (
            <th
              key={col.key}
              scope="col"
              aria-sort={ariaSort}
              className="px-ui-space-3 py-ui-space-2 text-left font-ui-font-semibold text-ui-fg"
            >
              {col.sortable && col.onSort ? (
                <button
                  type="button"
                  onClick={() => col.onSort?.(col.key)}
                  className="inline-flex items-center gap-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent rounded-ui-sm"
                >
                  {col.label}
                </button>
              ) : (
                col.label
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function TableBody({
  className,
  children,
}: React.HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return <tbody className={cx('divide-y divide-ui-border', className)}>{children}</tbody>;
}

export function TableRow({
  className,
  children,
}: React.HTMLAttributes<HTMLTableRowElement>): React.JSX.Element {
  return <tr className={cx('hover:bg-ui-bg-muted', className)}>{children}</tr>;
}

export function TableCell({
  className,
  children,
}: React.TdHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return <td className={cx('px-ui-space-3 py-ui-space-2 text-ui-fg', className)}>{children}</td>;
}
