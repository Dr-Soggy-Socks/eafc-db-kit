# FC27 Career Mode save editor — validated first milestone

**Status:** FC27 has loaded a separately patched career, displayed all six edited Ngumoha values, and retained them after an in-game save, full exit, and reload. This validates the outer CRC repair and six fields on one reference-backed player. It does **not** yet validate complete player discovery, generated players, arbitrary attributes, transfers, or live editing.

This prototype is built from separately archived FC27 career files and the bundled FC27 database template. It does **not** attach to, launch, inject into, or modify the running game.

## Start on Linux

From this repository, with Node 24+ and the built dist directory:

    node scripts/fc27-career-ui.mjs /absolute/path/to/offline/fc27-save-tests/CmMgrC... 8767

Then open **http://127.0.0.1:8767/** in a browser on the same computer. The service binds only to the loopback address.

In the UI:

1. Type a real-player name or ID in the player search.
2. Select a matched record.
3. Inspect its **career save potential** and **reference-database overall rating** (the latter is not an independently verified current Career Mode overall).
4. Choose a new potential (1–99).
5. Click **Create separate test save**. This writes a uniquely named file beginning with CmMgrCTest- next to the archived input **without overwriting anything**.

CLI equivalents:

    node scripts/fc27-career-player.mjs list /path/to/offline/fc27-save-tests/CmMgrC... 'Saka'
    node scripts/fc27-career-player.mjs inspect /path/to/offline/fc27-save-tests/CmMgrC... 246669
    node scripts/fc27-career-player.mjs patch /path/to/offline/fc27-save-tests/CmMgrC... 246669 95 /path/to/offline/fc27-save-tests/CmMgrCTest-unique-name

The patch command **refuses** to write outside a directory called fc27-save-tests, refuses existing outputs, and refuses absent or insufficiently matched player records. Do not commit game assets, actual saves, or exported player databases to Git.

## How the current lookup works

1. Load the packaged FC27 reference database and its XML player-field schema.
2. Verify selected reference rows have the expected 156-byte layout, ID, and potential bits.
3. Locate the full 152-field players metadata block in an offline career copy. The fresh Liverpool save uses a previously unseen 10-byte field descriptor (depth byte, zero marker, 32-bit offset); this variant is now recognized and regression-tested.
4. Scan a bounded region after that field block for exact, high-entropy 16-byte matching fragments of player reference rows.
5. Require at least **three agreeing fragments**, a unique best location, and at least **40/80** identical initial bytes to map an existing player ID to a career record position.
6. Read a potential field from bit **370**, 7 bits wide, with an offset of **+1**. When patching, require the saved original potential to equal the reference template value.
7. Change only that bit field in a new copy, re-read it from disk, and ensure no more than two bytes differ. Verify the original source SHA-256 is unchanged.

A more detailed targeted lookup can recover reference-listed players missed by the primary scan using three nonoverlapping 12-byte exact anchors. If a previously edited field breaks an anchor, two anchors may still support **inspection only**, not another edit. The matching approach does **not** resolve randomly generated academy players, staff, team memberships, contracts, or transfers.

## Six-attribute batch milestone

`scripts/fc27-career-batch.mjs` adds an independent, fail-closed multi-field editor and a corresponding six-field browser panel at `http://127.0.0.1:8767/`. The supported FC27 player fields are **potential**, **sprintspeed**, **finishing**, **shotpower**, **dribbling**, and **strength**. All are 7-bit values with a +1 range offset, entirely inside the stable first 80 bytes of an anchored player record. A fresh Liverpool snapshot and the bundled FC27 reference agreed for these fields in at least 98% of 20,845 located players; the selected player must match the reference exactly before being edited.

**Not supported:** overallrating, acceleration, stamina and fields beyond the 80-byte prefix. They were observed at mismatched or variable positions in many records. Career rows in the observed save have variable lengths; matching a reference prefix is not proof the remainder of the row matches the standalone database layout.

The batch writer:
- Checks all supplied field IDs, values, bit offsets, source template values, and match anchors before editing.
- Applies multiple attributes to a **new** `CmMgrCTest-Batch-*` file; source and game files are never overwritten.
- Performs independent field readback from the file as written, a full-byte compare against the planned patch, and a fresh source SHA-256 check.
- Optionally changes an existing in-game save title **without shifting any bytes** by requiring the replacement's UTF-8 encoding to have exactly the same byte length. This is experimental and is useful for distinguishing test copies in the load menu.

The targeted Liverpool test edits Ngumoha (ID 80376) in one pass: potential **88→99**, sprint speed **89→99**, finishing **72→90**, shot power **74→95**, dribbling **80→95**, and strength **44→75**. The attribute edits touch **8 bytes**. A separately titled test copy reads `Career – NGUMOHA TEST POT99` in its header; both title strings are 29 UTF-8 bytes.

**FC27 outer integrity:** three untouched career snapshots confirm that the UInt32 LE at byte `1142` is the standard CRC32 of bytes `[1174, EOF)`. The FC27 patchers now validate the source CRC and recalculate only this four-byte field after edits. Do not apply the generic 16-byte invalidation ranges from the upstream writer: they overlap FC27 career metadata. The corrected six-field test was subsequently accepted by FC27; all six target values were visible in-game and remained correct after saving, exiting, and reloading that test career. This validates that tested player record and those six fields, not every record or field in the save.

## Verified results on offline archives (2026-11-19)

- Later archived save: **8,085** candidate players identified from **21,623** reference player rows.
- Earlier archived save: **8,958** candidate players identified.
- Known candidates in the later archive include Bukayo Saka, Kylian Mbappé and Alexander Isak. All three had four exact anchors. A targeted fallback also identified **Rio Ngumoha (ID 80376, OVR 75, POT 88)** with three independent 12-byte anchors, agreeing with the game UI.
- An offline copy changing **Bukayo Saka (246669)** from **89** to **95** was written. Exactly **one byte** differed. Re-reading the output with the same scanner returned **95**.
- The archived input hash stayed unchanged. The active Career Mode save and FC27 process were never touched.
- An earlier offline test changed Ngumoha's potential from **88 to 99**, with **one changed byte**. A targeted read of that patched copy recovered **99** with two remaining anchors (inspection-only); the later six-field test is the in-game validation recorded below.
- Fresh Liverpool manager career snapshot `CmMgrC20261119062605986`: **20,845** reference-backed player records matched by the current scanner. The bundled reference catalogue contains **21,623** rows. Rio Ngumoha matched uniquely (ID **80376**, template OVR **75**, saved potential **88**, four 16-byte anchors, offset **1,498,605**).
- Independently generated test file `CmMgrCTest-Liverpool-Ngumoha-pot99-20261119` changed only **one byte**, left the archived source SHA-256 intact, and decoded as **99** on fresh readback. The local browser API also successfully produced its own distinct one-byte patch file from this snapshot.
- Full automated suite after the FC27 CRC fix: **193 passed, 0 failed, 4 skipped**; generated-type checks and TypeScript checks also pass.
- In-game test slot `Career – NGUMOHA TEST POT99`: potential **99**, sprint speed **99**, finishing **90**, shot power **95**, dribbling **95**, and strength **75** all confirmed in FC27. The career was saved in-game, FC27 was fully exited, and the same slot was reloaded; all edits persisted.

**Still unvalidated:** complete player-record boundaries and identity decoding; generated academy, regen and created players; all attributes outside the six tested fields; contracts, injuries, transfers and other player state; broad edits across many players; and live runtime editing. The save-file editor remains separate from a Live Editor-style F9 overlay.

## Next milestone — complete career player catalogue

The current reference-anchor scanner is a proven narrow path for known template-backed players, not the final player catalogue. The latest snapshot returns **20,845** matches; older snapshots returned 8,085 and 8,958. These are per-save match counts, not an 8,000-player product limit. The local browser API currently returns at most 100 results per search request (the CLI prints at most 60); those are presentation limits, not the total index size.

The next implementation must use the career save as its source of truth. It must discover every player record present in the save, including generated academy players, regens and created players, and then enrich known records from the bundled reference database. The reference database must not be used as an inclusion filter. The save contains two compact embedded database directories: the main database includes `players` and `teamplayerlinks`; the career-specific database includes `career_youthplayers` and `career_youthplayerhistory`. A native read-only decoder is needed because the legacy T3DB reader rejects these compact career tables.

The catalogue should index the full discovered set without an arbitrary total cap, while the UI uses search and pagination/virtualized rendering so a 100,000-player career would remain responsive. Only after the full read-only catalogue is reconciled and checked against in-game players should the editor expand beyond the six proven fields.

A Live Editor-style F9 overlay is a separate later milestone: it requires a runtime integration with the running FC27 process under Proton, a safe way to read/write live player state, and an overlay/hotkey. The existing save-file patcher does not provide that capability.
