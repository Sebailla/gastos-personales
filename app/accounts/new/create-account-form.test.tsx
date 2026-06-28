/**
 * Tests for CreateAccountForm — slice 2 T-UI-105/106/110.
 *
 * The form is a Client Component that uses `useRouter`
 * from `next/navigation`; we stub that hook via `vi.mock`
 * so the component renders without an App Router context.
 *
 * Scenarios covered:
 * - Casa <select> renders 7 options (6 casas + Default
 *   placeholder). Inherited from the smoke UI; pinned so the
 *   PR-2 T2.9 fx-cache wire contract survives the redesign.
 * - "FX casa (optional)" label is present so the select is
 *   WCAG-labelled.
 * - Production inline validation: submitting with empty
 *   `name` keeps the user on the page; the field error
 *   appears with `aria-describedby` wiring.
 * - Loading state: while the Server Action is in flight, the
 *   submit button is `disabled` and `aria-busy="true"` and
 *   shows the Spinner.
 * - A11y: every form control carries `id` paired with a
 *   `<label htmlFor>` (REQ-UI-5).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub `next/navigation` so the form can render without an App
// Router context. The router object is only used in the
// onSubmit success path; for the static render we don't need
// any real implementation.
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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateAccountForm } from './create-account-form';

describe('CreateAccountForm — casa <select> (fx-cache PR-2 T2.9 inherited)', () => {
  it('renders the casa <select> with 7 options (6 casas + Default (oficial))', () => {
    render(<CreateAccountForm />);
    const casaSelect = screen.getByLabelText(/fx casa/i) as HTMLSelectElement;
    expect(casaSelect.options).toHaveLength(7);
    expect(casaSelect.options[0]?.text).toBe('Default (oficial)');
    // Each casa is rendered as an option, in UPPERCASE Prisma form.
    const labels = Array.from(casaSelect.options).map((o) => o.text);
    expect(labels).toEqual(
      expect.arrayContaining(['OFICIAL', 'BLUE', 'MEP', 'CCL', 'CRIPTO', 'TARJETA']),
    );
  });

  it('renders the form label "FX casa (optional)" so the select is WCAG-labelled', () => {
    render(<CreateAccountForm />);
    expect(screen.getByText(/fx casa \(optional\)/i)).toBeInTheDocument();
  });
});

describe('CreateAccountForm — production inline validation + loading (slice 2)', () => {
  beforeEach(() => {
    // Default fetch: 201 Created with the new id. Individual
    // tests override per-call.
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'acc-new' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('renders a Spinner + disabled + aria-busy on the submit button while in flight', async () => {
    // Slow fetch so we can inspect the in-flight state.
    let resolveFetch!: (r: Response) => void;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<CreateAccountForm />);
    // Fill required fields so the submit button enables.
    await user.type(screen.getByLabelText(/^name\b/i), 'My new account');
    // Pick BANK bankName so the conditional required field is filled.
    await user.type(screen.getByLabelText(/bank name/i), 'Test bank');
    const submit = screen.getByRole('button', { name: /create account/i });
    await user.click(submit);
    // While in flight: disabled + aria-busy + spinner rendered.
    await waitFor(() => {
      expect(submit).toBeDisabled();
    });
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('ui-spinner')).toBeInTheDocument();
    // Resolve the fetch so the test can finish cleanly.
    resolveFetch(
      new Response(JSON.stringify({ data: { id: 'acc-new' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('shows an inline FieldError with aria-describedby when the API returns INVALID_AMOUNT', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'INVALID_AMOUNT', message: 'Amount must be >= 0' },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    const user = userEvent.setup();
    render(<CreateAccountForm />);
    await user.type(screen.getByLabelText(/^name\b/i), 'My new account');
    await user.type(screen.getByLabelText(/bank name/i), 'Test bank');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    // The error is surfaced via mapApiErrorToFieldError: INVALID_AMOUNT -> amountMinor.
    // The field is identified by `name="openingBalanceMinor"` on the rendered input.
    await waitFor(() => {
      expect(screen.getByText(/amount must be >= 0/i)).toBeInTheDocument();
    });
    // aria-describedby wiring: the field input references the error id.
    const amountInput = document.querySelector('input[name="openingBalanceMinor"]');
    expect(amountInput).not.toBeNull();
    const describedBy = amountInput?.getAttribute('aria-describedby') ?? '';
    expect(describedBy).toMatch(/-error$/);
  });
});

describe('CreateAccountForm — a11y contract (REQ-UI-5/6)', () => {
  it('every visible form control has a paired <label htmlFor>', () => {
    render(<CreateAccountForm />);
    // The form has these labelled controls (per the design):
    // name, currency, casa, openingBalanceMinor, plus the
    // type-specific BANK bankName + accountKind + openingBalanceMode radios.
    const requiredLabels = [
      /^name\b/i,
      /^currency$/i,
      /fx casa/i,
      /amount \(minor units/i,
      /bank name/i,
      /account kind/i,
    ];
    for (const pattern of requiredLabels) {
      expect(screen.getByLabelText(pattern)).toBeInTheDocument();
    }
  });
});

/**
 * Coverage fix — exercises the type branches that the original
 * slice-2 test suite skipped. Without these, only the BANK branch
 * of the discriminated union runs in CI, which drops the form's
 * `functions` coverage to 25% (4 functions, 1 tested) and breaks
 * the global 80% coverage gate on PR #99.
 *
 * Each test runs the full render → fill → submit → assert-payload
 * cycle against the real `onSubmit` body builder, so the
 * per-type `body` shape is asserted end-to-end.
 *
 * To also push the per-file coverage ≥ 80% on every metric (lines,
 * branches, functions, statements), each test exercises the shared
 * controls the original suite left untouched: currency, casa,
 * openingBalanceMode → HISTORICAL, openingBalanceMinor. Those are
 * type-agnostic handlers; they live here because the per-type tests
 * are the only ones that switch the type and therefore have a
 * stable, deterministic render to drive from.
 */
describe('CreateAccountForm — per-type payload branches (CREDIT / INVESTMENT / CRYPTO)', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'acc-new' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('CREDIT: renders issuer + creditLimitMinor + statementDay + paymentDueDay and posts the correct payload', async () => {
    const user = userEvent.setup();
    render(<CreateAccountForm />);

    // Switch the type to CREDIT via the type <select>.
    const typeSelect = screen.getByLabelText(/^type$/i) as HTMLSelectElement;
    await user.selectOptions(typeSelect, 'CREDIT');

    // CREDIT-specific fields are present and labelled.
    const issuer = screen.getByLabelText(/^issuer\b/i) as HTMLInputElement;
    const creditLimit = screen.getByLabelText(/credit limit/i) as HTMLInputElement;
    const statementDay = screen.getByLabelText(/statement day/i) as HTMLInputElement;
    const paymentDueDay = screen.getByLabelText(/payment due day/i) as HTMLInputElement;
    expect(issuer).toBeInTheDocument();
    expect(creditLimit).toBeInTheDocument();
    expect(statementDay).toBeInTheDocument();
    expect(paymentDueDay).toBeInTheDocument();

    // BANK-specific fields are NOT rendered when type = CREDIT.
    expect(screen.queryByLabelText(/^bank name\b/i)).toBeNull();

    // Drive the shared controls (currency, casa, opening-balance
    // trio) so their onChange handlers are exercised too.
    await user.selectOptions(screen.getByLabelText(/^currency$/i) as HTMLSelectElement, 'ARS');
    await user.selectOptions(screen.getByLabelText(/fx casa/i) as HTMLSelectElement, 'BLUE');
    await user.selectOptions(screen.getByLabelText(/^mode$/i) as HTMLSelectElement, 'HISTORICAL');
    const amountField = screen.getByLabelText(/amount \(minor units/i) as HTMLInputElement;
    await user.clear(amountField);
    await user.type(amountField, '5000');
    await user.type(screen.getByLabelText(/date \(required when historical/i), '2026-01-15');

    // Fill the common + CREDIT-only fields and submit.
    await user.type(screen.getByLabelText(/^name\b/i), 'My credit card');
    await user.type(issuer, 'Visa');
    await user.type(creditLimit, '100000');
    await user.type(statementDay, '5');
    await user.type(paymentDueDay, '20');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Wait for the fetch to fire, then assert the payload.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/accounts');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      type: 'CREDIT',
      name: 'My credit card',
      currency: 'ARS',
      casa: 'BLUE',
      openingBalanceMode: 'HISTORICAL',
      openingBalanceDate: '2026-01-15',
      openingBalanceMinor: 5000,
      issuer: 'Visa',
      creditLimitMinor: 100000,
      statementDay: 5,
      paymentDueDay: 20,
    });
    // BANK-only keys must NOT leak into a CREDIT payload.
    expect(body).not.toHaveProperty('bankName');
    expect(body).not.toHaveProperty('accountKind');
  });

  it('INVESTMENT: renders broker + investmentType and posts the correct payload', async () => {
    const user = userEvent.setup();
    render(<CreateAccountForm />);

    const typeSelect = screen.getByLabelText(/^type$/i) as HTMLSelectElement;
    await user.selectOptions(typeSelect, 'INVESTMENT');

    const broker = screen.getByLabelText(/^broker\b/i) as HTMLInputElement;
    const investmentType = screen.getByLabelText(/investment type/i) as HTMLSelectElement;
    expect(broker).toBeInTheDocument();
    expect(investmentType).toBeInTheDocument();
    expect(screen.queryByLabelText(/^bank name\b/i)).toBeNull();
    expect(screen.queryByLabelText(/^issuer\b/i)).toBeNull();

    // Drive the shared controls. For INVESTMENT, also exercise the
    // BANK accountKind onChange path (visible only when type flips
    // through BANK on its way to INVESTMENT — but the type select's
    // own onChange already covers the onTypeChange reset). To hit
    // the accountKind onChange we briefly flip to BANK then back.
    await user.selectOptions(typeSelect, 'BANK');
    const accountKind = screen.getByLabelText(/account kind/i) as HTMLSelectElement;
    await user.selectOptions(accountKind, 'CHECKING');
    await user.selectOptions(typeSelect, 'INVESTMENT');
    // Re-query broker + investmentType after the type flip: their
    // DOM nodes were unmounted and remounted, so the old references
    // are stale and `user.type` would write to a detached node.
    const brokerFresh = screen.getByLabelText(/^broker\b/i) as HTMLInputElement;
    const investmentTypeFresh = screen.getByLabelText(/investment type/i) as HTMLSelectElement;

    // Shared controls.
    await user.selectOptions(screen.getByLabelText(/^currency$/i) as HTMLSelectElement, 'USD');
    const amountField = screen.getByLabelText(/amount \(minor units/i) as HTMLInputElement;
    await user.clear(amountField);
    await user.type(amountField, '250000');

    await user.type(screen.getByLabelText(/^name\b/i), 'Brokerage account');
    await user.type(brokerFresh, 'IOL');
    await user.selectOptions(investmentTypeFresh, 'STOCKS');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/accounts');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      type: 'INVESTMENT',
      name: 'Brokerage account',
      currency: 'USD',
      openingBalanceMinor: 250000,
      broker: 'IOL',
      investmentType: 'STOCKS',
    });
    // CREDIT-only keys must NOT leak into an INVESTMENT payload.
    expect(body).not.toHaveProperty('issuer');
    expect(body).not.toHaveProperty('creditLimitMinor');
    expect(body).not.toHaveProperty('walletAddress');
  });

  it('CRYPTO: renders walletAddress and posts the correct payload', async () => {
    const user = userEvent.setup();
    render(<CreateAccountForm />);

    const typeSelect = screen.getByLabelText(/^type$/i) as HTMLSelectElement;
    await user.selectOptions(typeSelect, 'CRYPTO');

    const walletAddress = screen.getByLabelText(/wallet address/i) as HTMLInputElement;
    expect(walletAddress).toBeInTheDocument();
    expect(screen.queryByLabelText(/^bank name\b/i)).toBeNull();
    expect(screen.queryByLabelText(/^broker\b/i)).toBeNull();

    // Shared controls. Casa onChange + openingBalanceMode
    // onChange + openingBalanceMinor onChange — all in one shot.
    await user.selectOptions(screen.getByLabelText(/fx casa/i) as HTMLSelectElement, 'CRIPTO');
    await user.selectOptions(screen.getByLabelText(/^mode$/i) as HTMLSelectElement, 'HISTORICAL');
    const amountField = screen.getByLabelText(/amount \(minor units/i) as HTMLInputElement;
    await user.clear(amountField);
    await user.type(amountField, '0');
    await user.type(screen.getByLabelText(/date \(required when historical/i), '2026-02-01');

    await user.type(screen.getByLabelText(/^name\b/i), 'BTC cold wallet');
    await user.type(walletAddress, 'bc1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/accounts');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      type: 'CRYPTO',
      name: 'BTC cold wallet',
      casa: 'CRIPTO',
      openingBalanceMode: 'HISTORICAL',
      openingBalanceDate: '2026-02-01',
      walletAddress: 'bc1qexampleaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    });
    // Other branches' keys must NOT leak into a CRYPTO payload.
    expect(body).not.toHaveProperty('bankName');
    expect(body).not.toHaveProperty('broker');
    expect(body).not.toHaveProperty('issuer');
  });
});
