/**
 * Topbar primitive — <header> slot. Forward-declared for a
 * follow-up `ui-topbar` change; NOT used in v1 per design §2.1.
 */

import { cx } from '../_shared/cx';

export interface TopbarProps {
  children?: React.ReactNode;
  className?: string;
}

export function Topbar({ children, className }: TopbarProps): React.JSX.Element {
  return (
    <header
      className={cx(
        'flex items-center justify-between border-b border-ui-border bg-ui-bg px-ui-space-4 py-ui-space-3',
        className,
      )}
    >
      {children}
    </header>
  );
}
