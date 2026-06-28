// @vitest-environment jsdom
/** T-UI-015: Table + sub-components — <caption> + <th scope=col> + aria-sort. */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, TableHeader, TableBody, TableRow, TableCell } from './table';

describe('Table compound', () => {
  it('renders <caption> + <th scope=col> per column', () => {
    render(
      <Table caption="Transactions">
        <TableHeader
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'amount', label: 'Amount' },
          ]}
        />
        <TableBody>
          <TableRow>
            <TableCell>2026-06-15</TableCell>
            <TableCell>1000</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Transactions').tagName).toBe('CAPTION');
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(2);
    headers.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
  });

  it('renders aria-sort on sortable columns reflecting sortDirection', () => {
    render(
      <Table caption="Sortable">
        <TableHeader
          columns={[
            { key: 'date', label: 'Date', sortable: true, sortDirection: 'descending' },
            { key: 'amount', label: 'Amount', sortable: true, sortDirection: 'none' },
          ]}
        />
      </Table>,
    );
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveAttribute('aria-sort', 'descending');
    expect(headers[1]).toHaveAttribute('aria-sort', 'none');
  });
});
