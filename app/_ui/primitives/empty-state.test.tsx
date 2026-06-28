// @vitest-environment jsdom
/** T-UI-017: EmptyState — role=status + CTA first focusable. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders with role=status and the title', () => {
    render(<EmptyState title="No transactions yet" description="Create one to get started." />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('No transactions yet');
    expect(status).toHaveTextContent('Create one to get started.');
  });

  it('renders the CTA when provided', () => {
    render(<EmptyState title="No accounts" cta={<a href="/accounts/new">Create account</a>} />);
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/accounts/new',
    );
  });
});
