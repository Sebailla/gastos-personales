'use client';

/**
 * CreateTransactionForm — production Client Component.
 *
 * Per design §7.3 + §9.1 + REQ-UI-5/6/7:
 * - `FormField` + `Input` + `Select` + `Textarea` + `Combobox`
 *   primitives compose the form. Every control has a paired
 *   `<label htmlFor>` (REQ-UI-5). The `FieldError` is wired via
 *   `aria-describedby` on the control (REQ-UI-6).
 * - The Combobox (slice 1) renders the live accounts list. The
 *   account <select> carries the canonical value (the search
 *   input is a UX filter on top).
 * - `mapApiErrorToFieldError` maps the API's wire codes
 *   (INVALID_AMOUNT, FUTURE_DATE_NOT_ALLOWED, ACCOUNT_ARCHIVED)
 *   to per-field errors per design §6.5 / BR-UI-5.
 * - The submit button renders Spinner + disabled + aria-busy="true"
 *   while the fetch is in flight (REQ-UI-7).
 * - On 201, `router.push` to `/transactions/<new-id>`.
 *
 * BR-TX-15 (form-state discipline, slice 2 lesson analog):
 * local `useState` per field. The form MUST NOT hold the session
 * or any server-derived data in client state.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../_ui/primitives/button';
import { Input } from '../../../_ui/primitives/input';
import { Select } from '../../../_ui/primitives/select';
import { Combobox } from '../../../_ui/primitives/combobox';
import { FormField } from '../../../_ui/primitives/form-field';
import {
  mapApiErrorToFieldError,
  type FieldErrorMap,
} from '../../../_ui/_shared/map-api-error';

const DIRECTIONS = ['INCOME', 'EXPENSE'] as const;
const CURRENCIES = ['ARS', 'USD'] as const;
type Direction = (typeof DIRECTIONS)[number];
type Currency = (typeof CURRENCIES)[number];

export interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  accounts: ReadonlyArray<AccountOption>;
}

const FORM_FIELDS = [
  'accountId',
  'direction',
  'amountMinor',
  'originalCurrency',
  'transactionDate',
  'memo',
  'category',
] as const;

export function CreateTransactionForm({ accounts }: Props): React.JSX.Element {
  const router = useRouter();

  // Per-field state (BR-TX-15).
  const [accountId, setAccountId] = useState<string | null>(
    accounts[0]?.id ?? null,
  );
  const [direction, setDirection] = useState<Direction>('EXPENSE');
  const [amountMinor, setAmountMinor] = useState<string>('');
  const [originalCurrency, setOriginalCurrency] = useState<Currency>('ARS');
  const [transactionDate, setTransactionDate] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [category, setCategory] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  function lookupError(field: string): string | undefined {
    return fieldErrors[field];
  }

  // Combobox expects { value, label } per option; we render
  // `<name> (<currency>)` so the search hits both fields.
  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name} (${a.currency})`,
  }));

  const canSubmit =
    !submitting &&
    accountId !== null &&
    amountMinor.trim() !== '' &&
    Number(amountMinor) > 0 &&
    transactionDate.trim() !== '';

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFieldErrors({});
    setErrorBanner(null);

    const body: Record<string, unknown> = {
      accountId,
      direction,
      amountMinor: Number(amountMinor),
      originalCurrency,
      transactionDate,
    };
    if (memo.trim() !== '') body.memo = memo.trim();
    if (category.trim() !== '') body.category = category.trim();

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        const payload = (await res.json().catch(() => null)) as
          | { data?: { id?: string } }
          | null;
        const newId = payload?.data?.id;
        router.push(
          newId ? `/transactions/${newId}?toast=created` : '/transactions?toast=created',
        );
        return;
      }
      const errBody = (await res.json().catch(() => null)) as
        | { error?: { code: string; message: string } }
        | null;
      if (errBody?.error) {
        const mapped = mapApiErrorToFieldError(
          { error: errBody.error },
          [...FORM_FIELDS],
        );
        setFieldErrors(mapped);
        setErrorBanner(errBody.error.message);
      } else {
        setErrorBanner(`create failed (${res.status})`);
      }
    } catch {
      setErrorBanner('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-ui-space-4 max-w-xl" noValidate>
      <FormField
        id="account-search"
        label="Account"
        required
        error={lookupError('accountId')}
      >
        <Combobox
          id="account-search"
          value={accountId}
          onChange={setAccountId}
          options={accountOptions}
          placeholder="Search accounts…"
          required
          aria-label="Search accounts by name"
        />
        {/* Hidden semantic <select> for the form submission; Combobox
            renders its own visible <select> for keyboard / SR selection. */}
        {accountOptions.length === 0 ? (
          <p className="text-ui-text-sm text-ui-fg-muted">
            No accounts yet — create one first to record transactions.
          </p>
        ) : null}
      </FormField>

      <FormField
        id="direction"
        label="Direction"
        required
        error={lookupError('direction')}
        description="INCOME records money in; EXPENSE records money out."
      >
        <Select
          id="direction"
          options={DIRECTIONS.map((d) => ({ value: d, label: d }))}
          value={direction}
          onChange={(e) => setDirection(e.target.value as Direction)}
          aria-invalid={lookupError('direction') ? 'true' : undefined}
        />
      </FormField>

      <FormField
        id="amountMinor"
        label="Amount (minor units)"
        required
        error={lookupError('amountMinor')}
        description="Positive integer in the smallest currency unit (cents for USD/ARS)."
      >
        <Input
          id="amountMinor"
          type="number"
          min={1}
          step={1}
          value={amountMinor}
          onChange={(e) => setAmountMinor(e.target.value)}
          required
          aria-invalid={lookupError('amountMinor') ? 'true' : undefined}
        />
      </FormField>

      <FormField
        id="originalCurrency"
        label="Original currency"
        required
        error={lookupError('originalCurrency')}
        description="The currency the transaction was recorded in. The FX snapshot is computed at write time."
      >
        <Select
          id="originalCurrency"
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={originalCurrency}
          onChange={(e) => setOriginalCurrency(e.target.value as Currency)}
          aria-invalid={lookupError('originalCurrency') ? 'true' : undefined}
        />
      </FormField>

      <FormField
        id="transactionDate"
        label="Transaction date"
        required
        error={lookupError('transactionDate')}
        description="ISO 8601 timestamp; cannot be in the future."
      >
        <Input
          id="transactionDate"
          type="datetime-local"
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
          required
          aria-invalid={lookupError('transactionDate') ? 'true' : undefined}
        />
      </FormField>

      <FormField
        id="memo"
        label="Memo (optional)"
        error={lookupError('memo')}
        description="Free-form note, max 500 chars."
      >
        <Input
          id="memo"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={500}
          aria-invalid={lookupError('memo') ? 'true' : undefined}
        />
      </FormField>

      <FormField
        id="category"
        label="Category (optional)"
        error={lookupError('category')}
        description="One tag, max 50 chars."
      >
        <Input
          id="category"
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={50}
          aria-invalid={lookupError('category') ? 'true' : undefined}
        />
      </FormField>

      {errorBanner ? (
        <div
          role="alert"
          className="rounded-ui-md border border-ui-danger bg-ui-danger/10 px-ui-space-3 py-ui-space-2 text-ui-text-sm text-ui-danger"
        >
          {errorBanner}
        </div>
      ) : null}

      <div className="flex justify-end gap-ui-space-2">
        <a
          href="/transactions"
          className="rounded-ui-md border border-ui-border bg-ui-bg px-ui-space-3 py-ui-space-2 text-ui-text-sm text-ui-fg hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent"
        >
          Cancel
        </a>
        <Button type="submit" variant="primary" isLoading={submitting} disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create transaction'}
        </Button>
      </div>
    </form>
  );
}
