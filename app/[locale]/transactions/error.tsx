'use client';

/**
 * /transactions — segment-level error boundary.
 *
 * Per design §8.3: Next.js convention requires Client
 * Components for `error.tsx` files (the `reset` callback is
 * a client-side function). The boundary mirrors the
 * accounts error boundary shape (PageContainer + Card +
 * CardHeader + CardBody + CardFooter with Retry button) so
 * the three transaction surfaces share a consistent error
 * contract per design §7.3.
 *
 * The Retry button invokes `reset`, which re-renders the
 * segment on the server (re-running the data fetch). If the
 * underlying error was transient, the page comes back.
 *
 * Accessibility:
 * - The error message is rendered in <p role="alert"> so
 *   screen readers announce it as soon as the boundary
 *   mounts.
 * - The CardHeader title is an <h2>; the Retry button is
 *   keyboard-focusable.
 */

import { useEffect } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '../../_ui/primitives/card';
import { Button } from '../../_ui/primitives/button';
import { PageContainer } from '../../_ui/layout/page-container';

export interface TransactionsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function TransactionsError({ error, reset }: TransactionsErrorProps): React.JSX.Element {
  useEffect(() => {
    // Surface the error to the console so the developer can
    // diagnose from the browser devtools. No external
    // telemetry in v1 (Sentry wiring lands in a follow-up).
    // eslint-disable-next-line no-console
    console.error('transactions segment error:', error);
  }, [error]);

  return (
    <PageContainer>
      <Card aria-label="Transactions error">
        <CardHeader title="Algo salió mal" />
        <CardBody>
          <p role="alert" className="text-ui-text-sm text-ui-fg">
            {error.message || 'No pudimos cargar las transacciones.'}
          </p>
        </CardBody>
        <CardFooter>
          <Button type="button" variant="primary" onClick={reset}>
            Reintentar
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
export default TransactionsError;
