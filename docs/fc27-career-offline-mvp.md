# FC27 offline Career Mode editor — experimental test build

**Status:** an offline backup-player lookup and single-field potential patch can now be tested in a browser. **NOT yet validated as a game-loadable Career Mode save editor.**

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

A more detailed targeted lookup can recover reference-listed players missed by the primary scan using three nonoverlapping 12-byte exact anchors. If a previously edited field breaks an anchor, two anchors may still support **inspection only**, not another edit. The matching approach does **not** resolve randomly generated academy players, staff, team memberships, contracts, or transfers. A successful in-memory edit is not proof of in-game persistence.

## Verified results on offline archives (2026-11-19)

- Later archived save: **8,085** candidate players identified from **21,623** reference player rows.
- Earlier archived save: **8,958** candidate players identified.
- Known candidates in the later archive include Bukayo Saka, Kylian Mbappé and Alexander Isak. All three had four exact anchors. A targeted fallback also identified **Rio Ngumoha (ID 80376, OVR 75, POT 88)** with three independent 12-byte anchors, agreeing with the game UI.
- An offline copy changing **Bukayo Saka (246669)** from **89** to **95** was written. Exactly **one byte** differed. Re-reading the output with the same scanner returned **95**.
- The archived input hash stayed unchanged. The active Career Mode save and FC27 process were never touched.
- A second offline test changed Ngumoha's potential from **88 to 99**, with **one changed byte**. A targeted read of that patched copy recovered **99** with two remaining anchors (inspection-only). No in-game validation yet.
- Fresh Liverpool manager career snapshot `CmMgrC20261119062605986`: **20,845** candidate players found. Rio Ngumoha matched uniquely (ID **80376**, template OVR **75**, saved potential **88**, four 16-byte anchors, offset **1,498,605**).
- Independently generated test file `CmMgrCTest-Liverpool-Ngumoha-pot99-20261119` changed only **one byte**, left the archived source SHA-256 intact, and decoded as **99** on fresh readback. The local browser API also successfully produced its own distinct one-byte patch file from this snapshot.
- Synthetic tests for bit-field reading, writing, metadata variants, and targeted lookup: **10 passed**.

**Unvalidated:** FC27 internal checksums; the game's acceptance of the modified career container; changed potential displayed in the game; whether the change persists after a game save. Never treat this build as a replacement for Live Editor until those checks pass.

## Next controlled game-load test (user present)

Keep original career saves backed up. Finish any active session, close FC27, and use a **disposable test career/save slot**. First verify that a byte-for-byte identical renamed copy loads in the game, then test a single-field modified copy under a game-recognizable test filename in that disposable slot. Do not overwrite an actual career save. If FC27 reports a damaged save, stop and investigate container integrity before any further changes.

A successful display check must be followed by saving the disposable career and reading the saved potential back. Until then this is a local editor prototype, not a validated in-game Career Mode editor.
