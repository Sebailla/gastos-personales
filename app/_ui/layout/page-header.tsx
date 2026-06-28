/**
 * PageHeader primitive — <header> with <h1> title, description,
 * and an optional actions slot (used by the "+ New" buttons).
 */

import { cx } from '../_shared/cx';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps): React.JSX.Element {
  return (
    <header
      className={cx(
        'flex flex-col gap-ui-space-2 sm:flex-row sm:items-center sm:justify-between',
        'border-b border-ui-border pb-ui-space-4 mb-ui-space-6',
        className,
      )}
    >
      <div>
        <h1 className="text-ui-text-3xl font-ui-font-bold text-ui-fg">{title}</h1>
        {description && (
          <p className="mt-1 text-ui-text-sm text-ui-fg-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-ui-space-2">{actions}</div>}
    </header>
  );
}