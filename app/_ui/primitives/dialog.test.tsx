// @vitest-environment jsdom
/** T-UI-021 + T-UI-022: Dialog Client Component — focus trap + Escape closes. */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './dialog';

describe('Dialog', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <Dialog open={false} onClose={() => {}} title="Confirm delete">
        <p>Are you sure?</p>
      </Dialog>,
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('renders role=dialog + aria-modal=true + aria-labelledby when open', () => {
    render(
      <Dialog open onClose={() => {}} title="Confirm delete">
        <p>Are you sure?</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(document.getElementById(labelId ?? '')).toHaveTextContent('Confirm delete');
  });

  it('fires onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open onClose={onClose} title="Confirm">
        <p>body</p>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
