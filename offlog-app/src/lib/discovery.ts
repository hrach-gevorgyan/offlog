import { writable } from 'svelte/store';
import { setSyncUrl, getSyncUrl, setSyncCredentials, getPairedHostUuid, setPairedHostUuid } from '../config';
import { startSync, clearLocalSeedBeforeFirstPair, syncState } from './db';

// Device-side half of "no human ever types an IP": listens for the PC app's
// `_offlog._tcp` mDNS broadcast and surfaces found hosts so Settings can
// offer "Found '<name>' — Connect?" instead of a blank URL field.
//
// mDNS carries no credentials. pairWithHost() below completes the handshake
// by hitting the PC's one-shot pairing endpoint with a code the user reads
// off the PC's own screen.

const SERVICE_TYPE = '_offlog._tcp.';
const DOMAIN = 'local.';

export interface DiscoveredHost {
  name: string;
  url: string;
  uuid: string;
  address: string;
  pairingPort: number | null;
}

export const discoveredHosts = writable<DiscoveredHost[]>([]);
export const isScanning = writable(false);

const isNative = () => !!window.Capacitor?.isNativePlatform?.();

let watchId: string | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

function upsert(host: DiscoveredHost) {
  discoveredHosts.update((hosts) => {
    const rest = hosts.filter((h) => h.uuid !== host.uuid);
    return [...rest, host];
  });
}

function remove(uuid: string) {
  discoveredHosts.update((hosts) => hosts.filter((h) => h.uuid !== uuid));
}

// Scans for 10 seconds and stops automatically — a one-shot "Find my server"
// action, not a permanent background listener: Settings is the only place
// this is relevant, and a full-time listener would drain battery.
export async function scanForHosts(): Promise<void> {
  if (!isNative()) return;
  const { ZeroConf } = await import('capacitor-zeroconf');

  discoveredHosts.set([]);
  isScanning.set(true);

  watchId = await ZeroConf.watch({ type: SERVICE_TYPE, domain: DOMAIN }, (result) => {
    const { action, service } = result;
    const uuid = service.txtRecord?.uuid;
    if (!uuid) return;
    if (action === 'removed') {
      remove(uuid);
      return;
    }
    const address = service.ipv4Addresses?.[0];
    if (!address) return;
    const name = service.txtRecord?.name || service.name;
    const pairingPortStr = service.txtRecord?.pairing_port;
    upsert({
      name,
      uuid,
      address,
      url: `http://${address}:${service.port}/offlog`,
      pairingPort: pairingPortStr ? Number(pairingPortStr) : null,
    });
  });

  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = setTimeout(() => { stopScan().catch(() => {}); }, 10_000);
}

interface PairResponse {
  port: number;
  user: string;
  password: string;
  uuid: string;
}

// Posts the code the user read off the PC's "Pair a device" screen to
// its one-shot pairing endpoint (pairing.rs) — on success, stores the
// real per-install credentials it returns and starts syncing. The PC
// side invalidates the code the instant this succeeds (single-use), so
// this can't be replayed even by someone who saw it once.
export async function pairWithHost(host: DiscoveredHost, code: string): Promise<void> {
  if (!host.pairingPort) throw new Error('This computer is running an older version of the Offlog desktop app — update it and try again.');
  const res = await fetch(`http://${host.address}:${host.pairingPort}/pair`, {
    method: 'POST',
    body: code.trim(),
  });
  if (!res.ok) throw new Error('Incorrect or expired code.');
  const data = (await res.json()) as PairResponse;
  // A freshly-installed device's own default seed (space:unsorted/personal/
  // work, project:draft — fixed ids, not per-install-random) collides with
  // the PC's independently-seeded copies the moment sync starts, producing a
  // conflict per doc. Clearing this device's pristine (zero-task) seed first
  // lets the upcoming pull adopt the host's versions cleanly. See
  // clearLocalSeedBeforeFirstPair() in db.ts.
  await clearLocalSeedBeforeFirstPair();
  await setSyncCredentials(data.user, data.password);
  setSyncUrl(`http://${host.address}:${data.port}/offlog`);
  setPairedHostUuid(data.uuid);
  startSync().catch(() => {});
}

// mDNS is scanned again after pairing, not only at pairing time: a
// DHCP-renewed LAN IP (or a PC-side port change from a fresh install) would
// otherwise silently break sync until someone manually re-pairs. Matching on
// the server's stable `uuid` rather than its IP lets a fresh scan confirm
// "still the same PC, just at a different address" and self-heal.
//
// Also reports back the first *other* `_offlog._tcp` advertisement seen, so
// watchForStaleHost() can distinguish "the paired host just isn't reachable
// right now" from "a different Offlog host exists on this network and it
// isn't the one this device is paired with". Only the latter is actionable
// (re-pair); ignoring non-matching advertisements entirely would leave a
// wiped/reinstalled host (fresh uuid) or a mis-pairing with no signal at all
// beyond a generic "cannot reach sync server".
interface HostResolveResult {
  address: string | null;
  otherHost: { uuid: string; name: string } | null;
}

// A short one-shot scan, same 10s window as scanForHosts()'s user-facing
// one, but headless — doesn't touch the discoveredHosts/isScanning UI
// stores, since this runs in the background, not from the pairing screen.
async function findPairedHostAddress(uuid: string): Promise<HostResolveResult> {
  const { ZeroConf } = await import('capacitor-zeroconf');
  return new Promise((resolve) => {
    let settled = false;
    let id: string | null = null;
    let otherHost: { uuid: string; name: string } | null = null;
    const finish = (address: string | null) => {
      if (settled) return;
      settled = true;
      if (id) ZeroConf.unwatch({ type: SERVICE_TYPE, domain: DOMAIN }).catch(() => {});
      resolve({ address, otherHost });
    };
    ZeroConf.watch({ type: SERVICE_TYPE, domain: DOMAIN }, (result) => {
      const { action, service } = result;
      if (action === 'removed') return;
      const seenUuid = service.txtRecord?.uuid;
      if (!seenUuid) return;
      if (seenUuid !== uuid) {
        otherHost = { uuid: seenUuid, name: service.txtRecord?.name || service.name };
        return;
      }
      const address = service.ipv4Addresses?.[0];
      if (!address) return;
      finish(`http://${address}:${service.port}/offlog`);
    }).then((watchId) => { id = watchId; }).catch(() => finish(null));
    setTimeout(() => finish(null), 10_000);
  });
}

// Set when a re-resolve scan sees a different Offlog host on the network
// but can't find the one this device is actually paired with — surfaced
// in the UI (Sidebar) as an actionable "re-pair?" prompt, distinct from
// the generic "can't reach sync server" state. Cleared the moment the
// paired host is found again.
export const staleHostAlert = writable<{ uuid: string; name: string } | null>(null);

// Re-resolves the paired PC's current address and updates the stored
// sync URL if it's changed. Returns whether anything was updated, so the
// caller knows whether it's worth kicking off a fresh sync attempt.
async function reresolveHost(): Promise<boolean> {
  if (!isNative()) return false;
  const uuid = getPairedHostUuid();
  if (!uuid) return false; // never paired via mDNS (e.g. a manually-typed URL)
  const { address, otherHost } = await findPairedHostAddress(uuid);
  if (!address) {
    if (otherHost) staleHostAlert.set(otherHost);
    return false;
  }
  staleHostAlert.set(null);
  if (address === getSyncUrl()) return false;
  setSyncUrl(address);
  return true;
}

// Wire once at app startup (store.ts's init()) — listens for sync
// settling into a "can't reach the server" state and tries a re-resolve,
// throttled so a genuinely-offline device doesn't trigger a scan on
// every single failed sync attempt.
const RERESOLVE_COOLDOWN_MS = 5 * 60 * 1000;
let lastReresolveAttempt = 0;

export function watchForStaleHost() {
  if (!isNative()) return;
  syncState.listeners.add(() => {
    if (syncState.status !== 'error') return;
    if (!/cannot reach sync server/i.test(syncState.error ?? '')) return;
    const now = Date.now();
    if (now - lastReresolveAttempt < RERESOLVE_COOLDOWN_MS) return;
    lastReresolveAttempt = now;
    // The startSync() promise is deliberately *returned*, not just called:
    // that chains it into the .catch below. Calling it bare would leave a
    // floating, unhandled promise.
    reresolveHost().then((updated) => (updated ? startSync() : undefined)).catch(() => {});
  });
}

export async function stopScan(): Promise<void> {
  if (!isNative()) return;
  isScanning.set(false);
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  if (!watchId) return;
  const { ZeroConf } = await import('capacitor-zeroconf');
  await ZeroConf.unwatch({ type: SERVICE_TYPE, domain: DOMAIN }).catch(() => {});
  watchId = null;
}
