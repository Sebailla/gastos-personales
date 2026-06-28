/**
 * /accounts/new — Server Component production render.
 *
 * BR-ACC-14: missing session → redirect to
 * `/auth/signin?callbackUrl=/accounts/new`.
 *
 * Per design §7.3 the create page renders a PageHeader +
 * Card + CardBody + CreateAccountForm Client Component. The
 * shell does NOT pass any server-derived data to the form
 * (BR-ACC-15 form-state discipline).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/nextauth';
import { PageContainer } from '../../_ui/layout/page-container';
import { PageHeader } from '../../_ui/layout/page-header';
import { Link } from '../../_ui/primitives/link';
import { Card, CardBody } from '../../_ui/primitives/card';
import { CreateAccountForm } from './create-account-form';

export const dynamic = 'force-dynamic';

export default async function NewAccountPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/accounts/new'));
  }

  return (
    <PageContainer>
      <PageHeader
        title="New account"
        actions={
          <Link
            href="/accounts"
            className="rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-1 text-ui-text-sm text-ui-fg hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent"
          >
            ← Back to accounts
          </Link>
        }
      />
      <Card aria-label="Create a new account">
        <CardBody>
          <CreateAccountForm />
        </CardBody>
      </Card>
    </PageContainer>
  );
}
