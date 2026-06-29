// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Input primitive (T-UI-415).

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Input } from '../../app/_ui/primitives/input';

describe('visual snapshot — Input primitive (T-UI-415)', () => {
  it('renders the Input primitive in primary + invalid states', () => {
    const primary = render(<Input id="snap-input" placeholder="Amount" />);
    const invalid = render(
      <Input
        id="snap-input-invalid"
        aria-invalid="true"
        aria-describedby="snap-input-error"
        placeholder="Amount"
      />,
    );
    expect(primary.container.firstChild).toMatchSnapshot('primary');
    expect(invalid.container.firstChild).toMatchSnapshot('invalid');
  });
});
