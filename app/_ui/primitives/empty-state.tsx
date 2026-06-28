/**
 * EmptyState primitive — used when a list has zero rows.
 *
 * Per design §3.2.7. role=status so screen readers announce the
 * empty state on navigation. The CTA (when provided) is the
 * first focusable element to keep keyboard flow natural.
 */

import { cx } from '../_shared/cx';

export interface EmptyStateProps {
  title: string;
  description?: string;
  illustration?: React.ReactNode;
  cta?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  illustration,
  cta,
  className,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      role="status"
      className={cx(
        'flex flex-col items-center justify-center gap-ui-space-3',
        'rounded-ui-lg border border-dashed border-ui-border bg-ui-bg-muted',
        'px-ui-space-6 py-ui-space-8 text-center',
        className,
      )}
    >
      {illustration}
      <h3 className="text-ui-text-lg font-ui-font-semibold text-ui-fg">{title}</h3>
      {description && (
        <p className="max-w-md text-ui-text-sm text-ui-fg-muted">{description}</p>
      )}
      {cta}
    </div>
  );
}