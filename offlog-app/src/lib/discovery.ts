import { writable } from 'svelte/store';
import { setSyncUrl, setSyncCredentials } from '../config';
import { startSync, clearLocalSeedBeforeFirstPair } from './db';

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
  startSync();
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
