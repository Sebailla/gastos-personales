// smoke-minimal, not production
'use client';

/**
 * TransactionDetailForms — Client Component.
 *
 * Renders the edit form + delete button for the detail page.
 * The edit form posts to `updateTransactionServerAction`;
 * the delete button posts to `deleteTransactionServerAction`.
 *
 * The delete button uses a `<form>` with an inline
 * `onSubmit` confirm (the smoke UI does not need a custom
 * modal — a native `confirm()` is fine).
 */

import { useState } from 'react';
import {
  updateTransactionServerAction,
  deleteTransactionServerAction,
} from '../../_actions/transactions-server-actions';
import type { TransactionWire } from '../../_lib/transaction-types';

interface Props {
  id: string;
  tx: TransactionWire;
}

export function TransactionDetailForms({ id, tx }: Props) {
  const [showEdit, setShowEdit] = useState(false);

  return (
    <div className="border-t border-gray-200 pt-4">
      {!showEdit ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="rounded bg-blue-600 text-white px-3 py-1"
          >
            Edit
          </button>
          <form
            action={async () => {
              if (
                typeof window !== 'undefined' &&
                !window.confirm('Delete this transaction? This cannot be undone.')
              ) {
                return;
              }
              await deleteTransactionServerAction(id);
            }}
          >
            <button type="submit" className="rounded bg-red-600 text-white px-3 py-1">
              Delete
            </button>
          </form>
        </div>
      ) : (
        <form
          action={async (formData) => {
            await updateTransactionServerAction(id, formData);
          }}
          className="grid gap-3 max-w-md"
        >
          <label className="grid gap-1">
            <span className="font-semibold">Amount (minor units, positive integer)</span>
            <input
              name="amountMinor"
              type="number"
              min="1"
              step="1"
              defaultValue={tx.amountMinor}
              className="border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">Memo</span>
            <input
              name="memo"
              type="text"
              maxLength={500}
              defaultValue={tx.memo ?? ''}
              className="border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">Category</span>
            <input
              name="category"
              type="text"
              maxLength={50}
              defaultValue={tx.category ?? ''}
              className="border border-gray-300 px-2 py-1"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded bg-blue-600 text-white px-3 py-1">
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowEdit(false)}
              className="text-sm text-blue-600 hover:underline self-center"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
