#!/usr/bin/env node
/**
 * Privacy-preserving, read-only comparison for two offline FC27 career snapshots.
 * Reports offsets and counts, never record contents or game assets.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const MAGIC = 'FBCHUNKS';
const DEFAULT_BLOCK_SIZE = 4096;
const DEFAULT_MAX_REGIONS = 25;

function verifySave(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 18 ||
      bytes.toString('ascii', 0, 8) !== MAGIC) {
    throw new TypeError('Expected a nonempty FBCHUNKS save buffer.');
  }
}

export function analyzeSaveDifferences(before, after, {
  blockSize = DEFAULT_BLOCK_SIZE,
  maxRegions = DEFAULT_MAX_REGIONS,
} = {}) {
  verifySave(before);
  verifySave(after);
  if (!Number.isInteger(blockSize) || blockSize < 256 || blockSize > 65536 ||
      !Number.isInteger(maxRegions) || maxRegions < 1 || maxRegions > 1000) {
    throw new RangeError('Invalid comparison options.');
  }
  const commonBytes = Math.min(before.length, after.length);
  let differingBytes = 0;
  let changedGroups = 0;
  let current = null;
  const regions = [];
  const closeRegion = () => {
    if (current !== null) {
      changedGroups++;
      if (regions.length < maxRegions) regions.push(current);
      current = null;
    }
  };
  for (let offset = 0; offset < commonBytes; offset += blockSize) {
    const end = Math.min(offset + blockSize, commonBytes);
    let count = 0;
    let firstChanged = null;
    let lastChanged = null;
    for (let i = offset; i < end; i++) {
      if (before[i] === after[i]) continue;
      count++;
      if (firstChanged === null) firstChanged = i;
      lastChanged = i;
    }
    if (count === 0) {
      closeRegion();
    } else {
      differingBytes += count;
      if (current === null) {
        current = { startOffset: offset, endOffsetExclusive: end,
          differingBytes: count, firstChangedOffset: firstChanged, lastChangedOffset: lastChanged };
      } else {
        current.endOffsetExclusive = end;
        current.differingBytes += count;
        current.lastChangedOffset = lastChanged;
      }
    }
  }
  closeRegion();
  const sha256 = input => createHash('sha256').update(input).digest('hex');
  return {
    format: MAGIC,
    readOnly: true,
    beforeBytes: before.length,
    afterBytes: after.length,
    beforeSha256: sha256(before),
    afterSha256: sha256(after),
    identical: before.length === after.length && differingBytes === 0,
    differingCommonBytes: differingBytes,
    appendedOrRemovedBytes: Math.abs(before.length - after.length),
    blockSize,
    changedGroupCount: changedGroups,
    regionsTruncated: changedGroups > maxRegions,
    changedRegions: regions,
    note: 'Offsets and counts only. Changed bytes are not written or decoded.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath || resolve(beforePath) === resolve(afterPath)) {
    process.stderr.write('Usage: node scripts/diff-fc27-saves.mjs <offline-save-A> <offline-save-B>\n');
    process.exitCode = 2;
  } else {
    try {
      const [before, after] = await Promise.all([readFile(beforePath), readFile(afterPath)]);
      if (before.length > 64 * 1024 * 1024 || after.length > 64 * 1024 * 1024) {
        throw new RangeError('Save file exceeds 64 MiB safety limit.');
      }
      process.stdout.write(JSON.stringify(analyzeSaveDifferences(before, after), null, 2) + '\n');
    } catch (error) {
      process.stderr.write(String(error) + '\n');
      process.exitCode = 1;
    }
  }
}
