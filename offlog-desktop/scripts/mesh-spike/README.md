# Mesh-sync spike

```bash
node mesh-spike.js
```

Spawns two real NyxDB instances on free ports into temp data directories,
runs four scenarios against them over HTTP, and cleans both up. Exit 0 =
every claim held. Needs `vendor/nyxdb-win/nyxdb.exe`
(`../fetch-nyxdb-win.ps1`).

Not a CI test: the binary is not committed, and `offlog-app/tests/` is for
things CI can run. This belongs with `../phase0-repro/`, the other
HTTP-level check against a real instance.

## What it answers

| | claim | result |
|---|---|---|
| S1 | Three-way convergence — A writes, B writes, both end up everywhere | holds |
| S2 | A client paired with one host receives data written to the other | holds |
| S3 | Concurrent writers into one NyxDB lose nothing (2 × 25 docs) | holds |
| S4 | A conflicting edit made on two peers while apart survives as a real conflict, and both peers pick the same winner | holds |

## What this settles

**The mesh topology needs no NyxDB change.** NyxDB implements the
replication source/target surface only — there is no `_replicate` and no
`_replicator` database, so it cannot initiate. The peer link here is
therefore driven by a client, and that is enough for every scenario above.
Server-initiated replication would be a simplification, not a prerequisite.

**NyxDB implements no `_all_docs`.** Replication drives off `_changes`, so
it never needs one, and Offlog only ever calls `allDocs` against its local
database — which is why this has never surfaced. The spike verifies server
contents by replicating into a fresh reader instead. Don't add an
`allDocs` call against a remote anywhere in the app.

## What it does NOT answer

- **Off-LAN.** mDNS is link-local. Two devices never on the same network
  still cannot reach each other; this removes the single-*host*
  dependency, not the same-*network* one.
- **Battery cost** on Android of attempting several unreachable peers.
- **Workspace identity.** Every install seeds the same four default IDs,
  so two unrelated Offlog workspaces on one LAN would merge silently.
  Nothing here guards against that — it is the design's real hazard and
  needs solving before any of this ships.
- **Scale.** 25 docs per writer, not a real database.
