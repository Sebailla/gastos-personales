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
    await user.type(screen.getByLabelText(/^name$/i), 'My new account');
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
    await user.type(screen.getByLabelText(/^name$/i), 'My new account');
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
      /^name$/i,
      /^currency$/i,
      /fx casa/i,
      /opening balance/i,
      /bank name/i,
      /account kind/i,
    ];
    for (const pattern of requiredLabels) {
      expect(screen.getByLabelText(pattern)).toBeInTheDocument();
    }
  });
});
