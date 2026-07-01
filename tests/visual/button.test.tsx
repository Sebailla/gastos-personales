// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Button primitive (T-UI-415).
// The Button renders the Spinner when isLoading=true; the
// Spinner uses `useTranslations` from `next-intl`; this test
// renders outside a `NextIntlClientProvider`, so the mock
// is required.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Button } from '../../app/_ui/primitives/button';

describe('visual snapshot — Button primitive (T-UI-415)', () => {
  it('renders Button in primary + loading states', () => {
    const primary = render(<Button>Save</Button>);
    const loading = render(<Button isLoading>Saving…</Button>);
    const disabled = render(<Button disabled>Cancel</Button>);
    expect(primary.container.firstChild).toMatchSnapshot('primary');
    expect(loading.container.firstChild).toMatchSnapshot('loading');
    expect(disabled.container.firstChild).toMatchSnapshot('disabled');
  });
});
