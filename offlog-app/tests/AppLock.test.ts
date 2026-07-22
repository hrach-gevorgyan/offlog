import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';

// AppLock's entire contract lives in config.ts — mocked so these tests
// pin the *component's* security behavior (throttle, digit filter,
// recovery gate, no-escape-hatch) without touching real localStorage
// hashing, which config.test.ts covers.
const verifyAppLockPin = vi.fn();
const verifyAppLockRecoveryCode = vi.fn();
const clearAppLockPin = vi.fn();
vi.mock('../src/config', () => ({
  verifyAppLockPin: (...args: unknown[]) => verifyAppLockPin(...args),
  verifyAppLockRecoveryCode: (...args: unknown[]) => verifyAppLockRecoveryCode(...args),
  clearAppLockPin: (...args: unknown[]) => clearAppLockPin(...args),
  getAppLockHint: vi.fn().mockReturnValue(null),
  hasAppLockRecoveryCode: vi.fn().mockReturnValue(true),
  isAppLockBiometricEnabled: vi.fn().mockReturnValue(false),
  isNativePlatform: vi.fn().mockReturnValue(false),
}));

import AppLock from '../src/lib/AppLock.svelte';

function renderLock() {
  const unlocked = vi.fn();
  const utils = render(AppLock, { events: { unlocked } } as any);
  return { unlocked, ...utils };
}

beforeEach(() => {
  vi.useRealTimers();
  verifyAppLockPin.mockReset();
  verifyAppLockRecoveryCode.mockReset();
  clearAppLockPin.mockClear();
});

afterEach(() => cleanup());

describe('AppLock PIN entry (A32)', () => {
  it('unlocks on a correct PIN', async () => {
    verifyAppLockPin.mockResolvedValue(true);
    const { unlocked, getByLabelText, getByText } = renderLock();

    await fireEvent.input(getByLabelText('PIN'), { target: { value: '1234' } });
    await fireEvent.click(getByText('Unlock'));

    expect(verifyAppLockPin).toHaveBeenCalledWith('1234');
    expect(unlocked).toHaveBeenCalledTimes(1);
  });

  it('a wrong PIN does not unlock and clears the input', async () => {
    verifyAppLockPin.mockResolvedValue(false);
    const { unlocked, getByLabelText, getByText } = renderLock();

    const input = getByLabelText('PIN') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '9999' } });
    await fireEvent.click(getByText('Unlock'));

    expect(unlocked).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('strips non-digits and caps the PIN at 8 characters', async () => {
    verifyAppLockPin.mockResolvedValue(false);
    const { getByLabelText } = renderLock();

    const input = getByLabelText('PIN') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'abc12x34!5678999' } });
    expect(input.value).toBe('12345678');
  });

  it('locks into a cooldown after 3 wrong attempts', async () => {
    verifyAppLockPin.mockResolvedValue(false);
    const { getByLabelText, getByText, queryByText } = renderLock();

    const input = getByLabelText('PIN') as HTMLInputElement;
    for (let i = 0; i < 3; i++) {
      await fireEvent.input(input, { target: { value: '0000' } });
      await fireEvent.click(getByText('Unlock'));
    }

    expect(input.disabled).toBe(true);
    expect(queryByText(/Too many attempts/)).toBeTruthy();
    // A 4th submit during cooldown must not even reach the verifier.
    verifyAppLockPin.mockClear();
    await fireEvent.click(getByText('Unlock'));
    expect(verifyAppLockPin).not.toHaveBeenCalled();
  });

  it('Escape does not unlock or dismiss the lock screen', async () => {
    verifyAppLockPin.mockResolvedValue(false);
    const { unlocked, getByLabelText, container } = renderLock();

    await fireEvent.keyDown(getByLabelText('PIN'), { key: 'Escape' });
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(unlocked).not.toHaveBeenCalled();
    expect(container.querySelector('.lock-screen')).toBeTruthy();
  });
});

describe('AppLock recovery flow (A32)', () => {
  it('a wrong recovery code shows an error and does not clear the PIN', async () => {
    verifyAppLockRecoveryCode.mockResolvedValue(false);
    const { unlocked, getByText, getByLabelText, queryByText } = renderLock();

    await fireEvent.click(getByText('Forgot PIN?'));
    await fireEvent.input(getByLabelText('Recovery code'), { target: { value: 'WRONG-CODE1' } });
    await fireEvent.click(getByText('Continue'));

    expect(queryByText(/doesn’t match/)).toBeTruthy();
    expect(clearAppLockPin).not.toHaveBeenCalled();
    expect(unlocked).not.toHaveBeenCalled();
  });

  it('a correct recovery code clears the PIN and unlocks', async () => {
    verifyAppLockRecoveryCode.mockResolvedValue(true);
    const { unlocked, getByText, getByLabelText } = renderLock();

    await fireEvent.click(getByText('Forgot PIN?'));
    await fireEvent.input(getByLabelText('Recovery code'), { target: { value: 'RIGHT-CODE1' } });
    await fireEvent.click(getByText('Continue'));

    expect(clearAppLockPin).toHaveBeenCalledTimes(1);
    expect(unlocked).toHaveBeenCalledTimes(1);
  });
});
