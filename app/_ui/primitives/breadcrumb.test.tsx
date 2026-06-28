// @vitest-environment jsdom
/** T-UI-023: Breadcrumb — <nav aria-label=Breadcrumb> + <ol> + <Link>s. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from './breadcrumb';

describe('Breadcrumb', () => {
  it('renders a <nav aria-label=Breadcrumb> with one <li> per item', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Main' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/accounts');
    // Last item (no href) has aria-current=page
    const last = screen.getByText('Main');
    expect(last).toHaveAttribute('aria-current', 'page');
  });
});
