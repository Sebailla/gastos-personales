// @vitest-environment jsdom
/** T-UI-020: Pagination — server-rendered <nav> + <Link> controls. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pagination } from './pagination';

describe('Pagination', () => {
  it('renders a <nav aria-label="Pagination"> with one link per page', () => {
    render(<Pagination currentPage={2} totalPages={5} baseUrl="/transactions" />);
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(nav).toBeInTheDocument();
    // 1 Previous + 5 pages + 1 Next = 7 links
    expect(screen.getByRole('link', { name: 'Previous page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Page 3' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next page' })).toBeInTheDocument();
  });
});
