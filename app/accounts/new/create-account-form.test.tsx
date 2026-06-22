/**
 * Tests for CreateAccountForm — fx-cache PR-2 T2.9.
 *
 * Snapshot test on the casa `<select>` (smoke UI). The form
 * is a Client Component that uses `useRouter` from
 * `next/navigation`; we stub that hook via `vi.mock` so the
 * component renders without an App Router context.
 *
 * Scenarios covered:
 * (1) the casa `<select>` renders with 7 options (6 casas +
 *     "Default (oficial)").
 * (2) the form label "FX casa (optional)" is present so the
 *     select is WCAG-labelled.
 */

import { describe, it, expect, vi } from 'vitest';

// Stub `next/navigation` so the form can render without an App
// Router context. The router object is only used in the onSubmit
// success path; for the static render we don't need any real
// implementation.
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

import { renderToStaticMarkup } from 'react-dom/server';
import { CreateAccountForm } from './create-account-form';

describe('CreateAccountForm — casa <select> (fx-cache PR-2 T2.9)', () => {
  it('renders the casa <select> with 7 options (6 casas + Default (oficial))', () => {
    const html = renderToStaticMarkup(<CreateAccountForm />);
    // The select is named "casa".
    expect(html).toContain('name="casa"');
    // The placeholder is the first option (rendered as
    // `selected=""` because casa defaults to null).
    const casaSelectMatch = html.match(
      /<select name="casa"[\s\S]*?<\/select>/,
    );
    expect(casaSelectMatch).not.toBeNull();
    const casaSelect = casaSelectMatch?.[0] ?? '';
    expect(casaSelect).toContain('<option value="" selected="">Default (oficial)</option>');
    // Each casa is rendered as an option, in UPPERCASE Prisma form.
    expect(casaSelect).toContain('<option value="OFICIAL">OFICIAL</option>');
    expect(casaSelect).toContain('<option value="BLUE">BLUE</option>');
    expect(casaSelect).toContain('<option value="MEP">MEP</option>');
    expect(casaSelect).toContain('<option value="CCL">CCL</option>');
    expect(casaSelect).toContain('<option value="CRIPTO">CRIPTO</option>');
    expect(casaSelect).toContain('<option value="TARJETA">TARJETA</option>');
    // 7 options total (1 placeholder + 6 casas).
    const optionCount = (casaSelect.match(/<option /g) ?? []).length;
    expect(optionCount).toBe(7);
  });

  it('renders the form label "FX casa (optional)" so the select is WCAG-labelled', () => {
    const html = renderToStaticMarkup(<CreateAccountForm />);
    expect(html).toContain('FX casa (optional)');
  });
});
