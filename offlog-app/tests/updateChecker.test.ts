import { describe, expect, it, vi } from 'vitest';

// Each Update from check() is a Tauri resource that stays in the Rust
// resource table until close() -- a replaced one must be released.
const check = vi.fn();
vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => check() }));
vi.mock('../src/config', () => ({ isTauri: () => true, getAutoUpdateCheckEnabled: () => true }));

import { checkForUpdate } from '../src/lib/updateChecker';

const fakeUpdate = (version: string) => ({ version, body: '', close: vi.fn(() => Promise.resolve()) });

describe('checkForUpdate()', () => {
  it('closes the previous Update when a later check replaces it or finds none', async () => {
    const first = fakeUpdate('1.0.1'), second = fakeUpdate('1.0.2');
    check.mockResolvedValueOnce(first);
    await checkForUpdate();
    expect(first.close).not.toHaveBeenCalled();
    check.mockResolvedValueOnce(second);
    await checkForUpdate();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).not.toHaveBeenCalled();
    check.mockResolvedValueOnce(null);
    await checkForUpdate();
    expect(second.close).toHaveBeenCalledTimes(1);
  });
});
