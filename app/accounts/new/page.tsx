// smoke-minimal, not production
/**
 * /accounts/new — Server Component shell.
 *
 * BR-ACC-14: missing session → redirect to
 * `/auth/signin?callbackUrl=/accounts/new`.
 *
 * The shell embeds the `CreateAccountForm` Client Component.
 * All form state is local to the Client Component
 * (BR-ACC-15 form-state discipline). The shell does not
 * pass any server-derived data to the form.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth';
import { CreateAccountForm } from './create-account-form';

export const dynamic = 'force-dynamic';

export default async function NewAccountPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/accounts/new'));
  }

  return (
    <main className="p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">New account</h1>
      </header>
      <CreateAccountForm />
    </main>
  );
}
