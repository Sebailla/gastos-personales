import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

// Inter Variable (REQ-UI-18) — display + body text. `weight: 'variable'`
// emits the variable-font subset; `display: 'swap'` keeps first
// paint unblocked; `preload: true` is the LCP contribution.
// The `variable` option writes the loader's CSS variable name onto
// the consumer element so `--font-inter` becomes available in scope.
const inter = Inter({
  weight: 'variable',
  display: 'swap',
  preload: true,
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext'],
});

// JetBrains Mono — monospace. Two weights (400 + 500) match the
// existing form / table consumption in `app/_ui/primitives/`.
const jetbrainsMono = JetBrains_Mono({
  weight: ['400', '500'],
  display: 'swap',
  preload: true,
  variable: '--font-jb-mono',
  subsets: ['latin', 'latin-ext'],
});

export const metadata: Metadata = {
  title: 'gastos-personales',
  description: 'Multi-user personal finance app',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
