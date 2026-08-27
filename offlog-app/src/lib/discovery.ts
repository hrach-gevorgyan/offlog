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

// Mirrors pairing.rs exactly -- same tag strings, round count, and key
// sizes -- so this and the Rust side derive identical keys from the same
// (code, nonce) without either value crossing the network. See that
// module's own comment for the full protocol and its honest limit (a
// 6-digit code is still only a 6-digit code against a resourced offline
// attacker; this raises the bar from "instant plaintext read" to "costs
// real effort," not to "unbreakable").
const PBKDF2_ROUNDS = 210_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBits(code: string, nonce: Uint8Array, tag: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const salt = new Uint8Array(nonce.length + tag.length);
  salt.set(nonce);
  salt.set(encoder.encode(tag), nonce.length);
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ROUNDS, hash: 'SHA-256' }, keyMaterial, 256);
  return new Uint8Array(bits);
}

// Posts a proof of the code the user read off the PC's "Pair a device"
// screen to its one-shot pairing endpoint (pairing.rs) — on success,
// decrypts and stores the real per-install credentials it returns and
// starts syncing. The PC side invalidates the code the instant this
// succeeds (single-use), so this can't be replayed even by someone who
// saw it once.
//
// Neither the code nor the credentials it unlocks ever cross the network
// in the clear: a fresh nonce plus the code (typed here, never sent)
// derives an auth proof and a separate response-decryption key, matching
// what the PC side derives from the same nonce and its own copy of the
// code.
export async function pairWithHost(host: DiscoveredHost, code: string): Promise<void> {
  if (!host.pairingPort) throw new Error('This computer is running an older version of the Offlog desktop app — update it and try again.');
  const trimmedCode = code.trim();
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const proof = await deriveBits(trimmedCode, nonce, 'auth');

  let res: Response;
  try {
    res = await fetch(`http://${host.address}:${host.pairingPort}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: toBase64(nonce), proof: toBase64(proof) }),
    });
  } catch {
    // fetch() itself rejects (not a non-ok response) when the host is
    // unreachable -- off Wi-Fi, firewalled, asleep -- with a raw
    // TypeError ("Failed to fetch" / "NetworkError...") that means
    // nothing to a non-technical reader. The caller's catch block just
    // shows e.message verbatim, so the friendly text has to originate
    // here, not there.
    throw new Error("Couldn't reach that computer. Make sure it's turned on and both devices are on the same Wi-Fi network.");
  }
  if (!res.ok) throw new Error('Incorrect or expired code.');

  const envelope = (await res.json()) as { iv: string; ciphertext: string };
  const encKeyBits = await deriveBits(trimmedCode, nonce, 'enc');
  // lib.dom.d.ts types Uint8Array as generic over its backing buffer;
  // a plain `new Uint8Array(n)` infers Uint8Array<ArrayBufferLike>, which
  // BufferSource's stricter `ArrayBufferView<ArrayBuffer>` no longer
  // structurally accepts even though every one of these is a real,
  // ArrayBuffer-backed Uint8Array at runtime. Casts, not a real type gap.
  const encKey = await crypto.subtle.importKey('raw', encKeyBits as BufferSource, 'AES-GCM', false, ['decrypt']);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) as BufferSource }, encKey, fromBase64(envelope.ciphertext) as BufferSource);
  } catch {
    // A wrong code produces a wrong key, which AES-GCM's auth tag check
    // rejects outright rather than silently returning garbage -- the
    // built-in "did the wrong code even come back as noise" case reads
    // identically to a rejected/expired one from the user's side, so it
    // gets the same message.
    throw new Error('Incorrect or expired code.');
  }
  const data = JSON.parse(new TextDecoder().decode(plaintext)) as PairResponse;
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
