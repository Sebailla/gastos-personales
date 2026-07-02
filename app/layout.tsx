import type { ReactNode } from 'react';

/**
 * Root layout — Next.js requires a root layout at `app/layout.tsx`,
 * but it does not need to render any markup beyond `{children}`.
 *
 * The real chrome (the `<html>` element, font loaders, theme
 * bootstrap, `NextIntlClientProvider`, `AppShell`) lives at
 * `app/[locale]/layout.tsx`. That is the file that renders the
 * actual page tree; this file is a pass-through required by the
 * App Router invariants. See the comment in
 * `app/[locale]/layout.tsx` for the full rationale.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}