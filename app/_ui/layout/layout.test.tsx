// @vitest-environment jsdom
/** T-UI-025 + T-UI-026: Layout primitives — PageHeader + PageContainer + BreadcrumbBar. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './page-header';
import { PageContainer } from './page-container';
import { BreadcrumbBar } from './breadcrumb-bar';

describe('PageHeader', () => {
  it('renders an <h1> with the title and the actions slot', () => {
    render(
      <PageHeader
        title="Accounts"
        description="All your financial accounts in one place"
        actions={<button>Create account</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });
});

describe('PageContainer', () => {
  it('renders a <main> wrapper', () => {
    render(<PageContainer>content</PageContainer>);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

describe('BreadcrumbBar', () => {
  it('renders a Breadcrumb primitive from the items prop', () => {
    render(
      <BreadcrumbBar
        items={[
          { label: 'Home', href: '/' },
          { label: 'Accounts' },
        ]}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });
});