import { writable } from 'svelte/store';
import { syncNow } from '../../db';
import { showError } from '../../store';
import { showToast } from '../nav';

// One "Sync now" for the Settings card and the Sync page. syncNow() settles
// on the first pause of a fresh replication, so a resolve means a full round.
export const syncing = writable(false);
export async function runSyncNow() {
  syncing.set(true);
  try {
    await syncNow();
    showToast('Synced');
  } catch {
    showError('Could not sync. Please try again.');
  } finally {
    syncing.set(false);
  }
}
