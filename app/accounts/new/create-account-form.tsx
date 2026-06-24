// smoke-minimal, not production
'use client';

/**
 * CreateAccountForm — Client Component.
 *
 * BR-ACC-15 (form-state discipline): the form's state is
 * local `useState` per field. The form MUST NOT hold the
 * session, the user, or any server-derived data in client
 * state. The Server Component shell passes nothing beyond
 * the form's mount context.
 *
 * BR-ACC-16 (form behavior):
 * - `openingBalanceMode` defaults to `FRESH` on first render.
 * - On change of the `type` select, the form silently resets
 *   every type-specific field to its default (no confirmation).
 * - `openingBalanceMinor` MUST be `>= 0` (client + server
 *   validation). The submit button is disabled when the
 *   value is negative.
 * - On `201 Created`: `router.push('/accounts?toast=account-created')`
 *   (the list page mounts the EphemeralToast and renders
 *   "Account created" for ~3 s).
 * - On `4xx`: inline error banner with the first error message
 *   from the response body's `error` field.
 * - On `5xx` or network error: inline error banner with
 *   "Something went wrong".
 *
 * The form is a single Client Component (not split). All
 * state is local. The form does NOT import the typed Hono
 * client (it is server-only on the App Router); it uses
 * plain `fetch` with the same-origin `/api/accounts` path.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TYPES = ['BANK', 'CREDIT', 'INVESTMENT', 'CRYPTO', 'CASH', 'OTHER'] as const;
const CURRENCIES = ['ARS', 'USD', 'EUR'] as const;
const ACCOUNT_KINDS = ['SAVINGS', 'CHECKING'] as const;
const INVESTMENT_TYPES = [
  'STOCKS',
  'BONDS',
  'MUTUAL_FUNDS',
  'CERTS_OF_DEPOSIT',
  'OTHER',
] as const;
// fx-cache PR-2 T2.9 — REQ-FX-9. Six AccountFxCasa values in
// UPPERCASE form (matching the Prisma enum). The wire form on
// POST /api/accounts is UPPERCASE; the DolarAPI lowercase form
// lives at /api/fx and is consumed only by the fx module.
const CASAS = ['OFICIAL', 'BLUE', 'MEP', 'CCL', 'CRIPTO', 'TARJETA'] as const;

type AccountType = (typeof TYPES)[number];
type AccountCurrency = (typeof CURRENCIES)[number];
type OpeningBalanceMode = 'FRESH' | 'HISTORICAL';
type Casa = (typeof CASAS)[number];

interface ErrorResponse {
  error: { code: string; message: string; details?: unknown };
}

const EMPTY_TYPE_FIELDS = {
  bankName: '',
  accountKind: 'SAVINGS' as (typeof ACCOUNT_KINDS)[number],
  issuer: '',
  creditLimitMinor: '',
  statementDay: '',
  paymentDueDay: '',
  broker: '',
  investmentType: 'STOCKS' as (typeof INVESTMENT_TYPES)[number],
  walletAddress: '',
};

export function CreateAccountForm() {
  const router = useRouter();

  // Discriminated-union-driven form state.
  const [type, setType] = useState<AccountType>('BANK');
  const [name, setName] = useState<string>('');
  const [currency, setCurrency] = useState<AccountCurrency>('USD');
  const [openingBalanceMinor, setOpeningBalanceMinor] = useState<string>('0');
  const [openingBalanceMode, setOpeningBalanceMode] =
    useState<OpeningBalanceMode>('FRESH');
  const [openingBalanceDate, setOpeningBalanceDate] = useState<string>('');
  const [typeFields, setTypeFields] = useState(EMPTY_TYPE_FIELDS);
  // fx-cache PR-2 T2.9 — REQ-FX-9. The casa state is nullable:
  // `null` means "inherit the global default" and maps to
  // `casa = NULL` in the request body (the Zod schema treats
  // undefined and null the same way at the Prisma boundary).
  const [casa, setCasa] = useState<Casa | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // BR-ACC-16: silent reset on type change.
  function onTypeChange(next: AccountType) {
    setType(next);
    setTypeFields(EMPTY_TYPE_FIELDS);
  }

  const openingBalanceIsValid = Number(openingBalanceMinor) >= 0;
  const canSubmit =
    !submitting &&
    name.trim().length > 0 &&
    name.trim().length <= 80 &&
    openingBalanceIsValid &&
    (openingBalanceMode === 'FRESH' || openingBalanceDate.length > 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorBanner(null);

    const body: Record<string, unknown> = {
      type,
      name: name.trim(),
      currency,
      openingBalanceMinor: Number(openingBalanceMinor),
      openingBalanceMode,
      openingBalanceDate:
        openingBalanceMode === 'HISTORICAL' ? openingBalanceDate : null,
    };
    // fx-cache PR-2 T2.9 — REQ-FX-9. Include casa only when
    // the user picked one (non-null). When the placeholder is
    // active, the field is omitted and the server treats it as
    // `column = NULL` (inherit global default).
    if (casa !== null) {
      body['casa'] = casa;
    }

    // Add type-specific fields only for the relevant type.
    if (type === 'BANK') {
      body.bankName = typeFields.bankName;
      body.accountKind = typeFields.accountKind;
    } else if (type === 'CREDIT') {
      body.issuer = typeFields.issuer;
      if (typeFields.creditLimitMinor !== '') {
        body.creditLimitMinor = Number(typeFields.creditLimitMinor);
      }
      if (typeFields.statementDay !== '') {
        body.statementDay = Number(typeFields.statementDay);
      }
      if (typeFields.paymentDueDay !== '') {
        body.paymentDueDay = Number(typeFields.paymentDueDay);
      }
    } else if (type === 'INVESTMENT') {
      body.broker = typeFields.broker;
      body.investmentType = typeFields.investmentType;
    } else if (type === 'CRYPTO') {
      if (typeFields.walletAddress !== '') {
        body.walletAddress = typeFields.walletAddress;
      }
    }

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        router.push('/accounts?toast=account-created');
        return;
      }
      const errBody = (await res.json().catch(() => null)) as ErrorResponse | null;
      setErrorBanner(errBody?.error?.message ?? `create failed (${res.status})`);
    } catch {
      setErrorBanner('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-xl">
      <label className="flex flex-col gap-1">
        <span className="text-sm">Type</span>
        <select
          name="type"
          value={type}
          onChange={(e) => onTypeChange(e.target.value as AccountType)}
          className="border border-gray-300 rounded px-2 py-1"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Name</span>
        <input
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={1}
          maxLength={80}
          className="border border-gray-300 rounded px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Currency</span>
        <select
          name="currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as AccountCurrency)}
          className="border border-gray-300 rounded px-2 py-1"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {/* fx-cache PR-2 T2.9 — REQ-FX-9. Per-account casa selection.
          The placeholder ("Default (oficial)") maps to casa = NULL
          in the request body; the user picks an explicit casa when
          they want a non-default quote source. WCAG: the label
          text is associated with the <select> via the wrapping
          <label>, the control is focusable and keyboard-navigable. */}
      <label className="flex flex-col gap-1">
        <span className="text-sm">FX casa (optional)</span>
        <select
          name="casa"
          value={casa ?? ''}
          onChange={(e) =>
            setCasa(e.target.value === '' ? null : (e.target.value as Casa))
          }
          className="border border-gray-300 rounded px-2 py-1"
        >
          <option value="">Default (oficial)</option>
          {CASAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {/* Type-specific fields (BR-ACC-16: silent reset on type change). */}
      {type === 'BANK' ? (
        <div className="flex flex-col gap-3 border-l-2 border-gray-200 pl-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Bank name</span>
            <input
              name="bankName"
              type="text"
              value={typeFields.bankName}
              onChange={(e) =>
                setTypeFields((s) => ({ ...s, bankName: e.target.value }))
              }
              required
              className="border border-gray-300 rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Account kind</span>
            <select
              name="accountKind"
              value={typeFields.accountKind}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  accountKind: e.target.value as (typeof ACCOUNT_KINDS)[number],
                }))
              }
              className="border border-gray-300 rounded px-2 py-1"
            >
              {ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {type === 'CREDIT' ? (
        <div className="flex flex-col gap-3 border-l-2 border-gray-200 pl-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Issuer</span>
            <input
              name="issuer"
              type="text"
              value={typeFields.issuer}
              onChange={(e) =>
                setTypeFields((s) => ({ ...s, issuer: e.target.value }))
              }
              required
              className="border border-gray-300 rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Credit limit (minor units, optional)</span>
            <input
              name="creditLimitMinor"
              type="number"
              min={0}
              value={typeFields.creditLimitMinor}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  creditLimitMinor: e.target.value,
                }))
              }
              className="border border-gray-300 rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Statement day (1-31, optional)</span>
            <input
              name="statementDay"
              type="number"
              min={1}
              max={31}
              value={typeFields.statementDay}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  statementDay: e.target.value,
                }))
              }
              className="border border-gray-300 rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Payment due day (1-31, optional)</span>
            <input
              name="paymentDueDay"
              type="number"
              min={1}
              max={31}
              value={typeFields.paymentDueDay}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  paymentDueDay: e.target.value,
                }))
              }
              className="border border-gray-300 rounded px-2 py-1"
            />
          </label>
        </div>
      ) : null}

      {type === 'INVESTMENT' ? (
        <div className="flex flex-col gap-3 border-l-2 border-gray-200 pl-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Broker</span>
            <input
              name="broker"
              type="text"
              value={typeFields.broker}
              onChange={(e) =>
                setTypeFields((s) => ({ ...s, broker: e.target.value }))
              }
              required
              className="border border-gray-300 rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Investment type</span>
            <select
              name="investmentType"
              value={typeFields.investmentType}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  investmentType: e.target.value as (typeof INVESTMENT_TYPES)[number],
                }))
              }
              className="border border-gray-300 rounded px-2 py-1"
            >
              {INVESTMENT_TYPES.map((it) => (
                <option key={it} value={it}>
                  {it}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {type === 'CRYPTO' ? (
        <div className="flex flex-col gap-3 border-l-2 border-gray-200 pl-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Wallet address (optional)</span>
            <input
              name="walletAddress"
              type="text"
              value={typeFields.walletAddress}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  walletAddress: e.target.value,
                }))
              }
              className="border border-gray-300 rounded px-2 py-1"
            />
          </label>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-2 border border-gray-300 rounded p-3">
        <legend className="text-sm px-1">Opening balance</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="openingBalanceMode"
            value="FRESH"
            checked={openingBalanceMode === 'FRESH'}
            onChange={() => {
              setOpeningBalanceMode('FRESH');
              setOpeningBalanceDate('');
            }}
          />
          <span>Fresh (balance starts at zero)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="openingBalanceMode"
            value="HISTORICAL"
            checked={openingBalanceMode === 'HISTORICAL'}
            onChange={() => setOpeningBalanceMode('HISTORICAL')}
          />
          <span>Historical (back-dated to a date)</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Amount (minor units, must be &gt;= 0)</span>
          <input
            name="openingBalanceMinor"
            type="number"
            min={0}
            value={openingBalanceMinor}
            onChange={(e) => setOpeningBalanceMinor(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1"
          />
        </label>
        {openingBalanceMode === 'HISTORICAL' ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm">Date (required when HISTORICAL)</span>
            <input
              name="openingBalanceDate"
              type="date"
              value={openingBalanceDate}
              onChange={(e) => setOpeningBalanceDate(e.target.value)}
              required
              className="border border-gray-300 rounded px-2 py-1"
            />
          </label>
        ) : null}
      </fieldset>

      {errorBanner ? (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 text-red-800 px-3 py-2"
        >
          {errorBanner}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded bg-blue-600 text-white px-3 py-1 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
