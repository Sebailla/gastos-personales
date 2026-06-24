// smoke-minimal, not production
'use server';

/**
 * Server Actions for the transactions smoke UI.
 *
 * API-first: every action calls the Hono API via
 * `serverHonoRequest` (in-process), NOT the application
 * actions directly. The smoke UI is API-first per the
 * slice-5 hard guardrail #7: calling the application
 * actions directly would skip the auth gate
 * (`requireSession`) and the request/response shape
 * contract enforced at the route layer.
 *
 * Validation: each Server Action validates the FormData
 * with a local Zod schema before posting to the API. The
 * API boundary also validates (the slice-3 Zod schemas in
 * `src/modules/transactions/application/validation/`); the
 * local validation is a smoke-UI seam that catches typos
 * before the round-trip. The schemas mirror the API
 * constraints 1:1.
 *
 * Pattern (matches the slice-3 accounts pattern):
 * 1. Parse FormData with the local Zod schema.
 * 2. `serverHonoRequest(path, { method, headers, body })`.
 * 3. Branch on the response status:
 *    - 2xx → `redirect(...)` (per REQ-TX-15 success path).
 *    - 401 → `redirect('/auth/signin?...')` (defense-in-depth).
 *    - other 4xx/5xx → throw with the API's error message.
 *
 * The `redirect` from `next/navigation` throws a special
 * `NEXT_REDIRECT` error that Next.js intercepts — the
 * `redirect(...)` call does not return.
 */

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { serverHonoRequest } from '@/lib/server-hono';

/**
 * Form-data schema for the create form. Mirrors the slice-3
 * `TransactionCreateSchema` (in `src/modules/transactions/
 * application/validation/transaction-create.schema.ts`):
 * required UUID accountId, INCOME|EXPENSE direction,
 * positive amountMinor, ARS|USD originalCurrency, ISO 8601
 * transactionDate (not in the future — the API catches this
 * with FUTURE_DATE_NOT_ALLOWED), optional memo (max 500)
 * and category (max 50).
 */
const CreateTransactionFormSchema = z.object({
  accountId: z.string().uuid(),
  direction: z.enum(['INCOME', 'EXPENSE']),
  amountMinor: z.coerce.number().int().positive(),
  originalCurrency: z.enum(['ARS', 'USD']),
  transactionDate: z.string().datetime(),
  memo: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
});

/**
 * Create a transaction. On 201, redirect to the detail page
 * with the `?toast=created` query param (the list page mounts
 * an `EphemeralToast` for that key). On 4xx/5xx, throw with
 * the API's error message.
 */
export async function createTransactionServerAction(formData: FormData): Promise<void> {
  const parsed = CreateTransactionFormSchema.safeParse({
    accountId: formData.get('accountId') ?? undefined,
    direction: formData.get('direction') ?? undefined,
    amountMinor: formData.get('amountMinor') ?? undefined,
    originalCurrency: formData.get('originalCurrency') ?? undefined,
    transactionDate: formData.get('transactionDate') ?? undefined,
    memo: formData.get('memo') ?? undefined,
    category: formData.get('category') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'invalid form data');
  }

  const res = await serverHonoRequest('/api/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accountId: parsed.data.accountId,
      direction: parsed.data.direction,
      amountMinor: parsed.data.amountMinor,
      originalCurrency: parsed.data.originalCurrency,
      transactionDate: parsed.data.transactionDate,
      ...(parsed.data.memo ? { memo: parsed.data.memo } : {}),
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
    }),
  });

  if (res.status === 201) {
    const body = (await res.json()) as { data: { id: string } };
    redirect(`/transactions/${body.data.id}?toast=created`);
  }
  if (res.status === 401) {
    // No session — the smoke UI's Server Component is the auth
    // gate; this is a defense-in-depth redirect.
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions/new'));
  }
  const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
  throw new Error(body?.error?.message ?? `create failed (${res.status})`);
}

/**
 * Form-data schema for the edit form. Every field is optional;
 * the API applies a partial patch (the slice-3 update action).
 */
const UpdateTransactionFormSchema = z.object({
  memo: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  amountMinor: z.coerce.number().int().positive().optional(),
});

/**
 * Update a transaction. On 200, redirect to the detail page
 * with `?toast=updated`. On 4xx/5xx, throw.
 */
export async function updateTransactionServerAction(id: string, formData: FormData): Promise<void> {
  const parsed = UpdateTransactionFormSchema.safeParse({
    memo: formData.get('memo') ?? undefined,
    category: formData.get('category') ?? undefined,
    amountMinor: formData.get('amountMinor') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'invalid form data');
  }

  // Drop empty strings — the API rejects empty `memo` (the
  // Zod schema requires `1..500` chars when present).
  const patch: Record<string, unknown> = {};
  if (parsed.data.memo !== undefined && parsed.data.memo !== '') patch['memo'] = parsed.data.memo;
  if (parsed.data.category !== undefined && parsed.data.category !== '') {
    patch['category'] = parsed.data.category;
  }
  if (parsed.data.amountMinor !== undefined) {
    patch['amountMinor'] = parsed.data.amountMinor;
  }

  const res = await serverHonoRequest(`/api/transactions/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });

  if (res.status === 200) {
    redirect(`/transactions/${id}?toast=updated`);
  }
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent(`/transactions/${id}`));
  }
  const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
  throw new Error(body?.error?.message ?? `update failed (${res.status})`);
}

/**
 * Hard-delete a transaction. On 200, redirect to the list
 * page with `?toast=deleted`. On 4xx/5xx, throw.
 */
export async function deleteTransactionServerAction(id: string): Promise<void> {
  const res = await serverHonoRequest(`/api/transactions/${id}`, { method: 'DELETE' });
  if (res.status === 200 || res.status === 204) {
    redirect('/transactions?toast=deleted');
  }
  if (res.status === 401) {
    redirect('/auth/signin?callbackUrl=' + encodeURIComponent('/transactions'));
  }
  const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
  throw new Error(body?.error?.message ?? `delete failed (${res.status})`);
}
