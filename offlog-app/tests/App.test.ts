import { describe, expect, it, vi, afterEach } from 'vitest';

// Each test boots the whole app (real database, lazily loaded desktop views),
// which under a full parallel run can take most of vitest's default 5 s.
vi.setConfig({ testTimeout: 20000 });
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';

// App.svelte against the real in-memory database (setup.ts), with only App
// Lock forced on or off. Covers the two places App itself decides what
// opens: the lock gate on overlay openers, and the Undo toast's target.
let lockOn = false;
vi.mock('../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config')>();
  return { ...actual, isAppLockEnabled: () => lockOn, hasShownNamePrompt: () => true };
});

import App from '../src/App.svelte';
import db, { createTask, deleteTask, getTaskById } from '../src/lib/db';
import { projects } from '../src/lib/store';
import { pendingOpenTaskId } from '../src/lib/notifications';

async function renderReady(locked: boolean) {
  lockOn = locked;
  const r = render(App);
  await waitFor(() => { if (!r.container.querySelector('.layout')) throw new Error('not ready'); }, { timeout: 15000 });
  return r;
}

async function firstProjectTask(title: string) {
  const p = get(projects)[0];
  return createTask(p._id, p.space_id, p.columns[0].id, title);
}

afterEach(() => { cleanup(); lockOn = false; pendingOpenTaskId.set(null); });

// Quick Add, Search and the shortcuts panel render outside the inert
// wrapper, so opening one behind the lock screen put it on top of the lock.
describe('App Lock keeps overlays shut', () => {
  it('opens search and Quick Add from the keyboard when unlocked', async () => {
    const { container } = await renderReady(false);
    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(container.ownerDocument.querySelector('.search-panel')).toBeTruthy());
    await fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    await waitFor(() => expect(container.ownerDocument.querySelector('[role="dialog"][aria-label="Quick add task"]')).toBeTruthy());
  });

  it('ignores Ctrl+K, Ctrl+N and ? while locked', async () => {
    const { container } = await renderReady(true);
    const doc = container.ownerDocument;
    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    await fireEvent.keyDown(document.body, { key: '?' });
    await new Promise(r => setTimeout(r, 50));
    expect(doc.querySelector('.search-panel')).toBeNull();
    expect(doc.querySelector('[role="dialog"][aria-label="Quick add task"]')).toBeNull();
    expect(doc.querySelector('.shortcuts-panel')).toBeNull();
  });

  it('holds a notification tap while locked instead of opening the task', async () => {
    const { container } = await renderReady(true);
    const task = await firstProjectTask('From a reminder');
    pendingOpenTaskId.set(task._id!);
    await new Promise(r => setTimeout(r, 100));
    expect(container.ownerDocument.querySelector('.title-input')).toBeNull();
    expect(get(pendingOpenTaskId)).toBe(task._id);
  });
});

// The toast used to restore "the most recently deleted task by updated_at",
// which is not the one just deleted when another deletion sorts later.
describe('App undo-delete toast', () => {
  it('names and restores the task that was just deleted', async () => {
    const { container, findByText } = await renderReady(false);
    const other = await firstProjectTask('Synced delete');
    // A deletion that sorts later than anything done now, as a synced delete
    // from a device with a fast clock would.
    const doc = await db.get(other._id!);
    await db.put({ ...doc, deleted: true, updated_at: '2999-01-01T00:00:00.000Z' });
    const mine = await firstProjectTask('Just deleted');

    await deleteTask(mine._id!);
    await findByText('Deleted "Just deleted"');
    await fireEvent.click(container.ownerDocument.querySelector('.toast-undo') as HTMLButtonElement);

    await waitFor(async () => expect((await getTaskById(mine._id!))?.deleted).toBe(false));
    expect((await getTaskById(other._id!))?.deleted).toBe(true);
  });
});

// While the PC sleeps the countdown timer stalls, and the first mouse move
// after waking used to restart it instead of noticing the hours that passed.
describe('App Lock after the PC sleeps', () => {
  it('locks on the first input once the timeout has passed on the wall clock', async () => {
    localStorage.setItem('offlog_app_lock_timeout_minutes', '5');
    const realNow = Date.now.bind(Date);
    let offset = 0;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    try {
      const r = await renderReady(false);
      lockOn = true;
      window.dispatchEvent(new Event('mousemove'));
      offset = 2 * 60000;
      window.dispatchEvent(new Event('mousemove'));
      await new Promise(res => setTimeout(res, 50));
      expect(r.container.querySelector('.lock-screen')).toBeNull();
      offset += 6 * 60000;
      window.dispatchEvent(new Event('mousemove'));
      await waitFor(() => expect(r.container.querySelector('.lock-screen')).not.toBeNull());
    } finally {
      nowSpy.mockRestore();
      localStorage.removeItem('offlog_app_lock_timeout_minutes');
    }
  });
});

describe('App Lock "Immediately"', () => {
  it('never locks while in use, and locks on coming back to the app', async () => {
    localStorage.setItem('offlog_app_lock_timeout_minutes', '0');
    const hidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    try {
      const r = await renderReady(false);
      lockOn = true;
      window.dispatchEvent(new Event('mousemove'));
      await new Promise(res => setTimeout(res, 50));
      expect(r.container.querySelector('.lock-screen')).toBeNull();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(r.container.querySelector('.lock-screen')).not.toBeNull());
    } finally {
      localStorage.removeItem('offlog_app_lock_timeout_minutes');
      delete (document as { hidden?: boolean }).hidden;
      if (hidden) Object.defineProperty(Document.prototype, 'hidden', hidden);
    }
  });
});
