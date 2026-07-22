import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';

// B61: the gate that makes changing/removing the App Lock PIN require
// the *current* PIN first. verifyAppLockPin is config.ts's real
// hash-check — mocked here, its own correctness is config.test.ts's job.
const verifyAppLockPin = vi.fn();
vi.mock('../src/config', () => ({
  verifyAppLockPin: (...args: unknown[]) => verifyAppLockPin(...args),
}));

import ConfirmPinGate from '../src/lib/ConfirmPinGate.svelte';

function renderGate(props: Record<string, unknown> = {}) {
  const verified = vi.fn();
  const cancel = vi.fn();
  const utils = render(ConfirmPinGate, {
    props: { message: 'Enter your current PIN to change it.', ...props },
    events: { verified, cancel },
  } as any);
  return { verified, cancel, ...utils };
}

beforeEach(() => verifyAppLockPin.mockReset());
afterEach(() => cleanup());

describe('ConfirmPinGate (B61)', () => {
  it('dispatches verified only after the correct current PIN', async () => {
    verifyAppLockPin.mockResolvedValue(true);
    const g = renderGate();

    await fireEvent.input(g.getByLabelText('Current PIN'), { target: { value: '1234' } });
    await fireEvent.click(g.getByText('Continue'));

    expect(verifyAppLockPin).toHaveBeenCalledWith('1234');
    expect(g.verified).toHaveBeenCalledTimes(1);
  });

  it('a wrong PIN shows an error, clears the field, and does not verify', async () => {
    verifyAppLockPin.mockResolvedValue(false);
    const g = renderGate();

    const input = g.getByLabelText('Current PIN') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '9999' } });
    await fireEvent.click(g.getByText('Continue'));

    expect(g.verified).not.toHaveBeenCalled();
    expect(g.queryByText('Current PIN is incorrect.')).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('strips non-digits and caps at 8, same as the lock screen', async () => {
    const g = renderGate();
    const input = g.getByLabelText('Current PIN') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'x1y2z3456789' } });
    expect(input.value).toBe('12345678');
  });

  it('empty PIN cannot submit: button disabled, Enter never reaches the verifier', async () => {
    const g = renderGate();
    expect((g.getByText('Continue') as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.keyDown(g.getByLabelText('Current PIN'), { key: 'Enter' });
    expect(verifyAppLockPin).not.toHaveBeenCalled();
  });

  it('Cancel and Escape both dispatch cancel without verifying', async () => {
    const g = renderGate();
    await fireEvent.click(g.getByText('Cancel'));
    await fireEvent.keyDown(g.getByLabelText('Current PIN'), { key: 'Escape' });
    expect(g.cancel).toHaveBeenCalledTimes(2);
    expect(g.verified).not.toHaveBeenCalled();
  });

  it('renders the danger variant with a custom confirm label', async () => {
    verifyAppLockPin.mockResolvedValue(true);
    const g = renderGate({ confirmLabel: 'Turn off', danger: true });

    const btn = g.getByText('Turn off') as HTMLButtonElement;
    expect(btn.classList.contains('gate-btn-danger')).toBe(true);
    await fireEvent.input(g.getByLabelText('Current PIN'), { target: { value: '1234' } });
    await fireEvent.click(btn);
    expect(g.verified).toHaveBeenCalledTimes(1);
  });
});
