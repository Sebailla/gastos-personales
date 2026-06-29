/**
 * Button primitive — the primary call-to-action surface.
 *
 * Per design §3.2.1 + §7.1:
 * - variant: 'primary' | 'secondary' | 'ghost' | 'danger'
 * - isLoading: renders Spinner + disabled + aria-busy="true"
 * - focus-visible:ring-2 focus-visible:ring-ui-accent (REQ-UI-4)
 * - forwards standard <button> attrs + className override
 *
 * Default to 'primary' so the most common CTA path
 * (submit form, save changes) needs no variant prop.
 */

import { cx } from '../_shared/cx';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. Defaults to 'primary'. */
  variant?: Variant;
  /** Loading state — renders Spinner + disabled + aria-busy="true". */
  isLoading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: 'bg-ui-accent text-ui-accent-fg hover:bg-ui-accent/90',
  secondary: 'bg-ui-bg-muted text-ui-fg border border-ui-border hover:bg-ui-bg-subtle',
  ghost: 'bg-transparent text-ui-fg hover:bg-ui-bg-muted',
  danger: 'bg-ui-danger text-ui-danger-fg hover:bg-ui-danger/90',
};

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  className,
  type,
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2',
        'rounded-ui-md px-ui-space-4 py-ui-space-2',
        'text-ui-text-sm font-ui-font-medium',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClass[variant],
        className,
      )}
      {...rest}
    >
      {isLoading && <Spinner aria-label="Loading" size={16} />}
      {children}
    </button>
  );
}
