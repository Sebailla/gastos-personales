/**
 * PageContainer primitive — <main> with max-width wrapper and
 * responsive horizontal padding. Every page renders inside a
 * PageContainer.
 */

import { cx } from '../_shared/cx';

export interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps): React.JSX.Element {
  return (
    <main
      className={cx(
        'mx-auto w-full max-w-6xl px-ui-space-4 py-ui-space-6',
        'sm:px-ui-space-6 lg:px-ui-space-8',
        className,
      )}
    >
      {children}
    </main>
  );
}
