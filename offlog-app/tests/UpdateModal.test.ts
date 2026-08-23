import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

// The modal is a pure view over updateChecker.ts's state machine — the stores
// are created inside the factory (hoisting) and imported back below, so each
// phase can be driven directly.
const downloadUpdate = vi.fn();
const installUpdate = vi.fn();
vi.mock('../src/lib/updateChecker', async () => {
  const { writable } = await import('svelte/store');
  return {
    updateState: writable({ phase: 'idle' }),
    showUpdateModal: writable(false),
    downloadUpdate: (...a: unknown[]) => downloadUpdate(...a),
    installUpdate: (...a: unknown[]) => installUpdate(...a),
  };
});

import { get } from 'svelte/store';
import { updateState, showUpdateModal } from '../src/lib/updateChecker';
import UpdateModal from '../src/lib/UpdateModal.svelte';

const panel = (c: HTMLElement) => c.querySelector('.update-panel') as HTMLDivElement | null;
const heading = (c: HTMLElement) => c.querySelector('.update-title')!.textContent;
const hint = (c: HTMLElement) => c.querySelector('.update-hint')!.textContent;
const notes = (c: HTMLElement) => c.querySelector('.update-notes') as HTMLDivElement | null;
const btn = (c: HTMLElement, label: string) => {
  const el = [...c.querySelectorAll('button')].find(b => b.textContent?.trim() === label);
  if (!el) throw new Error(`no button labelled ${label}`);
  return el as HTMLButtonElement;
};

async function show(state: Record<string, unknown>) {
  const utils = render(UpdateModal);
  updateState.set(state as any);
  showUpdateModal.set(true);
  await waitFor(() => { if (!panel(utils.container)) throw new Error('modal did not open'); });
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateState.set({ phase: 'idle' } as any);
  showUpdateModal.set(false);
});
afterEach(cleanup);

describe('UpdateModal available', () => {
  it('names the offered version and starts the download on Update', async () => {
    const { container } = await show({ phase: 'available', version: '6.4.0' });

    expect(heading(container)).toBe('Offlog 6.4.0 is available');
    await fireEvent.click(btn(container, 'Update'));
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
  });

  // Deferring only hides the modal; it must never kick off a download.
  it('Later hides the modal without downloading', async () => {
    const { container } = await show({ phase: 'available', version: '6.4.0' });

    await fireEvent.click(btn(container, 'Later'));
    expect(get(showUpdateModal)).toBe(false);
    expect(downloadUpdate).not.toHaveBeenCalled();
  });

  it('omits the notes block when the release carries none', async () => {
    const { container } = await show({ phase: 'available', version: '6.4.0' });
    expect(notes(container)).toBeNull();
  });
});

describe('UpdateModal release notes', () => {
  it('renders headings and bullets from the allowed Markdown subset', async () => {
    const { container } = await show({
      phase: 'available', version: '6.4.0',
      body: '### New\n- Faster search\n- Dark mode fixes\n\n### Fixed\n- A crash',
    });

    expect([...notes(container)!.querySelectorAll('.notes-heading')].map(e => e.textContent))
      .toEqual(['New', 'Fixed']);
    expect([...notes(container)!.querySelectorAll('li')].map(e => e.textContent))
      .toEqual(['Faster search', 'Dark mode fixes', 'A crash']);
    expect(notes(container)!.querySelectorAll('ul').length).toBe(2);
  });

  // Markdown continues a list item across a soft wrap, so a plain line while
  // a list is open belongs to the previous bullet, not to a paragraph.
  it('folds a wrapped line into the bullet above it', async () => {
    const { container } = await show({
      phase: 'available', version: '6.4.0',
      body: '- Faster search\n  across every project\n- Dark mode fixes',
    });

    expect([...notes(container)!.querySelectorAll('li')].map(e => e.textContent))
      .toEqual(['Faster search across every project', 'Dark mode fixes']);
    expect(notes(container)!.querySelectorAll('p').length).toBe(0);
  });

  it('emits a paragraph for text outside any list', async () => {
    const { container } = await show({
      phase: 'available', version: '6.4.0',
      body: 'A plain line.\n\n- A bullet',
    });

    expect([...notes(container)!.querySelectorAll('p')].map(e => e.textContent)).toEqual(['A plain line.']);
    expect([...notes(container)!.querySelectorAll('li')].map(e => e.textContent)).toEqual(['A bullet']);
  });

  // The rendered result goes through {@html}, so every piece of note text
  // must be escaped rather than parsed as markup.
  it('escapes markup in headings, bullets and paragraphs', async () => {
    const { container } = await show({
      phase: 'available', version: '6.4.0',
      body: '### <b>New</b>\n- <img src=x onerror=alert(1)>\n\n<script>bad()</script>',
    });

    expect(notes(container)!.querySelector('b')).toBeNull();
    expect(notes(container)!.querySelector('img')).toBeNull();
    expect(notes(container)!.querySelector('script')).toBeNull();
    expect(notes(container)!.querySelector('li')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('UpdateModal downloading', () => {
  it('shows the progress percentage and offers no actions', async () => {
    const { container } = await show({ phase: 'downloading', version: '6.4.0', progress: 42 });

    expect(heading(container)).toBe('Downloading 6.4.0…');
    expect(hint(container)).toBe('42%');
    expect(container.querySelector('.progress-fill')!.getAttribute('style')).toContain('42%');
    expect(container.querySelectorAll('.update-actions').length).toBe(0);
  });

  it('treats a missing progress value as 0%', async () => {
    const { container } = await show({ phase: 'downloading', version: '6.4.0' });
    expect(hint(container)).toBe('0%');
  });
});

describe('UpdateModal ready', () => {
  it('installs on Restart, and only hides on Later', async () => {
    const { container } = await show({ phase: 'ready', version: '6.4.0' });

    expect(heading(container)).toBe('Offlog 6.4.0 is downloaded');
    await fireEvent.click(btn(container, 'Later'));
    expect(installUpdate).not.toHaveBeenCalled();
    expect(get(showUpdateModal)).toBe(false);

    showUpdateModal.set(true);
    await fireEvent.click(btn(container, 'Restart to install'));
    expect(installUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('UpdateModal error', () => {
  it('surfaces the failure text instead of failing silently', async () => {
    const { container } = await show({ phase: 'error', error: 'network unreachable' });

    expect(heading(container)).toBe('Update failed');
    expect(hint(container)).toBe('network unreachable');

    await fireEvent.click(btn(container, 'Close'));
    expect(get(showUpdateModal)).toBe(false);
  });
});

describe('UpdateModal dismissal', () => {
  it('hides on Escape and on a scrim click, leaving the phase untouched', async () => {
    const { container } = await show({ phase: 'available', version: '6.4.0' });

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(get(showUpdateModal)).toBe(false);
    expect(get(updateState).phase).toBe('available');

    showUpdateModal.set(true);
    await waitFor(() => { if (!panel(container)) throw new Error('modal did not reopen'); });
    await fireEvent.click(container.querySelector('.update-scrim')!);
    expect(get(showUpdateModal)).toBe(false);
  });

  it('renders nothing while hidden', () => {
    const { container } = render(UpdateModal);
    updateState.set({ phase: 'available', version: '6.4.0' } as any);
    expect(panel(container)).toBeNull();
  });
});
