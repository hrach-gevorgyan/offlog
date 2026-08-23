import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

// confirm.ts and modalStack.ts are used for real here: the thing worth
// testing is that the promise handed to the caller actually settles with the
// right value once it has been through the history.back() -> popstate
// round-trip that modalStack drives.
import ConfirmDialog from '../src/lib/ConfirmDialog.svelte';
import { get } from 'svelte/store';
import { confirmAction, confirmRequest } from '../src/lib/confirm';

const panel = (c: HTMLElement) => c.querySelector('.confirm-panel') as HTMLDivElement | null;
const okBtn = (c: HTMLElement) => c.querySelector('.ok-btn') as HTMLButtonElement;
const cancelBtn = (c: HTMLElement) => c.querySelector('.cancel-btn') as HTMLButtonElement;
const scrim = (c: HTMLElement) => c.querySelector('.confirm-scrim') as HTMLDivElement;

// The pending promise is boxed: returning it bare from an async helper would
// flatten into the caller's own await and hang until the dialog is answered.
async function ask(c: HTMLElement, opts?: Parameters<typeof confirmAction>[1]) {
  const answer = confirmAction('Delete this task?', opts);
  await waitFor(() => { if (!panel(c)) throw new Error('dialog did not appear'); });
  return { answer };
}

beforeEach(() => confirmRequest.set(null));
afterEach(cleanup);

describe('ConfirmDialog result', () => {
  it('resolves true when the confirm button is pressed', async () => {
    const { container } = render(ConfirmDialog);
    const { answer: p } = await ask(container);
    await fireEvent.click(okBtn(container));
    await expect(p).resolves.toBe(true);
  });

  it('resolves false when the cancel button is pressed', async () => {
    const { container } = render(ConfirmDialog);
    const { answer: p } = await ask(container);
    await fireEvent.click(cancelBtn(container));
    await expect(p).resolves.toBe(false);
  });

  it('resolves false on Escape and true on Enter', async () => {
    const { container } = render(ConfirmDialog);
    const { answer: p } = await ask(container);
    await fireEvent.keyDown(window, { key: 'Escape' });
    await expect(p).resolves.toBe(false);

    const { answer: p2 } = await ask(container);
    await fireEvent.keyDown(window, { key: 'Enter' });
    await expect(p2).resolves.toBe(true);
  });

  // Cancelling by clicking the backdrop must not read as a confirm — this is
  // the path guarding destructive actions.
  it('resolves false on a scrim click', async () => {
    const { container } = render(ConfirmDialog);
    const { answer: p } = await ask(container);
    await fireEvent.click(scrim(container));
    await expect(p).resolves.toBe(false);
  });

  // The dialog is mounted permanently and gated on the store, so a stale
  // request left behind would keep it on screen forever.
  it('clears the pending request once answered', async () => {
    const { container } = render(ConfirmDialog);
    const { answer: p } = await ask(container);
    await fireEvent.click(okBtn(container));
    await p;
    expect(get(confirmRequest)).toBeNull();
  });

  // The dialog only ever resolves the store's *current* request, so an
  // overwritten one has to be settled as an implicit cancel or its caller
  // waits forever.
  it('resolves a superseded request false rather than leaving it hanging', async () => {
    const { container } = render(ConfirmDialog);
    const { answer: first } = await ask(container);
    const second = confirmAction('Second question?');
    await expect(first).resolves.toBe(false);

    await waitFor(() => {
      if (!container.querySelector('.confirm-msg')!.textContent!.includes('Second')) {
        throw new Error('second message not shown');
      }
    });
    await fireEvent.click(okBtn(container));
    await expect(second).resolves.toBe(true);
  });
});

describe('ConfirmDialog content', () => {
  it('renders the message and the default labels', async () => {
    const { container } = render(ConfirmDialog);
    const { answer: p } = await ask(container);

    expect(container.querySelector('.confirm-msg')!.textContent).toBe('Delete this task?');
    expect(okBtn(container).textContent!.trim()).toBe('Confirm');
    expect(cancelBtn(container).textContent!.trim()).toBe('Cancel');

    await fireEvent.click(cancelBtn(container));
    await p;
  });

  it('uses caller-supplied labels', async () => {
    const { container } = render(ConfirmDialog);
    const { answer: p } = await ask(container, { confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true });

    expect(okBtn(container).textContent!.trim()).toBe('Delete');
    expect(cancelBtn(container).textContent!.trim()).toBe('Keep');

    await fireEvent.click(okBtn(container));
    await expect(p).resolves.toBe(true);
  });

  it('renders nothing while no request is pending', () => {
    const { container } = render(ConfirmDialog);
    expect(panel(container)).toBeNull();
    expect(container.querySelector('.confirm-scrim')).toBeNull();
  });
});
