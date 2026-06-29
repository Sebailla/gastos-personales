// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Textarea primitive (T-UI-415).

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Textarea } from '../../app/_ui/primitives/textarea';

describe('visual snapshot — Textarea primitive (T-UI-415)', () => {
  it('renders the Textarea primitive', () => {
    const { container } = render(
      <Textarea id="snap-textarea" placeholder="Memo" rows={4} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
