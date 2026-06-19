'use client';

/**
 * EphemeralToast — Client Component.
 *
 * Renders a one-shot toast at the bottom-right of the page
 * for ~3 s, then auto-dismisses. Reads the toast key from
 * the URL search params (e.g. `?toast=account-created`).
 *
 * Used by:
 * - BR-ACC-16 (create): after `POST /api/accounts` returns
 *   `201`, the form's onSubmit calls
 *   `router.push('/accounts?toast=account-created')`. The
 *   list page mounts this component and the toast appears
 *   for 3 s.
 * - BR-ACC-19 (detail 404): the detail page calls
 *   `redirect('/accounts?toast=not-found')` on a 404 from
 *   the API. The list page mounts this component and the
 *   toast appears for 3 s.
 *
 * No library, no context, no global state. The toast is
 * local to the mount; the key is in the URL so it survives
 * a refresh and disappears when the search param is gone.
 *
 * Hand-verified (no automated tests per design §10.5).
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const TOAST_MESSAGES: Record<string, string> = {
  'account-created': 'Account created',
  'not-found': 'Account not found or no access',
};

const TOAST_DURATION_MS = 3000;

export function EphemeralToast({
  searchParamKey = 'toast',
}: {
  searchParamKey?: string;
}) {
  const params = useSearchParams();
  const key = params.get(searchParamKey);
  const message = key ? TOAST_MESSAGES[key] : null;
  const [visible, setVisible] = useState<boolean>(!!message);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [message]);

  if (!visible || !message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 rounded bg-gray-900 text-white px-4 py-2 shadow"
    >
      {message}
    </div>
  );
}
