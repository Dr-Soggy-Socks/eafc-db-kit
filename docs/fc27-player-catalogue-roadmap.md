# FC27 complete Career Mode player catalogue — engineering plan

## Product requirement

Build one searchable catalogue of **every player record present in the active Career Mode save**, with no fixed 8,000-, 20,000- or 100,000-player ceiling. If a save contains 100,000 player records, the backend must index all 100,000. The UI should search the entire index and paginate or virtualize results rather than trying to render every row at once.

The active career save is the source of truth. The bundled FC27 reference database is useful for enriching known players (names, baseline ratings and metadata), but it must never decide whether a player is included. Generated academy players, regens and created players must remain visible even when no reference-database match exists.

## Verified starting point (19 November 2026)

- The Ngumoha test career loaded in FC27; potential 99, sprint speed 99, finishing 90, shot power 95, dribbling 95 and strength 75 were all confirmed in-game. The user saved the career, fully exited FC27, reloaded the same slot and confirmed persistence.
- The latest archived Liverpool career snapshot returns **20,845** reference-backed matches from the current anchor scanner. The bundled template has **21,623** player rows. Older snapshots returned 8,085 and 8,958 matches; these are save-specific counts, not a hard-coded product limit.
- The current scanner is not a complete player decoder. It matches exact fragments against the template, requires multiple anchors, and cannot independently identify generated players that have no template row.
- The current scanner also hardcodes the reference row count (21,623) and a 3.2 MB scan window. Both must be replaced by save-derived discovery and validated bounds.
- The browser API returns at most 100 matching results per request and the CLI prints at most 60. These are display limits; the API's total count is separate. Replace this with explicit pagination/virtualized search, not a larger arbitrary cap.
- A real FC27 career save contains two compact embedded database directories. The main directory includes `players`, `teamplayerlinks`, `teams` and other roster tables. The career-specific directory includes `career_youthplayers` and `career_youthplayerhistory` among other tables. The legacy T3DB reader is not compatible with these compact career table layouts and must not be used on them.
- The observed main `players` metadata block contains 152 schema fields; the `career_youthplayers` metadata block contains five. Finding a field map is not, by itself, proof of row boundaries or field-value offsets.

## Implementation phases

### 1. Read-only complete discovery

- Parse both compact database directories and derive bounds from the save, not constants.
- Identify the physical record stream(s), framing, row boundaries and identity mapping for `players`.
- Decode every player row, including rows that cannot be matched to the bundled template.
- Decode and join `teamplayerlinks`, `career_youthplayers`, youth history/position attributes when present, regen attributes and created-player data when present.
- Preserve unknown records instead of silently dropping them. Give them a stable internal record key until a game player ID is decoded.
- Return provenance and confidence per field/record so the UI can distinguish decoded values, template-enriched values and unknown values.

### 2. Reconcile against the game

- Compare known players, IDs, names, team assignments and attributes with FC27 screens.
- Validate at least one generated youth player and one non-template career-created player, not only a reference-backed player.
- Reconcile the total discovered row count against table-level counts or independently established record boundaries. No arbitrary scan cutoff.
- Keep this phase read-only. Do not enable edits for a record until its identity, boundaries and fields are validated.

### 3. Expand save editing

- Use the decoded per-save record map, not template byte fingerprints, as the write target.
- Add all player attributes and then identity/age/position/contract/injury fields in independently validated groups.
- Keep original saves immutable; write a new test copy, update the outer CRC, read back every changed field and verify the game accepts it.
- Test edits on reference-backed, academy-generated and created players.

### 4. Complete catalogue UI

- Search the full backend index by name, ID, team, age, position and player category (senior, youth, regen, created).
- Provide pagination or virtualized scrolling with a truthful total count. A page size is not a cap on the catalogue.
- Show the source and confidence of values; do not present template overall/potential as current career values unless independently verified.

### 5. Live F9 overlay (separate project)

A Live Editor-style overlay is not an extension of the save-file patcher. It needs a runtime integration with FC27 under Proton, safe discovery of live player objects, a live read/write mechanism, hotkey handling (F9), and an overlay UI. Begin only after the save parser/editor is comprehensive and stable. The overlay must be tested separately from save-file editing.

## Safety and repository rules

- Never edit a save while FC27 is running or write over the original career.
- Keep real career saves, raw player exports and game assets outside Git.
- Use offline copies for parser research and regression fixtures; synthetic fixtures belong in tests.
- Fail closed when a record boundary, identity or field mapping is ambiguous.
