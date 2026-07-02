'use client';

/**
 * TransactionDetailForms — Client Component production render.
 *
 * Per design §7.3 + §18 risk mitigation:
 * - Card layout groups the wire fields into four sections:
 *   Identification (id + transactionDate + direction),
 *   Amount (amountMinor + currency + memo + category),
 *   FX snapshot (fxAsOfSnapshot + casaSnapshot — read-only
 *   per the immutability constraint), and Audit
 *   (createdAt + updatedAt).
 * - The edit form exposes `memo` + `category` for edit
 *   (per the slice-3 server-action update schema in
 *   `_actions/transactions-server-actions.ts` — only those
 *   two fields are open for edit; `amountMinor` and the FX
 *   snapshot stay immutable per REQ-TX-15 + the design
 *   §18 audit-trail rule).
 * - Submitting the edit form calls the existing
 *   `updateTransactionServerAction` Server Action.
 * - The Delete button opens a `Dialog` (Client Component
 *   from the slice-1 primitives) for confirm instead of
 *   `window.confirm()` (the slice-5 hard guardrail #4 says
 *   no native confirm dialogs). The Dialog exposes Confirm
 *   + Cancel; Cancel + Escape both dismiss without invoking
 *   the delete action.
 *
 * Accessibility (REQ-UI-7):
 * - The edit form uses `FormField` + `Input` primitives
 *   (each label is paired with its input via htmlFor).
 * - The Delete button is keyboard-focusable; the Dialog
 *   traps focus (handled by the primitive) and Escape
 *   closes.
 */

import { useState } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '../../../_ui/primitives/card';
import { Badge } from '../../../_ui/primitives/badge';
import { Button } from '../../../_ui/primitives/button';
import { Input } from '../../../_ui/primitives/input';
import { FormField } from '../../../_ui/primitives/form-field';
import { Dialog } from '../../../_ui/primitives/dialog';
import {
  updateTransactionServerAction,
  deleteTransactionServerAction,
} from '../../../_actions/transactions-server-actions';
import type { TransactionWire } from '../../../_lib/transaction-types';

interface Props {
  id: string;
  tx: TransactionWire;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return iso;
}

export function TransactionDetailForms({ id, tx }: Props): React.JSX.Element {
  const [editing, setEditing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);
  // FIX 4b — in-dialog delete error surface. The pre-FIX-4b
  // `try/finally` closed the Dialog even if the action threw;
  // the error bubbled to the page-level `error.tsx` (off-screen,
  // no in-dialog feedback). Now: only close on success; on
  // failure, surface the error inside the Dialog with
  // `role="alert"` + `aria-live="polite"` so a screen-reader
  // announces the failure while focus stays in the dialog.
  // Pattern precedent: `app/transactions/new/create-transaction-
  // form.tsx:278-285`.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <>
      <Card aria-label={`Transaction ${tx.id.slice(0, 8)}`}>
        <CardHeader
          title="Transaction detail"
          badge={
            <Badge variant={tx.direction === 'INCOME' ? 'success' : 'danger'}>{tx.direction}</Badge>
          }
        />

        {/* Identification — date + direction + wire id. */}
        <CardBody>
          <section aria-labelledby="tx-id-section" className="flex flex-col gap-ui-space-2">
            <h3 id="tx-id-section" className="text-ui-text-sm font-ui-font-semibold text-ui-fg">
              Identification
            </h3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-ui-space-6 gap-y-ui-space-2 text-ui-text-sm">
              <dt className="font-ui-font-semibold text-ui-fg">ID</dt>
              <dd className="font-mono text-ui-fg-muted text-ui-text-xs">{tx.id}</dd>
              <dt className="font-ui-font-semibold text-ui-fg">Date</dt>
              <dd className="text-ui-fg">{formatDate(tx.transactionDate)}</dd>
              <dt className="font-ui-font-semibold text-ui-fg">Direction</dt>
              <dd className="text-ui-fg">{tx.direction}</dd>
            </dl>
          </section>
        </CardBody>

        {/* Amount — native + converted + memo + category. */}
        <CardBody>
          <section aria-labelledby="tx-amt-section" className="flex flex-col gap-ui-space-2">
            <h3 id="tx-amt-section" className="text-ui-text-sm font-ui-font-semibold text-ui-fg">
              Amount
            </h3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-ui-space-6 gap-y-ui-space-2 text-ui-text-sm">
              <dt className="font-ui-font-semibold text-ui-fg">Native</dt>
              <dd className="font-mono text-ui-fg">
                {(tx.amountMinor / 100).toFixed(2)} {tx.currency}
              </dd>
              <dt className="font-ui-font-semibold text-ui-fg">Converted</dt>
              <dd className="font-mono text-ui-fg">
                {(tx.convertedAmountMinor / 100).toFixed(2)} {tx.convertedCurrency}
              </dd>
              <dt className="font-ui-font-semibold text-ui-fg">Memo</dt>
              <dd className="text-ui-fg">{tx.memo ?? '—'}</dd>
              <dt className="font-ui-font-semibold text-ui-fg">Category</dt>
              <dd className="text-ui-fg">{tx.category ?? '—'}</dd>
            </dl>
          </section>
        </CardBody>

        {/* FX snapshot — read-only per REQ-TX-15 + design §18. */}
        <CardBody>
          <section aria-labelledby="tx-fx-section" className="flex flex-col gap-ui-space-2">
            <h3 id="tx-fx-section" className="text-ui-text-sm font-ui-font-semibold text-ui-fg">
              FX snapshot
            </h3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-ui-space-6 gap-y-ui-space-2 text-ui-text-sm">
              <dt className="font-ui-font-semibold text-ui-fg">Rate as of</dt>
              <dd className="font-mono text-ui-text-xs text-ui-fg-muted">
                {formatDateTime(tx.fxAsOfSnapshot)}
              </dd>
              <dt className="font-ui-font-semibold text-ui-fg">Casa</dt>
              <dd className="font-mono text-ui-text-xs text-ui-fg-muted">
                {tx.casaSnapshot ?? '—'}
              </dd>
            </dl>
          </section>
        </CardBody>

        {/* Audit timestamps. */}
        <CardBody>
          <section aria-labelledby="tx-audit-section" className="flex flex-col gap-ui-space-2">
            <h3 id="tx-audit-section" className="text-ui-text-sm font-ui-font-semibold text-ui-fg">
              Audit
            </h3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-ui-space-6 gap-y-ui-space-2 text-ui-text-sm">
              <dt className="font-ui-font-semibold text-ui-fg">Created at</dt>
              <dd className="text-ui-fg">{formatDate(tx.createdAt)}</dd>
              <dt className="font-ui-font-semibold text-ui-fg">Updated at</dt>
              <dd className="text-ui-fg">{formatDate(tx.updatedAt)}</dd>
            </dl>
          </section>
        </CardBody>

        <CardFooter>
          {editing ? null : (
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button type="button" variant="danger" onClick={() => setConfirmDeleteOpen(true)}>
            Delete
          </Button>
        </CardFooter>
      </Card>

      {editing ? (
        <EditForm
          id={id}
          tx={tx}
          submitting={submitting}
          onSubmittingChange={setSubmitting}
          onCancel={() => setEditing(false)}
        />
      ) : null}

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => {
          setConfirmDeleteOpen(false);
          setDeleteError(null);
        }}
        title="Delete transaction?"
        description="This permanently removes the transaction and its FX snapshot. The action cannot be undone."
      >
        <div className="flex flex-col gap-ui-space-3 pt-ui-space-2">
          {deleteError ? (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-ui-md border border-ui-danger bg-ui-danger/10 px-ui-space-3 py-ui-space-2 text-ui-text-sm text-ui-danger"
            >
              {deleteError}
            </div>
          ) : null}
          <div className="flex justify-end gap-ui-space-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirmDeleteOpen(false);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={submitting}
              onClick={async () => {
                setSubmitting(true);
                setDeleteError(null);
                try {
                  await deleteTransactionServerAction(id);
                  // Success — close the dialog. Any failure
                  // path keeps the dialog open with the error
                  // surfaced in-line.
                  setConfirmDeleteOpen(false);
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : 'No pudimos borrar la transacción.';
                  setDeleteError(message);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

interface EditFormProps {
  id: string;
  tx: TransactionWire;
  submitting: boolean;
  onSubmittingChange: (next: boolean) => void;
  onCancel: () => void;
}

function EditForm({
  id,
  tx,
  submitting,
  onSubmittingChange,
  onCancel,
}: EditFormProps): React.JSX.Element {
  return (
    <Card aria-label="Edit transaction">
      <CardHeader title="Edit transaction" />
      <CardBody>
        <form
          action={async (formData) => {
            onSubmittingChange(true);
            try {
              await updateTransactionServerAction(id, formData);
            } finally {
              onSubmittingChange(false);
            }
          }}
          className="flex flex-col gap-ui-space-4 max-w-xl"
        >
          <FormField id="memo" label="Memo" description="Free-form note (max 500 chars).">
            <Input
              id="memo"
              name="memo"
              type="text"
              defaultValue={tx.memo ?? ''}
              maxLength={500}
              disabled={submitting}
            />
          </FormField>
          <FormField id="category" label="Category" description="One tag (max 50 chars).">
            <Input
              id="category"
              name="category"
              type="text"
              defaultValue={tx.category ?? ''}
              maxLength={50}
              disabled={submitting}
            />
          </FormField>
          <div className="flex justify-end gap-ui-space-2">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={submitting} disabled={submitting}>
              Save
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
