// @vitest-environment jsdom
/**
 * Tests for `CreateTransactionForm` — slice 3 T-UI-206 / T-UI-207.
 *
 * Coverage gate (slice 2 lesson learned — per the orchestrator's
 * prompt): the form has 2 direction branches (INCOME / EXPENSE).
 * Both branches MUST have tests in this slice, or the global
 * `functions` coverage drops below 80% and the CI gate fails
 * (the same way it failed slice 2's `CreateAccountForm`).
 *
 * The test covers:
 * (1) empty accounts list renders the Combobox empty-state UX.
 * (2) Combobox renders one `<option>` per account option.
 * (3) INCOME direction — submitting posts `direction: 'INCOME'`
 *     and the success-path body shape is correct.
 * (4) EXPENSE direction — submitting posts `direction: 'EXPENSE'`
 *     and the success-path body shape is correct.
 * (5) INVALID_AMOUNT surfaces an inline FieldError on `amountMinor`.
 * (6) FUTURE_DATE_NOT_ALLOWED surfaces an inline FieldError on
 *     `transactionDate`.
 * (7) ACCOUNT_ARCHIVED surfaces an inline FieldError on `accountId`.
 * (8) Loading state — while the API is in flight, the submit button
 *     renders `aria-busy="true"` + Spinner + disabled.
 *
 * The form is a Client Component (`'use client'`) and uses
 * `useRouter`; that hook is stubbed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  }),
}));

import { CreateTransactionForm } from './create-transaction-form';

const ACCOUNT_USD = {
  id: 'acc-usd-1',
  name: 'Brokerage USD',
  currency: 'USD',
};
const ACCOUNT_ARS = {
  id: 'acc-ars-1',
  name: 'Main ARS',
  currency: 'ARS',
};

// Stub `global.fetch` per test (the form is API-first; no Server
// Action for the production Client form).
function mockJsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CreateTransactionForm — Combobox accounts population', () => {
  it('renders the Combobox with the empty-state message when accounts is empty', () => {
    render(<CreateTransactionForm accounts={[]} />);
    // The Combobox search input has aria-label="Account" so users
    // with screen readers can locate it. Empty accounts produce no
    // <option> in the hidden <select>; the helper text surfaces.
    // Select the input by role+name (combobox role -> searchbox).
    const accountInput = screen.getByRole('searchbox', { name: /account/i });
    expect(accountInput).toBeInTheDocument();
    // The empty-state helper text is also rendered.
    expect(screen.getByText(/no accounts yet/i)).toBeInTheDocument();
  });

  it('renders one <option> per account option in the account Combobox <select>', () => {
    render(<CreateTransactionForm accounts={[ACCOUNT_ARS, ACCOUNT_USD]} />);
    // The Combobox wraps a <select> for screen-reader semantics
    // (searchable combobox role per design §3.2.8). The <select>
    // has id `account-search-select` (the Combobox primitive
    // appends `-select` to the parent id).
    const select = document.querySelector(
      'select#account-search-select',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select!.options).toHaveLength(2);
    // Each account renders as `<name> (<currency>)`.
    const labels = Array.from(select!.options).map((o) => o.text);
    expect(labels).toEqual(expect.arrayContaining(['Main ARS (ARS)', 'Brokerage USD (USD)']));
  });
});

describe('CreateTransactionForm — INCOME direction (BR-UI-2 type branches, slice 2 lesson)', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockJsonResponse({ data: { id: 'tx-new' } }));
  });

  it('submits an INCOME transaction with the correct payload shape', async () => {
    const user = userEvent.setup();
    render(<CreateTransactionForm accounts={[ACCOUNT_USD]} />);

    // Pick the account.
    const accountSelect = document.querySelector(
      'select#account-search-select',
    ) as HTMLSelectElement;
    await user.selectOptions(accountSelect, ACCOUNT_USD.id);

    // Direction = INCOME.
    const directionSelect = screen.getByLabelText(/^direction/i) as HTMLSelectElement;
    await user.selectOptions(directionSelect, 'INCOME');

    // Amount.
    const amountInput = screen.getByLabelText(/^amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '5000' } });

    // Original currency.
    const currencySelect = screen.getByLabelText(/original currency/i) as HTMLSelectElement;
    await user.selectOptions(currencySelect, 'USD');

    // Date.
    const dateInput = screen.getByLabelText(/transaction date/i) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-06-15T12:00' } });

    // Submit.
    await user.click(screen.getByRole('button', { name: /create transaction/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/transactions');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      accountId: ACCOUNT_USD.id,
      direction: 'INCOME',
      amountMinor: 5000,
      originalCurrency: 'USD',
    });
    expect(body.transactionDate).toBeDefined();
  });
});

describe('CreateTransactionForm — EXPENSE direction (BR-UI-2 type branches, slice 2 lesson)', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockJsonResponse({ data: { id: 'tx-new' } }));
  });

  it('submits an EXPENSE transaction with the correct payload shape', async () => {
    const user = userEvent.setup();
    render(<CreateTransactionForm accounts={[ACCOUNT_ARS]} />);

    const accountSelect = document.querySelector(
      'select#account-search-select',
    ) as HTMLSelectElement;
    await user.selectOptions(accountSelect, ACCOUNT_ARS.id);

    const directionSelect = screen.getByLabelText(/^direction/i) as HTMLSelectElement;
    await user.selectOptions(directionSelect, 'EXPENSE');

    const amountInput = screen.getByLabelText(/^amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '12345' } });

    const currencySelect = screen.getByLabelText(/original currency/i) as HTMLSelectElement;
    await user.selectOptions(currencySelect, 'ARS');

    const dateInput = screen.getByLabelText(/transaction date/i) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-06-15T08:00' } });

    await user.click(screen.getByRole('button', { name: /create transaction/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      accountId: ACCOUNT_ARS.id,
      direction: 'EXPENSE',
      amountMinor: 12345,
      originalCurrency: 'ARS',
    });
  });
});

describe('CreateTransactionForm — inline validation', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockJsonResponse({ data: { id: 'tx-new' } }));
  });

  it('surfaces an inline FieldError on amountMinor when the API returns INVALID_AMOUNT', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse(
        {
          error: { code: 'INVALID_AMOUNT', message: 'Amount must be > 0' },
        },
        400,
      ),
    );
    const user = userEvent.setup();
    render(<CreateTransactionForm accounts={[ACCOUNT_ARS]} />);
    const accountSelect = document.querySelector(
      'select#account-search-select',
    ) as HTMLSelectElement;
    await user.selectOptions(accountSelect, ACCOUNT_ARS.id);
    const directionSelect = screen.getByLabelText(/^direction/i) as HTMLSelectElement;
    await user.selectOptions(directionSelect, 'INCOME');
    // Use a value that the CLIENT accepts (>0) but the API rejects.
    // We force the click via the submit button (which may still be
    // enabled since 100 > 0).
    const amountInput = screen.getByLabelText(/^amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '100' } });
    const currencySelect = screen.getByLabelText(/original currency/i) as HTMLSelectElement;
    await user.selectOptions(currencySelect, 'ARS');
    const dateInput = screen.getByLabelText(/transaction date/i) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-06-15T08:00' } });

    await user.click(screen.getByRole('button', { name: /create transaction/i }));

    // The FieldError primitive renders role=alert inside the
    // FormField; we assert by id to avoid matching the global
    // errorBanner's role="alert" too.
    await waitFor(() => {
      expect(document.getElementById('amountMinor-error')).toHaveTextContent(/amount must be > 0/i);
    });
  });

  it('surfaces an inline FieldError on transactionDate when the API returns FUTURE_DATE_NOT_ALLOWED', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse(
        {
          error: { code: 'FUTURE_DATE_NOT_ALLOWED', message: 'Date cannot be in the future' },
        },
        400,
      ),
    );
    const user = userEvent.setup();
    render(<CreateTransactionForm accounts={[ACCOUNT_ARS]} />);
    const accountSelect = document.querySelector(
      'select#account-search-select',
    ) as HTMLSelectElement;
    await user.selectOptions(accountSelect, ACCOUNT_ARS.id);
    const directionSelect = screen.getByLabelText(/^direction/i) as HTMLSelectElement;
    await user.selectOptions(directionSelect, 'INCOME');
    const amountInput = screen.getByLabelText(/^amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '1000' } });
    const currencySelect = screen.getByLabelText(/original currency/i) as HTMLSelectElement;
    await user.selectOptions(currencySelect, 'ARS');
    const dateInput = screen.getByLabelText(/transaction date/i) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2099-01-01T08:00' } });

    await user.click(screen.getByRole('button', { name: /create transaction/i }));

    await waitFor(() => {
      expect(document.getElementById('transactionDate-error')).toHaveTextContent(
        /cannot be in the future/i,
      );
    });
  });

  it('surfaces an inline FieldError on accountId when the API returns ACCOUNT_ARCHIVED', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse(
        {
          error: { code: 'ACCOUNT_ARCHIVED', message: 'Account is archived' },
        },
        400,
      ),
    );
    const user = userEvent.setup();
    render(<CreateTransactionForm accounts={[ACCOUNT_ARS]} />);
    const accountSelect = document.querySelector(
      'select#account-search-select',
    ) as HTMLSelectElement;
    await user.selectOptions(accountSelect, ACCOUNT_ARS.id);
    const directionSelect = screen.getByLabelText(/^direction/i) as HTMLSelectElement;
    await user.selectOptions(directionSelect, 'EXPENSE');
    const amountInput = screen.getByLabelText(/^amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '500' } });
    const currencySelect = screen.getByLabelText(/original currency/i) as HTMLSelectElement;
    await user.selectOptions(currencySelect, 'ARS');
    const dateInput = screen.getByLabelText(/transaction date/i) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-06-15T08:00' } });

    await user.click(screen.getByRole('button', { name: /create transaction/i }));

    // The account FormField has id="account-search"; the
    // FormField's FieldError shares that scope (id = `account-search-error`).
    await waitFor(() => {
      expect(document.getElementById('account-search-error')).toHaveTextContent(
        /account is archived/i,
      );
    });
  });
});

describe('CreateTransactionForm — loading state (REQ-UI-7)', () => {
  it('renders Spinner + disabled + aria-busy on the submit button while in flight', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<CreateTransactionForm accounts={[ACCOUNT_ARS]} />);
    const accountSelect = document.querySelector(
      'select#account-search-select',
    ) as HTMLSelectElement;
    await user.selectOptions(accountSelect, ACCOUNT_ARS.id);
    const directionSelect = screen.getByLabelText(/^direction/i) as HTMLSelectElement;
    await user.selectOptions(directionSelect, 'INCOME');
    const amountInput = screen.getByLabelText(/^amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '1000' } });
    const currencySelect = screen.getByLabelText(/original currency/i) as HTMLSelectElement;
    await user.selectOptions(currencySelect, 'ARS');
    const dateInput = screen.getByLabelText(/transaction date/i) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-06-15T08:00' } });

    const submit = screen.getByRole('button', { name: /create transaction/i });
    await user.click(submit);

    await waitFor(() => {
      expect(submit).toBeDisabled();
    });
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('ui-spinner')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    resolveFetch(mockJsonResponse({ data: { id: 'tx-new' } }));
  });
});
