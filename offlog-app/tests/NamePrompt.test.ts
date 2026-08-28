import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';

// Every preference this flow offers is persisted through config.ts/theme.ts,
// so those are the write sinks worth asserting on — including the Skip path,
// whose whole point is that it writes nothing.
const setDeviceName = vi.fn();
const setWeekStartsMonday = vi.fn();
const setTimeFormat24h = vi.fn();
const isNativePlatform = vi.fn(() => false);
const getSyncUrl = vi.fn(() => '');
vi.mock('../src/config', () => ({
  getDeviceName: () => 'PC',
  setDeviceName: (...a: unknown[]) => setDeviceName(...a),
  isNativePlatform: () => isNativePlatform(),
  getSyncUrl: () => getSyncUrl(),
  getWeekStartsMonday: () => false,
  setWeekStartsMonday: (...a: unknown[]) => setWeekStartsMonday(...a),
  getTimeFormat24h: () => false,
  setTimeFormat24h: (...a: unknown[]) => setTimeFormat24h(...a),
}));

const setThemeMode = vi.fn();
vi.mock('../src/lib/theme', () => ({
  getThemeMode: () => 'system',
  setThemeMode: (...a: unknown[]) => setThemeMode(...a),
  // motion.ts reads this through theme.ts for its transition durations.
  prefersReducedMotion: () => true,
}));

const requestPermission = vi.fn();
vi.mock('../src/lib/notifications', () => ({
  requestPermission: (...a: unknown[]) => requestPermission(...a),
  permissionState: writable('default'),
}));

import NamePrompt from '../src/lib/NamePrompt.svelte';

const title = (c: HTMLElement) => c.querySelector('.prompt-title')!.textContent;
const input = (c: HTMLElement) => c.querySelector('.prompt-input') as HTMLInputElement;
const btn = (c: HTMLElement, label: string) => {
  const el = [...c.querySelectorAll('button')].find(b => b.textContent?.trim() === label);
  if (!el) throw new Error(`no button labelled ${label}`);
  return el as HTMLButtonElement;
};

function renderPrompt() {
  const close = vi.fn();
  const setupSync = vi.fn();
  const utils = render(NamePrompt, { events: { close, setupSync } } as any);
  return { close, setupSync, ...utils };
}

// Step 2 (preferences) is reached straight from step 1's Next.
async function toPrefs(c: HTMLElement) {
  await fireEvent.click(btn(c, 'Next'));
  await waitFor(() => { if (!title(c)!.includes('preferences')) throw new Error('did not reach step 2'); });
}

// Step 3 (sync) is only reachable through prefs' Done, and only when
// sync is actually being offered.
async function toSync(c: HTMLElement) {
  await toPrefs(c);
  await fireEvent.click(btn(c, 'Done'));
  await waitFor(() => { if (!title(c)!.includes('Sync')) throw new Error('did not reach step 3'); });
}

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(false);
  getSyncUrl.mockReturnValue('');
});
afterEach(cleanup);

describe('NamePrompt step 1', () => {
  it('prefills the auto-generated device name', () => {
    const { container } = renderPrompt();
    expect(input(container).value).toBe('PC');
  });

  // Skip leaves the whole flow with nothing persisted — a device that never
  // answered must not end up with a name it did not choose.
  it('Skip closes without writing a device name', async () => {
    const { container, close } = renderPrompt();
    await fireEvent.input(input(container), { target: { value: 'Laptop' } });
    await fireEvent.click(btn(container, 'Skip'));

    expect(setDeviceName).not.toHaveBeenCalled();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('Next saves the typed name and moves on', async () => {
    const { container, close } = renderPrompt();
    await fireEvent.input(input(container), { target: { value: 'Laptop' } });
    await fireEvent.click(btn(container, 'Next'));

    expect(setDeviceName).toHaveBeenCalledWith('Laptop');
    expect(close).not.toHaveBeenCalled();
    await waitFor(() => { if (!title(container)!.includes('preferences')) throw new Error('did not advance'); });
  });

  it('Enter does what Next does', async () => {
    const { container } = renderPrompt();
    await fireEvent.input(input(container), { target: { value: 'Laptop' } });
    await fireEvent.keyDown(window, { key: 'Enter' });

    expect(setDeviceName).toHaveBeenCalledWith('Laptop');
  });

  it('Escape leaves the flow, same as Skip', async () => {
    const { container, close } = renderPrompt();
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(setDeviceName).not.toHaveBeenCalled();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('scrim click leaves the flow without writing', async () => {
    const { container, close } = renderPrompt();
    await fireEvent.click(container.querySelector('.prompt-scrim')!);

    expect(setDeviceName).not.toHaveBeenCalled();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
});

describe('NamePrompt sync step', () => {
  // Only native with no sync URL has an unconfigured-sync state to offer,
  // so prefs' Done ends the flow directly instead of advancing to it.
  it('is skipped on non-native platforms', async () => {
    const { container, close } = renderPrompt();
    await toPrefs(container);
    await fireEvent.click(btn(container, 'Done'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('is skipped on native when sync is already configured', async () => {
    isNativePlatform.mockReturnValue(true);
    getSyncUrl.mockReturnValue('http://host:5984/offlog');
    const { container, close } = renderPrompt();
    await toPrefs(container);
    await fireEvent.click(btn(container, 'Done'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  // It comes after preferences, not before, so choosing it never skips
  // past prefs that were still ahead of it.
  it('is offered last on native with no sync URL, and dispatches setupSync', async () => {
    isNativePlatform.mockReturnValue(true);
    const { container, setupSync, close } = renderPrompt();
    await toSync(container);

    await fireEvent.click(btn(container, 'Set up sync'));
    expect(setupSync).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  // Sync is the last step, so declining it ends the whole flow.
  it('Skip on the sync step closes the flow', async () => {
    isNativePlatform.mockReturnValue(true);
    const { container, close } = renderPrompt();
    await toSync(container);

    await fireEvent.click(btn(container, 'Skip'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('Escape on the sync step closes the flow, same as Skip', async () => {
    isNativePlatform.mockReturnValue(true);
    const { container, close } = renderPrompt();
    await toSync(container);

    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
});

describe('NamePrompt preferences step', () => {
  it('persists each preference with the value its button stands for', async () => {
    const { container } = renderPrompt();
    await toPrefs(container);

    await fireEvent.click(btn(container, 'Dark'));
    expect(setThemeMode).toHaveBeenCalledWith('dark');

    await fireEvent.click(btn(container, 'Monday'));
    expect(setWeekStartsMonday).toHaveBeenCalledWith(true);
    await fireEvent.click(btn(container, 'Sunday'));
    expect(setWeekStartsMonday).toHaveBeenLastCalledWith(false);

    await fireEvent.click(btn(container, '24h'));
    expect(setTimeFormat24h).toHaveBeenCalledWith(true);
    await fireEvent.click(btn(container, '12h'));
    expect(setTimeFormat24h).toHaveBeenLastCalledWith(false);
  });

  it('asks for notification permission on Enable', async () => {
    const { container } = renderPrompt();
    await toPrefs(container);

    await fireEvent.click(btn(container, 'Enable'));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('Done ends the flow', async () => {
    const { container, close } = renderPrompt();
    await toPrefs(container);

    await fireEvent.click(btn(container, 'Done'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
});
