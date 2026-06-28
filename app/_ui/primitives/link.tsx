/**
 * Link primitive — thin Next.js Link wrapper with focus ring.
 *
 * The base text styling is inherited from the consumer's parent
 * (e.g. inside a Card body). The primitive adds the focus-visible
 * ring class (REQ-UI-4) and forwards all standard anchor attrs.
 */

import NextLink from 'next/link';
import { cx } from '../_shared/cx';

export interface LinkProps extends React.ComponentProps<typeof NextLink> {
  className?: string;
}

export function Link({ className, children, ...rest }: LinkProps): React.JSX.Element {
  return (
    <NextLink
      className={cx(
        'text-ui-accent underline-offset-2 hover:underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2',
        'rounded-ui-sm',
        className,
      )}
      {...rest}
    >
      {children}
    </NextLink>
  );
}
