// @vitest-environment jsdom
/**
 * Tests for `TransactionDetailForms` — slice 3 T-UI-204 / T-UI-205.
 *
 * Per design §7.3 + §18 risk mitigation:
 * - Renders the production Card layout grouping fields into
 *   Identification / Amount / FX snapshot / Audit sections.
 * - The edit form (`FormField + Input + Select`) submits via
 *   the existing `updateTransactionServerAction` Server Action.
 * - The delete button opens a `Dialog` (Client Component) for
 *   confirm instead of `window.confirm()` (slice 5 hard guardrail
 *   #4).
 * - The FX snapshot section renders `fxAsOfSnapshot` +
 *   `casaSnapshot` as read-only fields; the spec requires the
 *   "Rate as of:" + casa labels to be visible on the detail page.
 * - Submitting with a memo-only change does NOT post the FX
 *   snapshot or the converted amount fields (REQ-TX-15 + BR-TX-12
 *   immutability constraint).
 *
 * The component is a Client Component (`'use client'`) so it
 * can host the form state. `useRouter` is stubbed because the
 * component uses it for the post-delete redirect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
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

import { TransactionDetailForms } from './transaction-detail-forms';
import type { TransactionWire } from '../../_lib/transaction-types';

const UPDATE_PATH = '/_actions/transactions-server-actions/updateTransactionServerAction';

// Smoke stub of the Server Action module so the import doesn't
// trigger Next.js' Server Action runtime during the test.
vi.mock('../../_actions/transactions-server-actions', () => ({
  __esModule: true,
  updateTransactionServerAction: vi.fn(async () => undefined),
  deleteTransactionServerAction: vi.fn(async () => undefined),
  createTransactionServerAction: vi.fn(async () => undefined),
}));

function makeTx(overrides: Partial<TransactionWire> = {}): TransactionWire {
  return {
    id: 'tx-12345678',
    userId: 'user-1',
    accountId: 'acc-1',
    direction: 'EXPENSE',
    amountMinor: 10000,
    currency: 'ARS',
    memo: 'Coffee at the cafe',
    category: 'food',
    transactionDate: '2026-06-15T00:00:00.000Z',
    convertedAmountMinor: 1000,
    convertedCurrency: 'USD',
    fxAsOfSnapshot: '2026-06-15T12:00:00.000Z',
    casaSnapshot: 'BLUE',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('TransactionDetailForms — Card layout', () => {
  it('renders a Card with the Identification, Amount, FX snapshot, and Audit sections', () => {
    render(<TransactionDetailForms id="tx-1" tx={makeTx()} />);
    // Each section is rendered as a labeled <section>/heading group.
    expect(screen.getByText(/identification/i)).toBeInTheDocument();
    expect(screen.getByText(/^amount/i)).toBeInTheDocument();
    expect(screen.getByText(/fx snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/^audit/i)).toBeInTheDocument();
  });

  it('renders the FX snapshot read-only fields (fxAsOfSnapshot + casaSnapshot)', () => {
    render(<TransactionDetailForms id="tx-1" tx={makeTx({ casaSnapshot: 'BLUE' })} />);
    // The "Rate as of" + "Casa" labels surface in the FX snapshot
    // section per design §18.
    expect(screen.getByText(/rate as of/i)).toBeInTheDocument();
    // The casa snapshot value renders as the read-only text.
    expect(screen.getByText('BLUE')).toBeInTheDocument();
  });
});

describe('TransactionDetailForms — edit form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a memo-only change WITHOUT the FX snapshot fields', async () => {
    const user = userEvent.setup();
    const { updateTransactionServerAction } = await import(
      '../../_actions/transactions-server-actions'
    );
    render(<TransactionDetailForms id="tx-1" tx={makeTx()} />);
    // The detail starts in view mode; click Edit to reveal the form.
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    // The edit form exposes the memo field via FormField + Input.
    const memoField = screen.getByLabelText(/^memo$/i) as HTMLInputElement;
    // Replace the memo value with fireEvent.change for a
    // synchronous commit.
    fireEvent.change(memoField, { target: { value: 'Updated memo' } });
    // Submit. The form's footer exposes a "Save" button.
    const save = screen.getByRole('button', { name: /^save$/i });
    await user.click(save);

    // The action receives the new memo in its FormData. React 19
    // resets uncontrolled forms on a successful action, so the
    // input reverts to `defaultValue`; we therefore assert the
    // mock's call args (the actual wire payload) instead of the
    // DOM value.
    expect(updateTransactionServerAction).toHaveBeenCalledTimes(1);
    const [callId, callFormData] = (updateTransactionServerAction as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(callId).toBe('tx-1');
    expect(callFormData).toBeInstanceOf(FormData);
    expect((callFormData as FormData).get('memo')).toBe('Updated memo');
    // FX snapshot fields are NOT on the form; the schema only accepts
    // memo + category, so the immutable constraint is enforced by the
    // Server Action schema, not by form-level filtering.
    expect((callFormData as FormData).get('fxAsOfSnapshot')).toBeNull();
  });
});

describe('TransactionDetailForms — delete confirmation uses Dialog (no window.confirm)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking Delete opens a Dialog with a Confirm button', async () => {
    const user = userEvent.setup();
    render(<TransactionDetailForms id="tx-1" tx={makeTx()} />);
    // No window.confirm stub is installed — asserting the absence of
    // its invocation is an implementation detail. Instead, assert
    // the Dialog primitive appears.
    const deleteBtn = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteBtn);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const dialogScope = within(dialog);
    expect(dialogScope.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(dialogScope.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('Escape closes the Dialog without invoking the delete action', async () => {
    const user = userEvent.setup();
    const { updateTransactionServerAction } = await import(
      '../../_actions/transactions-server-actions'
    );
    const { deleteTransactionServerAction } = await import(
      '../../_actions/transactions-server-actions'
    );
    render(<TransactionDetailForms id="tx-1" tx={makeTx()} />);
    const deleteBtn = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    // The delete action is NOT invoked when Escape closes the dialog.
    expect(deleteTransactionServerAction).not.toHaveBeenCalled();
    // `updateTransactionServerAction` is also not invoked.
    expect(updateTransactionServerAction).not.toHaveBeenCalled();
  });

  it('clicking the Dialog Confirm invokes the delete Server Action', async () => {
    const user = userEvent.setup();
    const { deleteTransactionServerAction } = await import(
      '../../_actions/transactions-server-actions'
    );
    render(<TransactionDetailForms id="tx-1" tx={makeTx()} />);
    const deleteBtn = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteBtn);
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: /confirm/i });
    await user.click(confirm);
    expect(deleteTransactionServerAction).toHaveBeenCalledTimes(1);
    expect(deleteTransactionServerAction).toHaveBeenCalledWith('tx-1');
    // Suppress unused-import warning for `UPDATE_PATH`: kept as a
    // documentation comment for the Server Action module URL.
    void UPDATE_PATH;
  });

  it('a rejected delete shows the in-dialog error AND keeps the Dialog open (FIX 4b)', async () => {
    const user = userEvent.setup();
    const { deleteTransactionServerAction } = await import(
      '../../_actions/transactions-server-actions'
    );
    // Mock the delete action to reject — simulates a 5xx from
    // the Server Action. Pre-FIX-4b, the `try/finally` closed
    // the Dialog regardless of outcome; post-FIX-4b, the error
    // surfaces inside the Dialog with role="alert" and the
    // Dialog stays open so the user can retry.
    (deleteTransactionServerAction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Delete failed (500)'),
    );
    render(<TransactionDetailForms id="tx-1" tx={makeTx()} />);
    const deleteBtn = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteBtn);
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: /confirm/i });
    await user.click(confirm);
    // The action was invoked exactly once.
    expect(deleteTransactionServerAction).toHaveBeenCalledTimes(1);
    expect(deleteTransactionServerAction).toHaveBeenCalledWith('tx-1');
    // The in-dialog alert surfaces the error.
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent(/Delete failed \(500\)/);
    // The Dialog is STILL OPEN — pre-FIX-4b, the `finally`
    // block closed it. Post-FIX-4b, the dialog stays mounted
    // so the user can retry without re-opening it.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The Confirm button is no longer in its loading state
    // (the failure path resolved, no retry in flight).
    expect(confirm).not.toBeDisabled();
  });

  it('a successful delete closes the Dialog AND does not surface an error (FIX 4b)', async () => {
    const user = userEvent.setup();
    const { deleteTransactionServerAction } = await import(
      '../../_actions/transactions-server-actions'
    );
    // Default mock resolves with `undefined` (success).
    render(<TransactionDetailForms id="tx-1" tx={makeTx()} />);
    const deleteBtn = screen.getByRole('button', { name: /^delete$/i });
    await user.click(deleteBtn);
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: /confirm/i });
    await user.click(confirm);
    // The dialog closes on success.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(deleteTransactionServerAction).toHaveBeenCalledTimes(1);
  });
});
