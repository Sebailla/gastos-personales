'use client';

/**
 * /accounts — segment-level error boundary.
 *
 * Per design §8.3: Next.js convention requires Client
 * Components for `error.tsx` files (the `reset` callback is
 * a client-side function). The boundary renders inside a
 * PageContainer + Card + CardHeader + CardBody layout, with
 * the CardFooter holding the Retry button.
 *
 * The Retry button invokes `reset`, which re-renders the
 * segment on the server (re-running the data fetch). If the
 * underlying error was transient, the page comes back.
 *
 * Accessibility:
 * - The error message is rendered in <p role="alert"> so
 *   screen readers announce it as soon as the boundary
 *   mounts.
 * - The CardHeader title is an <h2> inside the existing
 *   <header>; the Retry button is keyboard-focusable.
 *
 * English copy per the design §7.3 + the conventional
 * "Algo salió mal" Spanish copy stays for slice 3+
 * (accounts + dashboard + transactions boundaries share
 * the same copy string set per the design).
 */

import { useEffect } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '../../_ui/primitives/card';
import { Button } from '../../_ui/primitives/button';
import { PageContainer } from '../../_ui/layout/page-container';

export interface AccountsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function AccountsError({ error, reset }: AccountsErrorProps): React.JSX.Element {
  useEffect(() => {
    // Surface the error to the console so the developer can
    // diagnose from the browser devtools. No external
    // telemetry in v1 (Sentry wiring lands in a follow-up).
    // eslint-disable-next-line no-console
    console.error('accounts segment error:', error);
  }, [error]);

  return (
    <PageContainer>
      <Card aria-label="Accounts error">
        <CardHeader title="Something went wrong" />
        <CardBody>
          <p role="alert" className="text-ui-text-sm text-ui-fg">
            {error.message || 'An unexpected error occurred.'}
          </p>
        </CardBody>
        <CardFooter>
          <Button type="button" variant="primary" onClick={reset}>
            Retry
          </Button>
        </CardFooter>
      </Card>
    </PageContainer>
  );
}

// Next.js App Router requires a default export named `default`
// for `error.tsx` files. We re-export the boundary under both
// names so the import in tests is unambiguous AND the file
// remains valid as an App Router error segment.
export default AccountsError;
