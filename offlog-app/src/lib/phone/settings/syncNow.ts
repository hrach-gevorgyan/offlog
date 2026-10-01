import { writable } from 'svelte/store';
import { syncNow } from '../../db';
import { showError } from '../../store';
import { showToast } from '../nav';

// One "Sync now" for the Settings card and the Sync page. syncNow() settles
// on the first pause of a fresh replication. Another restart of sync (going
// online, re-resolving the host, the Sync toggle) cancels that replication
// without settling it, so the wait is capped and the button comes back.
export const syncing = writable(false);
const CAP_MS = 30000;
export async function runSyncNow() {
  syncing.set(true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const done = await Promise.race([
      syncNow().then(() => true),
      new Promise<false>(r => { timer = setTimeout(() => r(false), CAP_MS); }),
    ]);
    showToast(done ? 'Synced' : 'Still syncing in the background');
  } catch {
    showError('Could not sync. Please try again.');
  } finally {
    clearTimeout(timer);
    syncing.set(false);
  }
}
