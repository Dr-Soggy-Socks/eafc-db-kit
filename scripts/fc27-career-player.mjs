#!/usr/bin/env node
/**
 * EXPERIMENTAL FC27 offline career player inspector and patcher.
 * Works only on backed-up CmMgr saves. Never writes a live save.
 * Matches stable record prefixes to the bundled FC27 template; NOT a full career parser.
 */
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, basename, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTemplateDatabase } from '../dist/index.js';
import { XMLParser } from 'fast-xml-parser';
import { findCompactFieldBlocks } from './fc27-compact-fields.mjs';
import { assertValidFc27CareerCrc, refreshFc27CareerCrc } from './fc27-career-integrity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recordsStart = 1219340;
const recordsStride = 156;
const anchorOffsets = [4, 16, 28, 40, 52, 64];
const minAnchors = 3;
const potentialBit = 370;
const potentialDepth = 7;
const knownTemplateRows = 21623;

export function readBits(bytes, bit, width) {
  if (!Number.isSafeInteger(bit) || !Number.isSafeInteger(width) || bit < 0 ||
      width < 1 || width > 30 || bit + width > bytes.length * 8) throw new RangeError('Bit range outside input');
  let value = 0;
  for (let i = 0; i < width; i++) value += ((bytes[(bit + i) >>> 3] >>> ((bit + i) & 7)) & 1) * 2 ** i;
  return value;
}
export function writeBits(bytes, bit, width, value) {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) throw new RangeError('Value outside field range');
  readBits(bytes, bit, width);
  for (let i = 0; i < width; i++) {
    const location = (bit + i) >>> 3;
    const mask = 1 << ((bit + i) & 7);
    bytes[location] = (value & (1 << i)) ? bytes[location] | mask : bytes[location] & ~mask;
  }
}
function hash16(bytes, pos) {
  let h = 2166136261;
  for (let i = 0; i < 16; i++) h = Math.imul(h ^ bytes[pos + i], 16777619);
  return h >>> 0;
}
function entropyOk(bytes, pos) {
  const values = new Set();
  let zeroes = 0;
  for (let i = 0; i < 16; i++) {
    values.add(bytes[pos + i]);
    zeroes += bytes[pos + i] === 0 ? 1 : 0;
  }
  return values.size >= 7 && zeroes < 8;
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export async function buildCareerIndex(filePath) {
  const file = await realpath(filePath);
  if (!basename(file).startsWith('CmMgr')) throw new Error('Choose an offline CmMgr career save.');
  const [career, reference, template] = await Promise.all([
    readFile(file), readFile(join(root, 'templates/FC 27/fifa_ng_db.db')),
    readTemplateDatabase({ version: 'FC 27', tables: ['players', 'playernames'] }),
  ]);
  if (career.toString('ascii', 0, 8) !== 'FBCHUNKS') throw new Error('This is not an FC27 FBCHUNKS save.');
  const tables = template.databases[0]?.tables ?? [];
  const playerTable = tables.find(t => t.name === 'players');
  const nameTable = tables.find(t => t.name === 'playernames');
  if (!playerTable || !nameTable || playerTable.records.length !== knownTemplateRows) {
    throw new Error('The bundled FC27 player template is not the verified version.');
  }
  const names = new Map(nameTable.records.map(row => [row.nameid, row.name]));
  for (const j of [0, 250, 2500, 12000, 21000]) {
    const row = playerTable.records[j];
    const pos = (recordsStart + j * recordsStride) * 8;
    if (row.playerid !== readBits(reference, pos + 1040, 19) - 1 ||
        row.potential !== readBits(reference, pos + potentialBit, potentialDepth) + 1) {
      throw new Error('Template layout is not validated; refusing to decode/save.');
    }
  }
  const schemaXml = await readFile(join(root, 'templates/FC 27/fifa_ng_db-meta.xml'), 'utf8');
  const dbSchema = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(schemaXml).database;
  const playerSchema = dbSchema.table.find(t => t.name === 'players');
  const blocks = findCompactFieldBlocks(career, playerSchema.fields.field.map(f => ({
    shortName: f.shortname, name: f.name, depth: Number(f.depth),
  })));
  if (blocks.length !== 1) throw new Error('Expected one FC27 player field-map; got ' + blocks.length + '.');
  const scanStart = blocks[0].lastFieldOffset + 4;
  const scanEnd = Math.min(career.length - 96, scanStart + 3200000);
  const lookup = new Map();
  for (let j = 0; j < knownTemplateRows; j++) {
    for (const off of anchorOffsets) {
      const pos = recordsStart + j * recordsStride + off;
      if (!entropyOk(reference, pos)) continue;
      const key = hash16(reference, pos);
      let matches = lookup.get(key);
      if (!matches) lookup.set(key, matches = []);
      if (matches.length < 12) matches.push({ j, off, pos });
    }
  }
  const hitGroups = new Map();
  // Bound the scan to the player record region AFTER the detected field map.
  // Other save sections contain similar template bytes and MUST NOT be edited.
  for (let pos = scanStart; pos <= scanEnd; pos++) {
    const possible = lookup.get(hash16(career, pos));
    if (!possible) continue;
    for (const a of possible) {
      if (!career.subarray(pos, pos + 16).equals(reference.subarray(a.pos, a.pos + 16))) continue;
      const start = pos - a.off;
      if (start < 0 || start + 96 > career.length) continue;
      let starts = hitGroups.get(a.j);
      if (!starts) hitGroups.set(a.j, starts = new Map());
      starts.set(start, (starts.get(start) || 0) + 1);
    }
  }
  const players = [];
  for (const [j, starts] of hitGroups) {
    const candidates = [...starts].sort((a, b) => b[1] - a[1]);
    const [start, anchors] = candidates[0];
    if (anchors < minAnchors || (candidates[1] && candidates[1][1] === anchors)) continue;
    const refStart = recordsStart + j * recordsStride;
    let same = 0;
    for (let i = 0; i < 80; i++) same += career[start + i] === reference[refStart + i] ? 1 : 0;
    if (same < 40) continue;
    const row = playerTable.records[j];
    const rawPot = readBits(career, start * 8 + potentialBit, potentialDepth);
    const potential = rawPot + 1;
    if (potential < 1 || potential > 99) continue;
    const name = [names.get(row.firstnameid), names.get(row.lastnameid)].filter(Boolean).join(' ').trim();
    players.push({
      id: row.playerid, name: name || 'Player #' + row.playerid,
      templateOverall: row.overallrating, templatePotential: row.potential,
      careerPotential: potential, anchors, prefixMatched: same, offset: start,
    });
  }
  players.sort((a, b) => a.name.localeCompare(b.name));
  const catalog = playerTable.records.map((row, j) => ({
    id: row.playerid, j, name: [names.get(row.firstnameid), names.get(row.lastnameid)]
      .filter(Boolean).join(' ').trim() || 'Player #' + row.playerid,
    templateOverall: row.overallrating, templatePotential: row.potential,
  }));
  return { file, career, players, reference, catalog, triedIds: new Set(),
    inputHash: sha256(career), scanned: knownTemplateRows,
    scanStart, scanEnd,
    notice: 'Experimental matching: career player IDs inferred from matching FC27 template record prefixes; overall is a TEMPLATE rating, not verified live career overall.' };
}
/**
 * Targeted, bounded fallback for players with too few 16-byte anchors.
 * Requires three nonoverlapping 12-byte exact fragments, a strong 80-byte
 * similarity score, unique location, and matching potential.
 * Does not claim to recover generated academy players absent from the template.
 */
export function expandPlayerMatches(index, query) {
  const phrase = String(query ?? '').trim().toLocaleLowerCase();
  if (phrase.length < 4) return [];
  const targets = index.catalog.filter(row => row.name.toLocaleLowerCase().includes(phrase) ||
    String(row.id) === phrase);
  if (targets.length > 6) return []; // Avoid broad and expensive exploratory scans.
  const result = [];
  for (const target of targets) {
    if (index.players.some(row => row.id === target.id) || index.triedIds.has(target.id)) continue;
    index.triedIds.add(target.id);
    const refStart = recordsStart + target.j * recordsStride;
    const candidates = new Map();
    for (let off = 0; off <= 76; off += 2) {
      const fragment = index.reference.subarray(refStart + off, refStart + off + 12);
      if (new Set(fragment).size < 6 || fragment.filter(value => value === 0).length >= 7) continue;
      let pos = index.career.indexOf(fragment, index.scanStart);
      while (pos !== -1 && pos <= index.scanEnd) {
        const start = pos - off;
        if (start >= index.scanStart && start + 96 < index.scanEnd) {
          let exactOffsets = candidates.get(start);
          if (!exactOffsets) candidates.set(start, exactOffsets = new Set());
          exactOffsets.add(off);
        }
        pos = index.career.indexOf(fragment, pos + 1);
      }
    }
    const plausible = [];
    for (const [start, offsets] of candidates) {
      let last = -12, nonoverlap = 0;
      for (const off of [...offsets].sort((a, b) => a - b)) {
        if (off >= last + 12) {nonoverlap++;last = off;}
      }
      if (nonoverlap < 2) continue;
      let same = 0;
      for (let i = 0; i < 80; i++) same += index.career[start + i] ===
        index.reference[refStart + i] ? 1 : 0;
      if (same < 50) continue;
      const potential = readBits(index.career, start * 8 + potentialBit, potentialDepth) + 1;
      // Two independent matches can support inspection of an already edited
      // potential, but patchPotential still requires at least three anchors.
      plausible.push({start, nonoverlap, same, potential});
    }
    plausible.sort((a, b) => b.nonoverlap - a.nonoverlap || b.same - a.same);
    const winner = plausible[0], runnerUp = plausible[1];
    if (!winner || (runnerUp && runnerUp.nonoverlap === winner.nonoverlap &&
        runnerUp.same >= winner.same - 5)) continue;
    const player = {
      id: target.id, name: target.name,
      templateOverall: target.templateOverall, templatePotential: target.templatePotential,
      careerPotential: winner.potential,
      anchors: winner.nonoverlap, anchorWidth: 12,
      prefixMatched: winner.same, offset: winner.start,
    };
    index.players.push(player);
    result.push(player);
  }
  if (result.length) index.players.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
export async function patchPotential(index, playerId, newPotential, outputPath) {
  if (!Number.isInteger(playerId) || !Number.isInteger(newPotential) ||
      newPotential < 1 || newPotential > 99) throw new Error('Provide a valid player ID and potential (1-99).');
  const source = await realpath(index.file);
  const output = resolve(outputPath);
  if (dirname(output) !== dirname(source) || !dirname(source).endsWith('/fc27-save-tests') ||
      !basename(output).startsWith('CmMgrCTest-') || output === source) {
    throw new Error('Output must be a NEW CmMgrCTest-* file in the offline fc27-save-tests folder.');
  }
  const found = index.players.filter(p => p.id === playerId);
  if (found.length !== 1 || found[0].anchors < minAnchors || found[0].prefixMatched < 40) {
    throw new Error('Player not uniquely and confidently matched; refusing edit.');
  }
  const player = found[0];
  const sourceIntegrity = assertValidFc27CareerCrc(index.career);
  const bit = player.offset * 8 + potentialBit;
  const oldPotential = readBits(index.career, bit, potentialDepth) + 1;
  if (oldPotential !== player.templatePotential) throw new Error('Potential differs from validated template; unsupported career edit.');
  if (oldPotential === newPotential) throw new Error('New potential is identical to old value.');
  const clone = Buffer.from(index.career);
  writeBits(clone, bit, potentialDepth, newPotential - 1);
  if (readBits(clone, bit, potentialDepth) + 1 !== newPotential) throw new Error('Patch failed readback.');
  let changedBytes = 0;
  for (let i = 0; i < clone.length; i++) if (clone[i] !== index.career[i]) changedBytes++;
  if (changedBytes < 1 || changedBytes > 2) throw new Error('Changed more player-data bytes than expected.');
  const integrity = refreshFc27CareerCrc(clone);
  // We deliberately never target an active game prefix or overwrite an existing file.
  await writeFile(output, clone, { flag: 'wx', mode: 0o600 });
  const check = await readFile(output);
  if (!check.equals(clone)) throw new Error('Disk readback differs from generated patch.');
  const sourceCurrent = await readFile(source);
  if (sha256(sourceCurrent) !== index.inputHash) throw new Error('Source changed while writing; do not use output.');
  return {
    output, player, oldPotential, newPotential, changedBytes,
    sourceHash: index.inputHash, outputHash: sha256(clone), sourceIntegrity, integrity,
    warning: 'Experimental offline patch only. The FC27 outer CRC32 is recalculated, but career record serialization and in-game loading/persistence are not yet validated; do not replace your original career save.',
  };
}
export async function main(argv) {
  const [action, input, ...args] = argv;
  if (!action || !input || !['list', 'inspect', 'patch'].includes(action)) {
    throw new Error('Usage: node scripts/fc27-career-player.mjs list|inspect|patch <offline-CmMgr-save> [query|player-id] [potential] [output]');
  }
  const index = await buildCareerIndex(input);
  expandPlayerMatches(index, action === 'list' ? (args[0] ?? '') : String(args[0] ?? ''));
  if (action === 'list') {
    const query = (args[0] ?? '').toLowerCase();
    const filtered = index.players.filter(p => p.name.toLowerCase().includes(query) || String(p.id) === query).slice(0, 60);
    console.log(JSON.stringify({ matched: index.players.length, results: filtered, notice: index.notice }, null, 2));
  } else if (action === 'inspect') {
    console.log(JSON.stringify({ matched: index.players.length, player: index.players.find(p => p.id === Number(args[0])), notice: index.notice }, null, 2));
  } else {
    const report = await patchPotential(index, Number(args[0]), Number(args[1]), args[2]);
    console.log(JSON.stringify(report, null, 2));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 1; });
}
