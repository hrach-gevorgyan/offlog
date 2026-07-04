import { describe, it, expect, vi } from 'vitest';
import { closeOnBack, discardTop } from '../src/lib/modalStack';

// modalStack.ts is pure JS with no Svelte/DOM dependency beyond
// window.history/popstate (see its own header comment) — a real target
// for unit coverage per ROADMAP.md A15, without mounting any component.
//
// No beforeEach reset here: jsdom's history.back() doesn't resolve
// synchronously (real browsers process history navigation asynchronously
// too), so a naive `while (history.state) history.back()` cleanup loop
// spins forever waiting for state that never updates in time — it isn't
// a real fix, just an OOM waiting to happen. Each test instead pushes and
// pops exactly the entries it creates, which is self-balancing regardless
// of whatever depth earlier tests in the file left behind.
describe('modalStack', () => {
  it('closes the top layer (LIFO) on back, leaving lower layers untouched', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    closeOnBack(closeA);
    closeOnBack(closeB);

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(closeB).toHaveBeenCalledOnce();
    expect(closeA).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(closeA).toHaveBeenCalledOnce();
  });

  it('requestClose() (the returned function) is exactly history.back(), never a direct stack pop', () => {
    // The module's own header comment is explicit that requestClose must
    // ONLY navigate — popping the stack anywhere but the popstate handler
    // desyncs it from the pending navigation. jsdom doesn't reliably fire
    // a real 'popstate' from history.back() (real browsers do this
    // asynchronously too), so this asserts the actual contract — that
    // requestClose delegates to history.back() — via a spy, rather than
    // waiting on browser-navigation timing vitest can't control.
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const close = vi.fn();
    const requestClose = closeOnBack(close);
    requestClose();
    expect(backSpy).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled(); // only the popstate handler may call this
    backSpy.mockRestore();
  });

  it('discardTop() removes the top entry without calling its close callback or navigating', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    closeOnBack(closeA);
    closeOnBack(closeB);

    discardTop(); // simulates B's overlay being replaced by a new one, not dismissed

    // A later back press should now close A (one level up), not B —
    // and B's close callback must never have fired.
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(closeA).toHaveBeenCalledOnce();
    expect(closeB).not.toHaveBeenCalled();
  });
});
