'use client';

/**
 * DashboardMonthSwitcher — Client Component.
 *
 * Renders a `<nav>` of three controls: a previous-month Link,
 * the current-month label, and a next-month Link. Picking a
 * link navigates to `/dashboard?month=YYYY-MM` (preserving any
 * `?accountId=` deep-link the user already had) so the
 * dashboard Server Component (slice 4's page) re-renders
 * with the new month, which triggers the
 * `/api/reports/monthly?month=...` and
 * `/api/reports/breakdown?month=...` (re)fetches per design
 * §9.3 + §17.
 *
 * Per design §15.4 (analogous to DashboardAccountPicker) +
 * REQ-UI-7 + REQ-UI-8:
 * - `<Link>`-based (not `<button>`-based) so right-click
 *   'open in new tab' works.
 * - `aria-label='Month switcher'` on the `<nav>`.
 * - Focus ring on every interactive element.
 * - Date math in pure helpers (`prevMonth`, `nextMonth`) —
 *   Dec→Jan + Jan→Dec rollover handled explicitly.
 *
 * The CURRENT month is rendered as a `<span>` (non-link) so
 * the user can see which month is selected at a glance. The
 * previous + next links flank it.
 *
 * The `now` prop is exposed for tests (the UTC month for
 * "today" is testable as a fixed input). In production, the
 * Server Component parent passes the current UTC month via
 * the search-param read; the client component's default-when-
 * omitted branch is for the navigation default when the user
 * visits `/dashboard` with no `?month=` (orchestrator note
 * says: "default to current UTC month when no `?month=` is
 * present").
 */

import NextLink from 'next/link';

/**
 * Pure helper: subtract one calendar month from `yyyyMm`.
 * Handles Jan→Dec back-rollover.
 */
export function prevMonth(yyyyMm: string): string {
  const [yearStr, monthStr] = yyyyMm.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month === 1) return `${year - 1}-12`;
  const prev = String(month - 1).padStart(2, '0');
  return `${year}-${prev}`;
}

/**
 * Pure helper: add one calendar month to `yyyyMm`. Handles
 * Dec→Jan forward rollover.
 */
export function nextMonth(yyyyMm: string): string {
  const [yearStr, monthStr] = yyyyMm.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month === 12) return `${year + 1}-01`;
  const next = String(month + 1).padStart(2, '0');
  return `${year}-${next}`;
}

/**
 * Pure helper: derive the current UTC `YYYY-MM` for `now`.
 * Mirrors the helper in `app/dashboard/page.tsx` (kept
 * co-located here because the Client Component cannot
 * import a Server-only helper without crossing a boundary).
 */
export function currentUtcMonth(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export interface DashboardMonthSwitcherProps {
  currentMonth: string | null;
  currentAccountId: string | null;
  /**
   * Exposed for test determinism. In production, the parent
   * Server Component passes a `Date` for "now" (the RSC's
   * render time) — avoids the client / server clock drift on
   * long-lived tabs.
   */
  now?: Date;
}

function buildHref(month: string, accountId: string | null): string {
  if (accountId) {
    return `/dashboard?accountId=${encodeURIComponent(accountId)}&month=${encodeURIComponent(month)}`;
  }
  return `/dashboard?month=${encodeURIComponent(month)}`;
}

export function DashboardMonthSwitcher({
  currentMonth,
  currentAccountId,
  now,
}: DashboardMonthSwitcherProps): React.JSX.Element {
  const resolvedNow = now ?? new Date();
  const resolvedCurrent = currentMonth ?? currentUtcMonth(resolvedNow);
  const prev = prevMonth(resolvedCurrent);
  const next = nextMonth(resolvedCurrent);
  return (
    <nav
      aria-label="Month switcher"
      className="flex items-center gap-ui-space-2 text-ui-text-sm"
    >
      <NextLink
        href={buildHref(prev, currentAccountId)}
        aria-label="Previous month"
        className="rounded-ui-md border border-ui-border px-ui-space-3 py-ui-space-1 text-ui-fg hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2"
      >
        ← {prev}
      </NextLink>
      <span aria-current="true" className="rounded-ui-md bg-ui-bg-muted px-ui-space-3 py-ui-space-1 font-ui-font-semibold text-ui-fg">
        {resolvedCurrent}
      </span>
      <NextLink
        href={buildHref(next, currentAccountId)}
        aria-label="Next month"
        className="rounded-ui-md border border-ui-border px-ui-space-3 py-ui-space-1 text-ui-fg hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2"
      >
        {next} →
      </NextLink>
    </nav>
  );
}
