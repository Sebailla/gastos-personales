// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Breadcrumb primitive (T-UI-411).

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Breadcrumb } from '../../app/_ui/primitives/breadcrumb';

describe('visual snapshot — Breadcrumb primitive (T-UI-411)', () => {
  it('renders a three-item Breadcrumb', () => {
    const { container } = render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Main ARS' },
        ]}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
