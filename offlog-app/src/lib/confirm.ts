import { writable } from 'svelte/store';

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
    confirmRequest.set({
      message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? false,
      resolve,
    });
  });
}
