import { writable } from 'svelte/store';
import { setSyncUrl, getSyncUrl, setSyncCredentials, getPairedHostUuid, setPairedHostUuid } from '../config';
import { startSync, clearLocalSeedBeforeFirstPair, syncState } from './db';

// Android-side half of Track E's "no human ever types an IP" plan
// (ROADMAP.md E1) — listens for the PC app's `_offlog._tcp` mDNS
// broadcast (offlog-desktop/src-tauri/src/discovery.rs) and surfaces
// found hosts so Settings can offer "Found '<name>' — Connect?" instead
// of a blank URL field.
//
// mDNS itself still carries no credentials (see discovery.rs's own
// comment on why) — pairWithHost() below completes the handshake by
// hitting the PC's one-shot pairing endpoint (pairing.rs) with a code
// the user reads off the PC's own screen.

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

const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();

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

// Scans for 10 seconds and stops automatically — mirrors the intent of
// the "Find my server" one-shot action described in ROADMAP.md rather
// than a permanent background listener (matches Settings being the only
// place this is relevant, not a full-time drain on battery).
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
  if (!host.pairingPort) throw new Error('This device did not advertise a pairing port — update the PC app.');
  const res = await fetch(`http://${host.address}:${host.pairingPort}/pair`, {
    method: 'POST',
    body: code.trim(),
  });
  if (!res.ok) throw new Error('Incorrect or expired code.');
  const data = (await res.json()) as PairResponse;
  // Real bug found live: a freshly-installed phone's own default seed
  // (space:unsorted/personal/work, project:draft — fixed ids, not
  // per-install-random) collides with the PC's own independently-seeded
  // copies the moment sync starts, producing a real conflict per doc.
  // Clearing this device's pristine (zero-task) seed first lets the
  // upcoming pull just adopt the host's versions cleanly. See
  // clearLocalSeedBeforeFirstPair()'s own comment in db.ts.
  await clearLocalSeedBeforeFirstPair();
  setSyncCredentials(data.user, data.password);
  setSyncUrl(`http://${host.address}:${data.port}/offlog`);
  setPairedHostUuid(data.uuid);
  startSync();
}

// E2 (ROADMAP.md) — root cause of the owner's "not stable" report: this
// module already does a real mDNS scan at pairing time, but nothing ever
// re-checks afterward, so a DHCP-renewed LAN IP (or, rarer, a PC-side
// port change from a fresh install) silently breaks sync until someone
// notices and manually re-pairs. Matching by the server's stable `uuid`
// (not its IP) lets a fresh scan confirm "is this still the same PC I
// paired with, just at a different address" and self-heal.
//
// S4 (docs/IDEAS.md's sync-topology questions, 2026-07-20): this used to
// silently ignore any advertisement whose uuid didn't match the one being
// looked for, so a genuinely-changed host identity (the PC was wiped/
// reinstalled and got a fresh random uuid, or the phone was accidentally
// paired with the wrong device) meant this just timed out to null forever
// — reresolveHost() below returned false, and watchForStaleHost() did
// nothing further, with zero user-facing signal that anything was wrong
// beyond a generic "cannot reach sync server". Now also reports back the
// first *other* `_offlog._tcp` advertisement seen (if any), so
// watchForStaleHost() can distinguish "the paired host just isn't
// reachable right now" from "a different Offlog host exists on this
// network and it's not the one this device is paired with" — the latter
// is actionable (re-pair), the former isn't.
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
export async function reresolveHost(): Promise<boolean> {
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
    reresolveHost().then((updated) => { if (updated) startSync(); }).catch(() => {});
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
