# FC 27 Manager Career format investigation

Status: **Read-only research; real FC 27 career save is not yet supported.**

Branch: `feature/fc27-career-container-readonly`

## Goal

Read the player's own EA SPORTS FC 27 Manager Career save on CachyOS/Lutris, ultimately exposing players, teams, ratings, potential, and contracts. Do not modify the original save until a separate writer milestone is validated.

## Verified local baseline (2026-11-18)

- Fork: `Dr-Soggy-Socks/eafc-db-kit`, based on the MIT-licensed TypeScript library.
- Node.js 26.10.0, npm 12.2.0, Git 2.56.0.
- `npm ci --ignore-scripts --no-audit --no-fund` succeeded.
- `npm run check` passed: **160 passed, 0 failed, 4 skipped**.
- A 15,793,835-byte career save was copied into a local test-only directory outside this repository. The original and copy had identical SHA-256 hashes.
- The original save **has not been modified**. **Never commit real save files, raw player exports, or game assets.**

## Real-file compatibility findings

`readEaFile(copyPath, { version: 'FC 27', tables: ['players', 'teams', 'teamplayerlinks'] })` fails with `TRUNCATED_FILE` at byte offset `112977`.

`readCareerData(copyPath)` fails with `INVALID_FORMAT` (named competition/standing sections not found).

The file starts with `FBCHUNKS` and has recognizable `BNRY` markers at offsets `102`, `1174`, `2460`, and `4879977`. It declares a payload size of 15,792,709 bytes, with an inferred 1,126-byte leading region.

Current signature scanning finds `DB 00 08` at offsets `112977` and `704599`. Neither candidate satisfies the assumptions of the current `parseDatabase` header logic; the first gives an out-of-range database length and table count, and the second gives an implausible table count when read at the parser's expected offset `+16`. The second candidate is near strings matching known database short codes (`lyxL`, `Knen`, `CZUM`, `RrqT`). **Their precise role is not yet established.** Do not assume either candidate is a valid DB header or that the save is corrupted.

The library's automated FC 27 coverage uses a real *squad* and synthetic *career* data. It does not yet cover real FC 27 career saves.

## Milestones

1. Add a strictly read-only `FBCHUNKS` structural probe with bounds checks and synthetic unit tests. No extracted player data written to disk.
2. Characterize BNRY records, legitimate database start points, directory/header layouts, and career sections using the local copy. Cross-check against public FC 26 format research; treat version differences explicitly.
3. Read player, team and team-player-link records with validated IDs and field semantics, then compare a few values to the game's UI.
4. Add regression tests that do **not** depend on any private save or copyrighted game data.
5. Only after read support passes, plan a no-change serialization to a **new file** and a game-load test. Guard single-field edits behind a separate milestone.

## Reference projects

- https://github.com/ViniMacacari/eafc-db-kit
- https://github.com/mhirst1992/fc26-save-parser (documented FC 26 `FBCHUNKS`, `BNRY`, and embedded DB research)
- https://github.com/xAranaktu/FIFASquadFileDownloader (independent `FBCHUNKS` file construction)

These are reference implementations, not proof that FC 27 uses identical layouts.

## Second investigation checkpoint — compact directory confirmed

A new bounds-checked read-only detector, `scripts/fc27-compact-directory.mjs`, identifies **one** compact directory starting at absolute offset 704599. Unlike the legacy T3DB layout, this candidate uses:

- signature `DB 00 08 00 00 00 00`;
- declared byte length as UInt32 LE at signature +8;
- 27 table entries as UInt32 LE at signature +12 (**not +16**);
- a 4-byte header word at +16;
- table codes and 32-bit offsets starting at +20;
- relative table offsets referenced from signature +24 + 8 × table count.

All 27 table names in this directory match the supplied FC27 XML: `teams`, `manager`, `players`, `teamplayerlinks`, `leagues`, `formations`, and others. Entry offsets are ordered, in bounds, and non-overlapping. This establishes a reliable directory index, **not** a usable record decoder.

The first `teams` range contains all 110 field short codes from the FC27 XML within its early metadata region. Many entries appear in compact 9-byte `shortCode(4) / depth(1) / cumulativeBitEnd(4)` sequences, with exceptional entries of different lengths. Ordinary club names are also recognizable within that range, confirming the location is meaningful; raw club entries have **not** been safely decoded into structured records. Other tables show different field placement and require further investigation.

Do **not** feed these compact table regions into the existing 36-byte-header/16-byte-field legacy T3DB parser. The layout differs. Do **not** attempt serialization or record edits yet. The current detector refuses writes by design.

Targeted synthetic tests: 7 passing, covering compact directory boundaries, name/offset validation, and legacy-format rejection. The diagnostic tool printed exactly one compact directory for the private test copy, and the full pre-change library suite was 160 passing/4 skipped.

## Third investigation checkpoint — field metadata recovered, records not yet decoded

The compact directory alone is not sufficient to locate physical table content: its offsets do **not** map to the T3DB reader's assumed physical table layout. Treat those offsets as format-specific and unresolved; do not use them for writes.

The read-only `scripts/fc27-compact-fields.mjs` now matches field descriptors in the **reverse-ASCII ordering of their 4-character short names**, as verified against the bundled FC27 XML. Descriptor gaps are **5, 8, 9, 11, or 16 bytes**. Width and storage-type checks are applied where their encoding is confirmed. Any unknown/implausible bit position remains `null`; no value is fabricated.

The inspection command is:

```sh
node scripts/inspect-fc27-field-metadata.mjs /path/to/private/CmMgrC...
```

The private FC27 test save yielded exactly **one** complete field-block match for each priority table:

| Table | XML fields matched | Field block start | Unknown offsets |
| --- | ---: | ---: | ---: |
| `players` | 152 / 152 | 1093726 | 1 |
| `teams` | 110 / 110 | 704861 | 5 |
| `teamplayerlinks` | 16 / 16 | 4113315 | 2 |

Player descriptors include `playerid` (bit offset 160), `potential` (377), `overallrating` (1113), `wage` (695) and `releaseclause` (1009). These are *serialized field metadata positions*; they have **not** been applied to verified player row boundaries.

We tested a fixed-row hypothesis against the local copy over several row sizes, alignments and sample lengths. None yielded reliable player statistics or a strong record-width signal. **No individual player records, player identities, ratings, or transfer values are decoded yet.** Record storage may require a different method and cannot be assumed fixed-width from the schema.

Next: characterize the physical player record segment and any per-row framing or encoding; verify multiple known player IDs and consistent field values before creating an editable copy. All analysis so far remains read-only. Do not upload any save or raw player data to GitHub.
