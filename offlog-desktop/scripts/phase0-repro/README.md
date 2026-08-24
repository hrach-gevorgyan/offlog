# NyxDB full-sync regression scripts

Preserved from the 2026-07-27 NyxDB adoption's Phase 0 root-cause check
(see `docs/DECISIONS.md`'s NyxDB entries). Each script does a real
`db.sync()` full pull from a genuinely empty PouchDB (memory adapter)
against a locally running NyxDB instance, to catch a regression of the
"problem getting docs" failure investigated that day.

`offlog-app/tests/replication.test.ts` now covers replication
automatically in CI, but only between two in-memory databases. These
scripts remain the only check of replication over HTTP against a real
NyxDB instance.

Usage: start a local NyxDB instance (`vendor/nyxdb-win/nyxdb.exe`, or via
`fetch-nyxdb-win.ps1`), create an `offlog` database, seed it with some
docs, then edit each script's `remote` URL/credentials to match and run
with `node repro.js` / `repro2.js` / `repro3.js` (default batch size,
small batch size + deep revision history + a real conflict, and
`live:true/retry:true` respectively). All three should complete with
zero errors.
