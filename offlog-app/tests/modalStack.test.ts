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
//
// Tests dispatch synthetic PopStateEvents rather than relying on real
// history.back() timing (jsdom doesn't fire popstate from it reliably) —
// but unlike before 2026-07-17, the dispatched event's `state` now has to
// carry a real offlogDepth, since that's what onPopState uses to decide
// how many layers to close. `history.state` right after a given
// closeOnBack() call IS that layer's real stamped state (pushState is
// synchronous in jsdom even though back() isn't), so tests capture it
// there rather than constructing it by hand.
describe('modalStack', () => {
  it('closes the top layer (LIFO) on back, leaving lower layers untouched', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    closeOnBack(closeA);
    const stateAfterA = history.state;
    closeOnBack(closeB);

    window.dispatchEvent(new PopStateEvent('popstate', { state: stateAfterA }));
    expect(closeB).toHaveBeenCalledOnce();
    expect(closeA).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(closeA).toHaveBeenCalledOnce();
  });

  it('closes every skipped layer when the browser coalesces multiple back() calls into one popstate (2026-07-17 regression)', () => {
    // The bug this guards: rapid open/close/open on the same overlay (or
    // any two closeOnBack layers) can issue two history.back() calls
    // close enough together that the browser fires only one popstate,
    // landing straight past an intermediate layer's own state. The old
    // "pop exactly one stack entry per popstate" logic left that skipped
    // layer's component mounted forever with an already-spent
    // requestClose — stuck, no way to close it. A single landed-past-both
    // popstate must now close both, in LIFO order.
    const closeA = vi.fn();
    const closeB = vi.fn();
    closeOnBack(closeA);
    closeOnBack(closeB);

    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(closeB).toHaveBeenCalledOnce();
    expect(closeA).toHaveBeenCalledOnce();
    expect(closeB.mock.invocationCallOrder[0]).toBeLessThan(closeA.mock.invocationCallOrder[0]);
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
    const stateAfterA = history.state;
    closeOnBack(closeB);

    discardTop(); // simulates B's overlay being replaced by a new one, not dismissed

    // B's own pushed history entry is still physically there (inert) --
    // landing back on A's own state (one real back press from here)
    // correctly leaves A open rather than closing it, since A is still
    // the (only) live layer at that point.
    window.dispatchEvent(new PopStateEvent('popstate', { state: stateAfterA }));
    expect(closeA).not.toHaveBeenCalled();
    expect(closeB).not.toHaveBeenCalled();

    // A further back press (past B's now-unwound orphaned slot) closes A.
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(closeA).toHaveBeenCalledOnce();
    expect(closeB).not.toHaveBeenCalled();
  });
});
