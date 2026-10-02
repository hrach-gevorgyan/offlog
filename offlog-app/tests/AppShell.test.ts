import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/svelte';
import type { Writable } from 'svelte/store';

// The desktop views are a chunk App.svelte imports only off the phone. This
// counts evaluations of Sidebar, which only that chunk imports, so the phone
// case must run first: once imported, a module stays in the registry for the
// rest of the file. Mocking desktopViews itself would hand App vitest's module
// proxy, which Svelte's dev build cannot store.
const h = vi.hoisted(() => ({ desktopLoads: 0 }));
vi.mock('../src/lib/Sidebar.svelte', async (importOriginal) => {
  h.desktopLoads++;
  return importOriginal();
});
vi.mock('../src/lib/phone/nav', async (importOriginal) => {
  const { writable } = await import('svelte/store');
  return { ...await importOriginal<typeof import('../src/lib/phone/nav')>(), isPhone: writable(false) };
});
vi.mock('../src/lib/phone/PhoneApp.svelte', () => ({ default: () => {} }));
vi.mock('../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config')>();
  return { ...actual, isAppLockEnabled: () => false, hasShownNamePrompt: () => true };
});

import App from '../src/App.svelte';
import { isPhone } from '../src/lib/phone/nav';

async function renderReady() {
  const r = render(App);
  await waitFor(() => { if (!r.container.querySelector('.layout')) throw new Error('not ready'); }, { timeout: 15000 });
  return r;
}

afterEach(() => { cleanup(); });

describe('App shell loading', () => {
  it('never imports the desktop views on the phone', async () => {
    (isPhone as Writable<boolean>).set(true);
    const { container } = await renderReady();
    await new Promise(r => setTimeout(r, 100));
    expect(h.desktopLoads).toBe(0);
    expect(container.querySelector('.sidebar')).toBeNull();
  }, 20000);

  it('loads the desktop views before showing the desktop UI', async () => {
    (isPhone as Writable<boolean>).set(false);
    const { container } = await renderReady();
    expect(h.desktopLoads).toBe(1);
    // Rendered in the same frame `.layout` first appears, never after it.
    expect(container.querySelector('.sidebar')).toBeTruthy();
  }, 20000);
});
