/**
 * Badge primitive — semantic color-role pill.
 *
 * Per design §3.2.6. Variants: neutral | accent | success |
 * warning | danger. The INCOME -> success and EXPENSE -> danger
 * mapping lives in `directionVariant` so consumers can write
 * <Badge variant={directionVariant(tx.direction)}> without a
 * switch statement at the call site.
 */

import { cx } from '../_shared/cx';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export type Direction = 'INCOME' | 'EXPENSE';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const variantClass: Record<BadgeVariant, string> = {
  neutral: 'bg-ui-bg-subtle text-ui-fg',
  accent: 'bg-ui-accent text-ui-accent-fg',
  success: 'bg-ui-success text-ui-success-fg',
  warning: 'bg-ui-warning text-ui-warning-fg',
  danger: 'bg-ui-danger text-ui-danger-fg',
};

export function Badge({ variant = 'neutral', className, children }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-ui-full px-ui-space-2 py-0.5',
        'text-ui-text-xs font-ui-font-medium',
        variantClass[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function directionVariant(direction: Direction): BadgeVariant {
  return direction === 'INCOME' ? 'success' : 'danger';
}
