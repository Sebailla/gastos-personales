// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Select primitive (T-UI-415).

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Select } from '../../app/_ui/primitives/select';

describe('visual snapshot — Select primitive (T-UI-415)', () => {
  it('renders the Select primitive', () => {
    const { container } = render(
      <Select
        id="snap-select"
        options={[
          { value: 'ars', label: 'ARS' },
          { value: 'usd', label: 'USD' },
          { value: 'eur', label: 'EUR' },
        ]}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
