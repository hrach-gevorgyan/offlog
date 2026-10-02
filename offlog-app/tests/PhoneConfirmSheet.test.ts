import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';

// confirm.ts, modalStack.ts and Sheet are real: the answer has to survive the
// history.back() -> popstate round-trip before it reaches the caller.
import ConfirmSheet from '../src/lib/phone/ConfirmSheet.svelte';
import { confirmAction, confirmRequest } from '../src/lib/confirm';

function ask(message: string, opts?: Parameters<typeof confirmAction>[1]) {
  const answer = confirmAction(message, opts);
  const r = render(ConfirmSheet, { req: get(confirmRequest)! });
  return { answer, ...r };
}

// A closed sheet's history.back() lands as an async popstate; let it settle
// so it cannot pop the next test's sheet.
beforeEach(async () => { await new Promise(r => setTimeout(r, 20)); confirmRequest.set(null); });
afterEach(cleanup);

describe('phone ConfirmSheet', () => {
  it('splits the question from the detail and labels the rows', () => {
    const { getByRole, getByText } = ask(`Permanently delete "Milk"? This can't be undone.`, { danger: true, confirmLabel: 'Delete forever' });
    expect(getByRole('heading').textContent).toBe('Permanently delete "Milk"?');
    expect(getByText(`This can't be undone.`)).toBeTruthy();
    expect(getByRole('button', { name: 'Delete forever' }).classList.contains('danger')).toBe(true);
    expect(getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('the action row answers yes and the sheet leaves', async () => {
    const { answer, getByRole } = ask('Restore all 3 items?', { confirmLabel: 'Restore all' });
    await fireEvent.click(getByRole('button', { name: 'Restore all' }));
    await expect(answer).resolves.toBe(true);
    expect((document.querySelector('.psheet') as HTMLElement).inert).toBe(true);
  });

  it('Cancel answers no', async () => {
    const { answer, getByRole } = ask('Delete this?', { danger: true, confirmLabel: 'Delete' });
    await fireEvent.click(getByRole('button', { name: 'Cancel' }));
    await expect(answer).resolves.toBe(false);
  });

  it('Escape answers no, even though a confirm is open', async () => {
    const { answer } = ask('Delete this?', { danger: true, confirmLabel: 'Delete' });
    await fireEvent.keyDown(window, { key: 'Escape' });
    await expect(answer).resolves.toBe(false);
  });

  it('shows the bin only for a deleting danger action', () => {
    const del = ask('Delete this?', { danger: true, confirmLabel: 'Delete' });
    expect(del.container.querySelector('.ic')).not.toBeNull();
    cleanup();
    confirmRequest.set(null);
    const merge = ask('Merge #a into #b?', { danger: true, confirmLabel: 'Merge' });
    expect(merge.container.querySelector('.ic')).toBeNull();
  });
});
