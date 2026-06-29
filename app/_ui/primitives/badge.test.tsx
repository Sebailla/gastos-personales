// @vitest-environment jsdom
/** T-UI-016: Badge — variant + direction mapping (INCOME -> success, EXPENSE -> danger). */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, directionVariant } from './badge';

describe('Badge', () => {
  it('renders children inside a <span>', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active').tagName).toBe('SPAN');
  });

  it('directionVariant maps INCOME -> success and EXPENSE -> danger', () => {
    expect(directionVariant('INCOME')).toBe('success');
    expect(directionVariant('EXPENSE')).toBe('danger');
  });

  it('renders the danger variant with bg-ui-danger class', () => {
    render(<Badge variant="danger">Overdue</Badge>);
    expect(screen.getByText('Overdue').className).toContain('bg-ui-danger');
  });
});
