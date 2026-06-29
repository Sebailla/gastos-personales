// @vitest-environment jsdom
// Slice 5 — visual snapshot for the EmptyState primitive (T-UI-409).
// Per design §13.5: snapshot with CTA + without CTA.

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { EmptyState } from '../../app/_ui/primitives/empty-state';
import { Link } from '../../app/_ui/primitives/link';

describe('visual snapshot — EmptyState primitive (T-UI-409)', () => {
  it('renders EmptyState with CTA + without CTA', () => {
    const withoutCta = render(
      <EmptyState title="No data" description="Nothing to display yet." />,
    );
    const withCta = render(
      <EmptyState
        title="No accounts yet"
        description="Create your first account to start recording transactions."
        cta={
          <Link href="/accounts/new" className="text-ui-accent hover:underline">
            + New account
          </Link>
        }
      />,
    );
    expect(withoutCta.container.firstChild).toMatchSnapshot('without-cta');
    expect(withCta.container.firstChild).toMatchSnapshot('with-cta');
  });
});
