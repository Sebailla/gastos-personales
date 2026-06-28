/**
 * Sidebar primitive — <aside> slot. Forward-declared for a
 * follow-up `ui-sidebar` change; NOT used in v1 per design §2.1.
 */

import { cx } from '../_shared/cx';

export interface SidebarProps {
  children?: React.ReactNode;
  className?: string;
}

export function Sidebar({ children, className }: SidebarProps): React.JSX.Element {
  return <aside className={cx('flex flex-col gap-ui-space-4', className)}>{children}</aside>;
}
