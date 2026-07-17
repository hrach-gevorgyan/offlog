import { get, writable } from 'svelte/store';

interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}

export const confirmRequest = writable<ConfirmRequest | null>(null);

// Promise-based replacement for window.confirm() — resolves true/false once
// the user picks an option in <ConfirmDialog/> (mounted once at the App.svelte
// root). Native confirm() renders as a jarring out-of-app browser dialog with
// no styling control; this keeps destructive-action confirmation inside the
// app's own visual language.
export function confirmAction(
  message: string,
  opts: { confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    // A fast double-click on the same (or two different) confirm-gated
    // buttons before the dialog can render, or any other path calling
    // confirmAction() again while a previous request hasn't been
    // answered yet, used to silently overwrite confirmRequest -- the
    // first caller's `await confirmAction(...)` then hung forever,
    // leaked, since nothing ever resolved its promise (ConfirmDialog.
    // svelte only ever reads/resolves the store's *current* value, not
    // whichever one it was first mounted for). Resolving the stale
    // pending request false first (treated as an implicit cancel) means
    // no caller is ever left hanging (2026-07-18 audit finding).
    const prev = get(confirmRequest);
    if (prev) prev.resolve(false);
    confirmRequest.set({
      message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? false,
      resolve,
    });
  });
}
