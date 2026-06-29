// @vitest-environment jsdom
// Slice 5 — visual snapshot for the FieldError primitive (T-UI-415).

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { FieldError } from '../../app/_ui/primitives/field-error';

describe('visual snapshot — FieldError primitive (T-UI-415)', () => {
  it('renders the FieldError primitive', () => {
    const { container } = render(<FieldError id="snap-error" message="Amount is required" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
