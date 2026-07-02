'use client';

/**
 * CreateAccountForm — production Client Component.
 *
 * Per design §7.3 + §6.5 + REQ-UI-5/6/7:
 * - FormField + Input + Select + FieldError + Button primitives
 *   compose the form. Every control has a paired `<label htmlFor>`
 *   (REQ-UI-5). The `FieldError` is wired via `aria-describedby`
 *   on the control (REQ-UI-6).
 * - mapApiErrorToFieldError maps API error codes to per-field
 *   errors per design §6.5 / BR-UI-5.
 * - Submit button renders Spinner + disabled + aria-busy="true"
 *   while the Server Action is in flight (REQ-UI-7).
 * - On 201, router.push to /accounts/<new-id> (BR-ACC-16).
 *
 * BR-ACC-15 (form-state discipline): the form's state is
 * local `useState` per field. The form MUST NOT hold the
 * session or any server-derived data in client state.
 *
 * The Server Component shell (the parent page) passes
 * nothing beyond the form's mount context.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../_ui/primitives/button';
import { Input } from '../../../_ui/primitives/input';
import { Select } from '../../../_ui/primitives/select';
import { FormField } from '../../../_ui/primitives/form-field';
import { mapApiErrorToFieldError, type FieldErrorMap } from '../../../_ui/_shared/map-api-error';
import {
  TYPES,
  CURRENCIES,
  ACCOUNT_KINDS,
  INVESTMENT_TYPES,
  CASAS,
  type AccountType,
  type AccountCurrency,
  type OpeningBalanceMode,
  type Casa,
  type AccountKind,
  type InvestmentType,
  parseAccountType,
  parseAccountCurrency,
  parseAccountKind,
  parseInvestmentType,
  parseCasaOrNull,
  parseOpeningBalanceMode,
} from './type-guards';

const EMPTY_TYPE_FIELDS: {
  bankName: string;
  accountKind: AccountKind;
  issuer: string;
  creditLimitMinor: string;
  statementDay: string;
  paymentDueDay: string;
  broker: string;
  investmentType: InvestmentType;
  walletAddress: string;
} = {
  bankName: '',
  accountKind: 'SAVINGS',
  issuer: '',
  creditLimitMinor: '',
  statementDay: '',
  paymentDueDay: '',
  broker: '',
  investmentType: 'STOCKS',
  walletAddress: '',
};

// Field names that mapApiErrorToFieldError can route errors to.
// Order matters: when the API returns a code we don't recognize,
// the helper falls back to the FIRST field in this list.
const FORM_FIELDS = [
  'name',
  'type',
  'currency',
  'casa',
  'openingBalanceMinor',
  'openingBalanceDate',
  'openingBalanceMode',
  'bankName',
  'accountKind',
  'issuer',
  'creditLimitMinor',
  'statementDay',
  'paymentDueDay',
  'broker',
  'investmentType',
  'walletAddress',
] as const;

export function CreateAccountForm(): React.JSX.Element {
  const router = useRouter();

  // Discriminated-union-driven form state (per BR-ACC-15).
  const [type, setType] = useState<AccountType>('BANK');
  const [name, setName] = useState<string>('');
  const [currency, setCurrency] = useState<AccountCurrency>('USD');
  const [openingBalanceMinor, setOpeningBalanceMinor] = useState<string>('0');
  const [openingBalanceMode, setOpeningBalanceMode] = useState<OpeningBalanceMode>('FRESH');
  const [openingBalanceDate, setOpeningBalanceDate] = useState<string>('');
  const [typeFields, setTypeFields] = useState(EMPTY_TYPE_FIELDS);
  // `null` means "inherit the global default" and maps to
  // casa = NULL in the request body (REQ-FX-9).
  const [casa, setCasa] = useState<Casa | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // BR-ACC-16: silent reset on type change.
  function onTypeChange(next: AccountType) {
    setType(next);
    setTypeFields(EMPTY_TYPE_FIELDS);
    // Clear any bankName/accountKind/... field errors so the
    // user is not stuck with a stale validation message from
    // the previous type.
    setFieldErrors((prev) => {
      const next: FieldErrorMap = {};
      for (const [k, v] of Object.entries(prev)) {
        if (
          !k.startsWith('bank') &&
          !k.startsWith('account') &&
          !k.startsWith('issuer') &&
          !k.startsWith('credit') &&
          !k.startsWith('statement') &&
          !k.startsWith('payment') &&
          !k.startsWith('broker') &&
          !k.startsWith('investment') &&
          !k.startsWith('wallet')
        ) {
          next[k] = v;
        }
      }
      return next;
    });
  }

  const openingBalanceIsValid = Number(openingBalanceMinor) >= 0;
  const canSubmit =
    !submitting &&
    name.trim().length > 0 &&
    name.trim().length <= 80 &&
    openingBalanceIsValid &&
    (openingBalanceMode === 'FRESH' || openingBalanceDate.length > 0);

  function lookupError(field: string): string | undefined {
    return fieldErrors[field];
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFieldErrors({});
    setErrorBanner(null);

    const body: Record<string, unknown> = {
      type,
      name: name.trim(),
      currency,
      openingBalanceMinor: Number(openingBalanceMinor),
      openingBalanceMode,
      openingBalanceDate: openingBalanceMode === 'HISTORICAL' ? openingBalanceDate : null,
    };
    if (casa !== null) {
      body['casa'] = casa;
    }

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
        const payload = (await res.json().catch(() => null)) as { data?: { id?: unknown } } | null;
        const newId = typeof payload?.data?.id === 'string' ? payload.data.id : null;
        if (newId) {
          router.push(`/accounts/${newId}`);
        } else {
          router.push('/accounts?toast=account-created');
        }
        return;
      }
      // 4xx: map the error envelope to field errors.
      const errBody = (await res.json().catch(() => null)) as {
        error?: { code: unknown; message: unknown };
      } | null;
      const errCode =
        errBody?.error && typeof errBody.error.code === 'string' ? errBody.error.code : null;
      const errMessage =
        errBody?.error && typeof errBody.error.message === 'string' ? errBody.error.message : null;
      if (errBody?.error && errCode && errMessage) {
        if (errCode === 'VALIDATION_ERROR') {
          // Surface a banner; the per-field mapping happens
          // server-side in a follow-up.
          setErrorBanner(errMessage);
        } else {
          const mapped = mapApiErrorToFieldError(
            { error: { code: errCode, message: errMessage } },
            FORM_FIELDS,
          );
          setFieldErrors(mapped);
          setErrorBanner(errMessage);
        }
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
      <FormField id="type" label="Type">
        <Select
          id="type"
          options={TYPES.map((t) => ({ value: t, label: t }))}
          value={type}
          onChange={(e) => onTypeChange(parseAccountType(e.target.value, type))}
        />
      </FormField>

      <FormField id="name" label="Name" required error={lookupError('name')}>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          aria-invalid={lookupError('name') ? 'true' : undefined}
        />
      </FormField>

      <FormField id="currency" label="Currency" error={lookupError('currency')}>
        <Select
          id="currency"
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={currency}
          onChange={(e) => setCurrency(parseAccountCurrency(e.target.value, currency))}
          aria-invalid={lookupError('currency') ? 'true' : undefined}
        />
      </FormField>

      {/* REQ-FX-9 — Per-account casa selection. */}
      <FormField
        id="casa"
        label="FX casa (optional)"
        description="Pick a non-default casa to override the global quote source. Leave as Default to inherit."
      >
        <Select
          id="casa"
          options={[
            { value: '', label: 'Default (oficial)' },
            ...CASAS.map((c) => ({ value: c, label: c })),
          ]}
          value={casa ?? ''}
          onChange={(e) => setCasa(parseCasaOrNull(e.target.value))}
        />
      </FormField>

      {type === 'BANK' ? (
        <div className="flex flex-col gap-ui-space-3 border-l-2 border-ui-border pl-ui-space-3">
          <FormField id="bankName" label="Bank name" required error={lookupError('bankName')}>
            <Input
              id="bankName"
              type="text"
              value={typeFields.bankName}
              onChange={(e) => setTypeFields((s) => ({ ...s, bankName: e.target.value }))}
              required
              aria-invalid={lookupError('bankName') ? 'true' : undefined}
            />
          </FormField>
          <FormField id="accountKind" label="Account kind">
            <Select
              id="accountKind"
              options={ACCOUNT_KINDS.map((k) => ({ value: k, label: k }))}
              value={typeFields.accountKind}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  accountKind: parseAccountKind(e.target.value, s.accountKind),
                }))
              }
            />
          </FormField>
        </div>
      ) : null}

      {type === 'CREDIT' ? (
        <div className="flex flex-col gap-ui-space-3 border-l-2 border-ui-border pl-ui-space-3">
          <FormField id="issuer" label="Issuer" required error={lookupError('issuer')}>
            <Input
              id="issuer"
              type="text"
              value={typeFields.issuer}
              onChange={(e) => setTypeFields((s) => ({ ...s, issuer: e.target.value }))}
              required
              aria-invalid={lookupError('issuer') ? 'true' : undefined}
            />
          </FormField>
          <FormField id="creditLimitMinor" label="Credit limit (minor units, optional)">
            <Input
              id="creditLimitMinor"
              type="number"
              min={0}
              value={typeFields.creditLimitMinor}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  creditLimitMinor: e.target.value,
                }))
              }
            />
          </FormField>
          <FormField id="statementDay" label="Statement day (1-31, optional)">
            <Input
              id="statementDay"
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
            />
          </FormField>
          <FormField id="paymentDueDay" label="Payment due day (1-31, optional)">
            <Input
              id="paymentDueDay"
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
            />
          </FormField>
        </div>
      ) : null}

      {type === 'INVESTMENT' ? (
        <div className="flex flex-col gap-ui-space-3 border-l-2 border-ui-border pl-ui-space-3">
          <FormField id="broker" label="Broker" required>
            <Input
              id="broker"
              type="text"
              value={typeFields.broker}
              onChange={(e) => setTypeFields((s) => ({ ...s, broker: e.target.value }))}
              required
            />
          </FormField>
          <FormField id="investmentType" label="Investment type">
            <Select
              id="investmentType"
              options={INVESTMENT_TYPES.map((it) => ({ value: it, label: it }))}
              value={typeFields.investmentType}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  investmentType: parseInvestmentType(e.target.value, s.investmentType),
                }))
              }
            />
          </FormField>
        </div>
      ) : null}

      {type === 'CRYPTO' ? (
        <div className="flex flex-col gap-ui-space-3 border-l-2 border-ui-border pl-ui-space-3">
          <FormField id="walletAddress" label="Wallet address (optional)">
            <Input
              id="walletAddress"
              type="text"
              value={typeFields.walletAddress}
              onChange={(e) =>
                setTypeFields((s) => ({
                  ...s,
                  walletAddress: e.target.value,
                }))
              }
            />
          </FormField>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-ui-space-2 rounded-ui-md border border-ui-border p-ui-space-3">
        <legend className="px-ui-space-1 text-ui-text-sm font-ui-font-medium text-ui-fg">
          Opening balance
        </legend>
        <FormField id="openingBalanceMode" label="Mode">
          <Select
            id="openingBalanceMode"
            options={[
              { value: 'FRESH', label: 'Fresh (balance starts at zero)' },
              { value: 'HISTORICAL', label: 'Historical (back-dated to a date)' },
            ]}
            value={openingBalanceMode}
            onChange={(e) => {
              const v = parseOpeningBalanceMode(e.target.value, openingBalanceMode);
              setOpeningBalanceMode(v);
              if (v === 'FRESH') setOpeningBalanceDate('');
            }}
          />
        </FormField>
        <FormField
          id="openingBalanceMinor"
          label="Amount (minor units, must be >= 0)"
          error={lookupError('openingBalanceMinor')}
        >
          <Input
            id="openingBalanceMinor"
            name="openingBalanceMinor"
            type="number"
            min={0}
            value={openingBalanceMinor}
            onChange={(e) => setOpeningBalanceMinor(e.target.value)}
            aria-invalid={lookupError('openingBalanceMinor') ? 'true' : undefined}
          />
        </FormField>
        {openingBalanceMode === 'HISTORICAL' ? (
          <FormField
            id="openingBalanceDate"
            label="Date (required when HISTORICAL)"
            error={lookupError('openingBalanceDate')}
          >
            <Input
              id="openingBalanceDate"
              type="date"
              value={openingBalanceDate}
              onChange={(e) => setOpeningBalanceDate(e.target.value)}
              required
              aria-invalid={lookupError('openingBalanceDate') ? 'true' : undefined}
            />
          </FormField>
        ) : null}
      </fieldset>

      {errorBanner ? (
        <div
          role="alert"
          className="rounded-ui-md border border-ui-danger bg-ui-danger/10 px-ui-space-3 py-ui-space-2 text-ui-text-sm text-ui-danger"
        >
          {errorBanner}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" isLoading={submitting} disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create account'}
        </Button>
      </div>
    </form>
  );
}
