// @vitest-environment jsdom
// Slice 5 — visual snapshot for the Pagination primitive (T-UI-412).
// Per design §13.5: snapshot at first / middle / last page.

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Pagination } from '../../app/_ui/primitives/pagination';

describe('visual snapshot — Pagination primitive (T-UI-412)', () => {
  it('renders Pagination at first / middle / last page', () => {
    const first = render(<Pagination currentPage={1} totalPages={5} baseUrl="/transactions" />);
    const middle = render(<Pagination currentPage={3} totalPages={5} baseUrl="/transactions" />);
    const last = render(<Pagination currentPage={5} totalPages={5} baseUrl="/transactions" />);
    expect(first.container.firstChild).toMatchSnapshot('first');
    expect(middle.container.firstChild).toMatchSnapshot('middle');
    expect(last.container.firstChild).toMatchSnapshot('last');
  });
});
