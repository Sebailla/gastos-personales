'use client';

/**
 * LanguageSwitcher — the user-facing locale toggle (T-PR3-05
 * of the `ui-redesign` change, REQ-UI-17).
 *
 * Renders two surface variants:
 *
 *   - On `≥ sm` viewports: two inline segmented buttons
 *     (`es` / `en`) with `aria-pressed={activeLocale === code}`.
 *   - On `< sm` viewports: a single icon button that opens a
 *     focus-trapped popover with the same two options. The
 *     popover uses a native `<dialog>` element so the browser
 *     handles focus + escape key natively (no manual focus
 *     trap needed).
 *
 * On select: writes the `NEXT_LOCALE` cookie (1-year
 * `Max-Age=31536000`, `SameSite=Lax`, `Path=/`, `Secure` in
 * production per design §open decision §11.3) and calls
 * `router.refresh()` so the Server Components re-render
 * with the new locale (the `x-locale` header is read by
 * `src/i18n/request.ts`).
 *
 * The component is a Client Component because it uses
 * `useState` (the popover open state), `useEffect` (the
 * `matchMedia` listener for the responsive variant), and
 * `useRouter` (the navigation refresh).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { cx } from '../_shared/cx';

type Locale = 'en' | 'es';

const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ['es', 'en'];

function isLocale(value: string | undefined): value is Locale {
  return value === 'en' || value === 'es';
}

function useIsSmallViewport(): boolean {
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 639px)');
    setIsSmall(mq.matches);
    const handler = (event: MediaQueryListEvent) => {
      setIsSmall(event.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isSmall;
}

function setNextLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') return;
  const oneYearSeconds = 60 * 60 * 24 * 365;
  const secureFlag =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=${oneYearSeconds}; SameSite=Lax${secureFlag}`;
}

export function LanguageSwitcher(): React.JSX.Element {
  const activeLocaleRaw = useLocale();
  const activeLocale: Locale = isLocale(activeLocaleRaw) ? activeLocaleRaw : 'en';
  const router = useRouter();
  const t = useTranslations('languageSwitcher');
  const isSmall = useIsSmallViewport();
  const [open, setOpen] = useState(false);

  const select = (next: Locale) => {
    if (next === activeLocale) {
      setOpen(false);
      return;
    }
    setNextLocaleCookie(next);
    setOpen(false);
    router.refresh();
  };

  if (isSmall) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t('aria')}
          data-testid="ui-language-switcher-trigger"
          className="inline-flex items-center justify-center rounded-ui-md p-ui-space-1 text-ui-fg hover:bg-ui-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent focus-visible:ring-offset-2"
        >
          <span aria-hidden="true" className="text-base leading-none">
            🌐
          </span>
        </button>
        {open ? (
          <div
            role="dialog"
            aria-label={t('popover.aria')}
            data-testid="ui-language-switcher-popover"
            className="absolute right-0 mt-2 min-w-[8rem] rounded-ui-md border border-ui-border bg-ui-bg shadow-glass p-ui-space-1 z-50"
          >
            {SUPPORTED_LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => select(code)}
                aria-pressed={activeLocale === code}
                data-testid={`ui-language-switcher-option-${code}`}
                className={cx(
                  'w-full text-left rounded-ui-sm px-ui-space-2 py-ui-space-1 text-ui-text-sm hover:bg-ui-bg-muted',
                  activeLocale === code && 'bg-ui-bg-muted font-ui-font-medium',
                )}
              >
                {t(`labels.${code}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('aria')}
      data-testid="ui-language-switcher"
      className="inline-flex items-center rounded-ui-md border border-ui-border bg-ui-bg p-0.5"
    >
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => select(code)}
          aria-pressed={activeLocale === code}
          data-testid={`ui-language-switcher-option-${code}`}
          className={cx(
            'inline-flex items-center justify-center min-w-[2.5rem] rounded-ui-sm px-ui-space-2 py-ui-space-1 text-ui-text-sm hover:bg-ui-bg-muted',
            activeLocale === code && 'bg-ui-bg-muted font-ui-font-medium',
          )}
        >
          {t(`labels.${code}`)}
        </button>
      ))}
    </div>
  );
}
