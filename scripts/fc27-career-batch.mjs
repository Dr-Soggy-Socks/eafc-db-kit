#!/usr/bin/env node
/**
 * EXPERIMENTAL FC27 multi-field offline patcher.
 * A fresh FC27 career was compared against 21,623 bundled template players.
 * Only six independently validated fields wholly inside the stable first
 * 80 bytes of a player record are accepted. Never touches a live save.
 */
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTemplateDatabase } from '../dist/index.js';
import { buildCareerIndex, expandPlayerMatches, readBits, writeBits } from './fc27-career-player.mjs';

const expectedOffsets = Object.freeze({
  potential: 370,
  sprintspeed: 506,
  finishing: 447,
  shotpower: 615,
  dribbling: 454,
  strength: 540,
});
const referenceStart = 1219340;
const referenceStride = 156;
const stableRecordBits = 80 * 8;
let metadataPromise;

export function supportedFields() { return Object.keys(expectedOffsets); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

/** Renames only the NUL-terminated FBCHUNKS save title without shifting offsets. */
export function renameSameLengthTitle(bytes, title) {
  if (bytes.toString('ascii', 0, 8) !== 'FBCHUNKS') throw new Error('Not an FBCHUNKS save.');
  const end = bytes.indexOf(0, 18);
  if (end < 19 || end > 18 + 255) throw new Error('Save title header is invalid.');
  const encoded = Buffer.from(title, 'utf8');
  if (encoded.includes(0) || encoded.length !== end - 18) {
    throw new Error('Test title must have the same UTF-8 byte length as the original title.');
  }
  const clone = Buffer.from(bytes);
  encoded.copy(clone, 18);
  return { clone, title, originalTitle: bytes.toString('utf8', 18, end) };
}

async function metadata() {
  metadataPromise ??= (async () => {
    const data = await readTemplateDatabase({ version: 'FC 27', tables: ['players'] });
    const table = data.databases.flatMap(db => db.tables).find(t => t.name === 'players');
    if (!table || table.records.length !== 21623) {
      throw new Error('Unsupported FC27 template; refusing edits.');
    }
    const fields = {};
    for (const [name, bit] of Object.entries(expectedOffsets)) {
      const field = table.fields.find(f => f.name === name);
      if (!field || field.type !== 'integer' || field.depth !== 7 ||
          field.bitOffset !== bit || field.rangeLow !== 1 ||
          field.bitOffset + field.depth > stableRecordBits) {
        throw new Error('Unverified FC27 field layout: ' + name);
      }
      fields[name] = field;
    }
    return { fields, records: new Map(table.records.map((row, j) => [row.playerid, {row, j}])) };
  })();
  return metadataPromise;
}

function selectedPlayer(index, playerId) {
  const players = index.players.filter(p => p.id === playerId);
  if (players.length !== 1) throw new Error('Player not found uniquely in the career save.');
  return players[0];
}

export async function inspectBatchFields(index, playerId) {
  const player = selectedPlayer(index, playerId);
  const { fields, records } = await metadata();
  const source = records.get(playerId);
  if (!source) throw new Error('Player missing from FC27 template.');
  const result = {};
  for (const [name, field] of Object.entries(fields)) {
    const templateValue = source.row[name];
    const templateBytesValue = readBits(index.reference,
      (referenceStart + source.j * referenceStride) * 8 + field.bitOffset, field.depth) + field.rangeLow;
    if (templateBytesValue !== templateValue) {
      throw new Error('Reference bit layout mismatch for ' + name + '.');
    }
    const careerValue = readBits(index.career,
      player.offset * 8 + field.bitOffset, field.depth) + field.rangeLow;
    result[name] = {
      careerValue, templateValue,
      writable: player.anchors >= 3 && player.prefixMatched >= 40 &&
        careerValue === templateValue,
    };
  }
  return { player, fields: result };
}

/**
 * Pure patch primitive for test fixtures and validated player records.
 * Each field must have a known bit offset, width, and original value.
 */
export function applyFieldChanges(source, recordOffset, specs, changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('Changes must be an object of field names and integer values.');
  }
  const entries = Object.entries(changes);
  if (entries.length === 0) throw new Error('Specify at least one player field.');
  const clone = Buffer.from(source);
  const edits = [];
  for (const [name, next] of entries) {
    const spec = specs[name];
    if (!spec) throw new Error('Field is not supported: ' + name);
    if (!Number.isInteger(next) || next < 1 || next > 99) {
      throw new Error('Field ' + name + ' must be an integer from 1 to 99.');
    }
    const bit = recordOffset * 8 + spec.bitOffset;
    if (spec.bitOffset < 0 || spec.bitOffset + spec.depth > stableRecordBits ||
        bit + spec.depth > clone.length * 8) {
      throw new Error('Field outside verified record prefix: ' + name);
    }
    const old = readBits(source, bit, spec.depth) + spec.rangeLow;
    if (old !== spec.templateValue) {
      throw new Error('Career value differs from verified template: ' + name);
    }
    if (old === next) continue;
    writeBits(clone, bit, spec.depth, next - spec.rangeLow);
    if (readBits(clone, bit, spec.depth) + spec.rangeLow !== next) {
      throw new Error('Readback failed for ' + name);
    }
    edits.push({ name, from: old, to: next });
  }
  if (!edits.length) throw new Error('No values changed.');
  let changedBytes = 0;
  for (let i = 0; i < clone.length; i++) changedBytes += Number(clone[i] !== source[i]);
  if (changedBytes < 1 || changedBytes > 2 * edits.length) {
    throw new Error('Modified unexpected number of bytes.');
  }
  return { clone, edits, changedBytes };
}

export async function patchBatch(index, playerId, changes, outputPath, options = {}) {
  if (!Number.isInteger(playerId)) throw new Error('Invalid player ID.');
  const source = await realpath(index.file);
  const output = resolve(outputPath);
  if (dirname(output) !== dirname(source) ||
      !dirname(source).endsWith('/fc27-save-tests') ||
      !basename(output).startsWith('CmMgrCTest-Batch-') || source === output) {
    throw new Error('Output must be a NEW CmMgrCTest-Batch-* file beside the offline archive.');
  }
  const preview = await inspectBatchFields(index, playerId);
  if (preview.player.anchors < 3 || preview.player.prefixMatched < 40) {
    throw new Error('Not enough matching player anchors for a safe edit.');
  }
  const { fields } = await metadata();
  const specs = {};
  for (const [name, field] of Object.entries(fields)) {
    specs[name] = { ...field, templateValue: preview.fields[name].templateValue };
  }
  const { clone, edits, changedBytes } = applyFieldChanges(
    index.career, preview.player.offset, specs, changes);
  let outputBytes = clone;
  let titleChange = null;
  if (options.inGameName !== undefined) {
    if (typeof options.inGameName !== 'string') throw new Error('In-game title must be a string.');
    const renamed = renameSameLengthTitle(clone, options.inGameName);
    outputBytes = renamed.clone;
    titleChange = { from: renamed.originalTitle, to: renamed.title };
  }
  await writeFile(output, outputBytes, { flag: 'wx', mode: 0o600 });
  const check = await readFile(output);
  if (!check.equals(outputBytes)) throw new Error('Output readback differed.');
  for (const edit of edits) {
    const field = specs[edit.name];
    const got = readBits(check, preview.player.offset * 8 + field.bitOffset, field.depth) + field.rangeLow;
    if (got !== edit.to) throw new Error('On-disk attribute readback failed: ' + edit.name);
  }
  const sourceCurrent = await readFile(source);
  if (sha256(sourceCurrent) !== index.inputHash) {
    throw new Error('Original offline source changed during the operation.');
  }
  return {
    player: { id: preview.player.id, name: preview.player.name },
    edits, changedBytes, titleChange, output, sourceHash: index.inputHash, outputHash: sha256(outputBytes),
    notice: 'Offline only. The game accepting and persisting these edits is NOT yet proven.',
  };
}

async function main(args) {
  const [action, input, idText, valueText, output, title] = args;
  if (!['inspect', 'patch'].includes(action) || !input || !idText) {
    throw new Error('Usage: fc27-career-batch.mjs inspect <offline-save> <player-id> | patch <offline-save> <player-id> <JSON changes> <output>');
  }
  const index = await buildCareerIndex(input);
  const id = Number(idText);
  expandPlayerMatches(index, idText);
  if (action === 'inspect') {
    console.log(JSON.stringify(await inspectBatchFields(index, id), null, 2));
  } else {
    console.log(JSON.stringify(await patchBatch(index, id, JSON.parse(valueText), output,
      title === undefined ? {} : {inGameName:title}), null, 2));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  });
}
