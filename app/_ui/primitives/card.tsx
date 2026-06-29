/**
 * Card compound primitive — Card + CardHeader + CardBody + CardFooter.
 *
 * Per design §3.2.4 + §7.1: composition via children (Vercel
 * composition pattern). NO variant / as props. The variants live
 * on the inner Button or Badge.
 *
 * Card renders <article> (semantic region for the content). The
 * optional aria-label / aria-labelledby on Card gives screen
 * readers a name for the region.
 */

import { cx } from '../_shared/cx';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export function Card({ className, children, ...rest }: CardProps): React.JSX.Element {
  return (
    <article
      className={cx(
        'rounded-ui-lg border border-ui-border bg-ui-bg shadow-ui-shadow-sm',
        'overflow-hidden',
        className,
      )}
      {...rest}
    >
      {children}
    </article>
  );
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function CardHeader({
  title,
  badge,
  actions,
  className,
}: CardHeaderProps): React.JSX.Element {
  return (
    <header
      className={cx(
        'flex items-center justify-between gap-ui-space-3',
        'border-b border-ui-border px-ui-space-4 py-ui-space-3',
        className,
      )}
    >
      <div className="flex items-center gap-ui-space-2">
        <h2 className="text-ui-text-lg font-ui-font-semibold text-ui-fg">{title}</h2>
        {badge}
      </div>
      {actions && <div className="flex items-center gap-ui-space-2">{actions}</div>}
    </header>
  );
}

export type CardBodyProps = React.HTMLAttributes<HTMLElement>;

export function CardBody({ className, children }: CardBodyProps): React.JSX.Element {
  return <div className={cx('px-ui-space-4 py-ui-space-4', className)}>{children}</div>;
}

export type CardFooterProps = React.HTMLAttributes<HTMLElement>;

export function CardFooter({ className, children }: CardFooterProps): React.JSX.Element {
  return (
    <footer
      className={cx(
        'flex items-center justify-end gap-ui-space-2',
        'border-t border-ui-border px-ui-space-4 py-ui-space-3 bg-ui-bg-muted',
        className,
      )}
    >
      {children}
    </footer>
  );
}
