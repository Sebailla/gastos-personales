/**
 * Skeleton primitive — animated placeholder.
 *
 * Per design §3.2.9: aria-hidden="true" so screen readers skip
 * the loading shimmer. Inline width / height so the consumer
 * can size the placeholder without a className dance.
 */

import { cx } from '../_shared/cx';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

function toSize(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

export function Skeleton({
  width = '100%',
  height = 16,
  className,
}: SkeletonProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-block', width: toSize(width), height: toSize(height) }}
      className={cx('animate-pulse rounded-ui-md bg-ui-bg-subtle', className)}
    />
  );
}
