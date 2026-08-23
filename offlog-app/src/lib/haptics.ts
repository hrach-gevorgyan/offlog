// Shared entry point for every haptic call site, so the
// isNativePlatform()/isHapticsEnabled() gate lives in exactly one place.
// Android only — web/desktop deliberately no-op rather than falling back to
// the Vibration API, since a buzz on every checkbox click on desktop reads as
// a bug, not a feature.
import { isNativePlatform, isHapticsEnabled } from '../config';

async function fire(fn: (mod: typeof import('@capacitor/haptics')) => Promise<void>) {
  if (!isNativePlatform() || !isHapticsEnabled()) return;
  try {
    const mod = await import('@capacitor/haptics');
    await fn(mod);
  } catch {
    // Best-effort — haptics is pure polish, never worth surfacing an error for.
  }
}

// Checkbox/pin/checklist-item toggles — a small, light tap.
export function hapticToggle() {
  fire(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }));
}

// Drag pickup — confirms the drag actually started.
export function hapticDragStart() {
  fire(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }));
}

// Drag drop — a touch firmer than pickup, confirms the move landed.
export function hapticDragDrop() {
  fire(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }));
}
