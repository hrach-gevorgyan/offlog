# Mesh sync — scenario matrix

Written before any design is chosen. Every row is a situation the mesh has
to survive; the point is to test them and let the results pick the design,
not to argue the design and then look for supporting cases.

**Status key** — `spike` runs in `mesh-spike.js` today · `extend` can be
tested there with more work · `device` needs real hardware · `open` means
the expected behaviour is not yet decided.

Devices used below: **PC-A**, **PC-B**, **P1**, **P2** (two desktops, two
phones — the real setup this is for).

---

## A. Joining a workspace

| # | Situation | Expected | Test |
|---|---|---|---|
| A1 | Fresh install, nothing else exists | Creates its own workspace | spike |
| A2 | Fresh empty device pairs with an existing workspace | Adopts it, pulls everything | spike |
| A3 | Device with real data pairs with a different workspace | **Refused**, clear message, manual reset required | extend |
| A4 | Device re-pairs with the workspace it already belongs to | Allowed, no duplicate state | extend |
| A5 | Two fresh devices pair with each other, then both pair with a third | One workspace, not three | extend |
| A6 | Restore a backup onto a device already in another workspace | Adopts the backup's workspace | extend |
| A7 | Same person, two unrelated workspaces on one LAN, deliberately | Both visible, never auto-merge | extend |
| A8 | Pairing code entered on the wrong host | Fails on credentials, no partial state | device |

## B. Everyday sync

| # | Situation | Expected | Test |
|---|---|---|---|
| B1 | Two peers up, one edits | Other has it after sync | spike (S1) |
| B2 | Peer paired with one host receives another host's data | Arrives via the chain | spike (S2) |
| B3 | Two writers into one peer at once | Nothing lost | spike (S3) |
| B4 | Three peers, edits on all three | All converge | extend |
| B5 | Transitive spread: A→PC, later PC→B, A and B never meet | B gets A's changes | extend |
| B6 | Attachment written on one peer | Bytes arrive intact | extend |
| B7 | Task deleted on one peer while edited on another | Delete wins, no resurrection | extend |
| B8 | Large-ish database, first sync to a fresh device | Completes, no timeout | extend |

## C. Partition and reconvergence

| # | Situation | Expected | Test |
|---|---|---|---|
| C1 | Two peers on different networks, both edit different tasks | Both present after rejoin | extend |
| C2 | Same, both edit the **same** task | Conflict raised, both revisions kept | spike (S4) |
| C3 | Peer offline for a long time, many changes elsewhere | Catches up in one sync | extend |
| C4 | Peer offline, then rejoins with its own changes too | Two-way catch-up | extend |
| C5 | Network drops mid-sync | Resumes, no partial/corrupt state | extend |
| C6 | Peer's IP changes (DHCP) while paired | Rediscovered, sync resumes | device |
| C7 | Two peers rejoin but only one has its app open | Nothing syncs; no error state shown to user | open |

## D. Conflicts

| # | Situation | Expected | Test |
|---|---|---|---|
| D1 | Same field edited on two peers | One conflict, both revisions available | spike (S4) |
| D2 | Different fields of the same task | Still a conflict (doc-level) — confirm UI is sane | extend |
| D3 | Conflict created across three peers | Not silently multiplied | extend |
| D4 | Conflict resolved on one peer | Resolution propagates; loser does not come back | extend |
| D5 | Same conflict resolved differently on two peers at once | Deterministic outcome, no loop | extend |
| D6 | Two fresh installs pair (identical seed IDs) | Existing pristine-conflict handling still holds | extend |

## E. Liveness — who is actually up

| # | Situation | Expected | Test |
|---|---|---|---|
| E1 | PC-A on, PC-B off, P1 opens | Syncs with A | extend |
| E2 | PC-A off, PC-B on, P1 opens | Syncs with B, no re-pairing | extend |
| E3 | Both PCs off, P1 opens | Clear "nothing reachable", not an error | open |
| E4 | P1 and P2 both open, same wifi, no PC | Sync directly | open |
| E5 | P1 open, P2 closed, no PC | Nothing happens; sync when P2 opens | open |
| E6 | Both PCs on | They converge with each other | extend |
| E7 | A peer appears mid-session | Discovered and synced without reopening the app | device |
| E8 | Peer disappears mid-sync | Fails cleanly, tries the next | extend |

## F. Failure and recovery

| # | Situation | Expected | Test |
|---|---|---|---|
| F1 | Peer reachable but wrong credentials | Clear message, no retry storm | extend |
| F2 | Peer reachable but different workspace | Refused, named as such | extend |
| F3 | Peer's server dies mid-replication | No corruption either side | extend |
| F4 | Same device paired twice by mistake | Idempotent | extend |
| F5 | Clock skew between devices | Revisions still order correctly | extend |
| F6 | Device restored from backup rejoins | No duplicate docs, no mass conflicts | extend |

## G. Battery and background — phones only

| # | Situation | Expected | Test |
|---|---|---|---|
| G1 | App closed | Nothing runs at all | device |
| G2 | App backgrounded | Sync stops (today it lingers — this is a fix) | device |
| G3 | App open, idle | One connection, no polling loop | device |
| G4 | Background sync tick, no peer reachable | Gives up fast, no radio held | open |
| G5 | Background sync tick, peer reachable | Syncs and stops | open |
| G6 | Measured drain over a day vs today's build | **Not worse than today** | device |

---

## What has to be decided by testing, not opinion

1. **Can a phone serve at all?** Everything in E4/E5 depends on NyxDB
   running on Android. Until that is answered, phone-to-phone is theory.
2. **Is background sync worth its battery cost?** G4–G6 decide it. If the
   drain is measurable, it does not ship.
3. **What does a user see when nothing is reachable?** E3 and C7 are the
   difference between "calm" and "the app looks broken".
4. **Does aligning wake times actually make devices meet?** Only worth
   building if measurement says the overlap is real.

## Order of work

1. Extend `mesh-spike.js` to cover every `extend` row. Cheap, no devices.
2. Answer question 1 above — a throwaway NyxDB-on-Android build, nothing
   integrated.
3. Only then decide the design, and only then write app code.
