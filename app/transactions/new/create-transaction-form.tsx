// smoke-minimal, not production
/**
 * CreateTransactionForm — Client Component.
 *
 * The smoke UI keeps the form as a thin wrapper around a
 * plain `<form action={serverAction}>` so it works without
 * JavaScript (Next.js Server Actions are progressive-
 * enhancement-friendly). The `<select>` defaults are
 * passed in from the Server Component shell.
 *
 * BR-TX-15 form-state discipline:
 * - All form state lives in the form inputs (HTML
 *   primitives: `<input>`, `<select>`). No `useState`.
 * - The Server Action `createTransactionServerAction` parses
 *   the FormData with Zod (in `_actions/transactions-server-
 *   actions.ts`), posts to `/api/transactions`, and redirects
 *   on 201.
 * - On 4xx/5xx the Server Action throws; the closest
 *   `error.tsx` boundary renders the message (Next.js
 *   default; the smoke UI ships a default).
 */

import { createTransactionServerAction } from '../../_actions/transactions-server-actions';

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  accounts: AccountOption[];
}

export function CreateTransactionForm({ accounts }: Props) {
  return (
    <form action={createTransactionServerAction} className="grid gap-3 max-w-md">
      <label className="grid gap-1">
        <span className="font-semibold">Account</span>
        <select name="accountId" required className="border border-gray-300 px-2 py-1">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1">
        <span className="font-semibold">Direction</span>
        <select name="direction" required className="border border-gray-300 px-2 py-1">
          <option value="EXPENSE">EXPENSE</option>
          <option value="INCOME">INCOME</option>
        </select>
      </label>

      <label className="grid gap-1">
        <span className="font-semibold">Amount (minor units, positive integer)</span>
        <input
          name="amountMinor"
          type="number"
          min="1"
          step="1"
          required
          className="border border-gray-300 px-2 py-1"
        />
      </label>

      <label className="grid gap-1">
        <span className="font-semibold">Original currency</span>
        <select name="originalCurrency" required className="border border-gray-300 px-2 py-1">
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </label>

      <label className="grid gap-1">
        <span className="font-semibold">Transaction date (ISO 8601, not in the future)</span>
        <input
          name="transactionDate"
          type="datetime-local"
          required
          className="border border-gray-300 px-2 py-1"
        />
      </label>

      <label className="grid gap-1">
        <span className="font-semibold">Memo (optional, max 500 chars)</span>
        <input
          name="memo"
          type="text"
          maxLength={500}
          className="border border-gray-300 px-2 py-1"
        />
      </label>

      <label className="grid gap-1">
        <span className="font-semibold">Category (optional, max 50 chars)</span>
        <input
          name="category"
          type="text"
          maxLength={50}
          className="border border-gray-300 px-2 py-1"
        />
      </label>

      <div className="flex gap-2">
        <button type="submit" className="rounded bg-blue-600 text-white px-3 py-1">
          Create
        </button>
        <a href="/transactions" className="text-sm text-blue-600 hover:underline self-center">
          Cancel
        </a>
      </div>
    </form>
  );
}
