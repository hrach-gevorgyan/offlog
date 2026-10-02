import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

const verifyAppLockPin = vi.fn(async (p: string) => p === '2580');
const verifyAppLockRecoveryCode = vi.fn(async (c: string) => c === 'ABCDE-12345');
const clearAppLockPin = vi.fn();
vi.mock('../src/config', () => ({
  verifyAppLockPin: (p: string) => verifyAppLockPin(p),
  verifyAppLockRecoveryCode: (c: string) => verifyAppLockRecoveryCode(c),
  clearAppLockPin: () => clearAppLockPin(),
  getAppLockHint: () => 'birds',
  hasAppLockRecoveryCode: () => true,
  isAppLockBiometricEnabled: () => false,
  isNativePlatform: () => false,
}));

import PhoneLock from '../src/lib/phone/PhoneLock.svelte';

function renderLock() {
  const unlocked = vi.fn();
  const utils = render(PhoneLock, { events: { unlocked } } as any);
  return { ...utils, unlocked };
}
async function type(getByLabelText: (s: string) => HTMLElement, digits: string) {
  for (const d of digits) await fireEvent.click(getByLabelText(d));
}

describe('PhoneLock (keypad lock screen)', () => {
  beforeEach(() => { verifyAppLockPin.mockClear(); clearAppLockPin.mockClear(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('has no text field, so no system keyboard rises', async () => {
    const { container, findByText } = renderLock();
    await findByText('Offlog is locked');
    expect(container.querySelector('input')).toBeNull();
  });

  it('unlocks the moment the right digits are in, with no Unlock button', async () => {
    const { findByLabelText, getByLabelText, unlocked } = renderLock();
    await findByLabelText('1');
    await type(getByLabelText, '2580');
    await waitFor(() => expect(unlocked).toHaveBeenCalledTimes(1));
  });

  it('a pause on wrong digits says so and clears them', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { findByLabelText, getByLabelText, findByText, getByRole, unlocked } = renderLock();
    await findByLabelText('1');
    await type(getByLabelText, '1111');
    await vi.advanceTimersByTimeAsync(1400);
    expect(await findByText("That isn't your PIN.")).toBeTruthy();
    expect(getByRole('img').getAttribute('aria-label')).toBe('0 of up to 8 digits entered');
    expect(unlocked).not.toHaveBeenCalled();
  });

  it('typing again clears the wrong message', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { findByLabelText, getByLabelText, findByText, queryByText } = renderLock();
    await findByLabelText('1');
    await type(getByLabelText, '1111');
    await vi.advanceTimersByTimeAsync(1400);
    await findByText("That isn't your PIN.");
    await fireEvent.click(getByLabelText('3'));
    expect(queryByText("That isn't your PIN.")).toBeNull();
  });

  it('Delete removes the last digit', async () => {
    const { findByLabelText, getByLabelText, getByRole } = renderLock();
    await findByLabelText('1');
    await type(getByLabelText, '12');
    await fireEvent.click(getByLabelText('Delete a digit'));
    expect(getByRole('img').getAttribute('aria-label')).toBe('1 of up to 8 digits entered');
  });

  it('the hint shows only when asked for', async () => {
    const { findByText, getByText, queryByText } = renderLock();
    await findByText('Show hint');
    expect(queryByText('Hint: birds')).toBeNull();
    await fireEvent.click(getByText('Show hint'));
    expect(getByText('Hint: birds')).toBeTruthy();
  });

  it('Forgot PIN: the right recovery code clears the lock and unlocks', async () => {
    const { findByText, getByText, getByLabelText, unlocked } = renderLock();
    await fireEvent.click(await findByText('Forgot PIN?'));
    await fireEvent.input(getByLabelText('Recovery code'), { target: { value: 'ABCDE-12345' } });
    await fireEvent.click(getByText('Unlock with code'));
    await waitFor(() => expect(unlocked).toHaveBeenCalled());
    expect(clearAppLockPin).toHaveBeenCalled();
  });

  it('Forgot PIN: a wrong code says so and keeps the lock', async () => {
    const { findByText, getByText, getByLabelText, unlocked } = renderLock();
    await fireEvent.click(await findByText('Forgot PIN?'));
    await fireEvent.input(getByLabelText('Recovery code'), { target: { value: 'nope' } });
    await fireEvent.click(getByText('Unlock with code'));
    expect(await findByText('That code doesn’t match.')).toBeTruthy();
    expect(unlocked).not.toHaveBeenCalled();
    expect(clearAppLockPin).not.toHaveBeenCalled();
  });
});
