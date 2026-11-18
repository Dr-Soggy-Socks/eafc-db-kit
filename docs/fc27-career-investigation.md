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
