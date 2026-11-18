import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbSignature = Buffer.from([0x44, 0x42, 0x00, 0x08]);
const standardHeaderLength = 28;
const maxPlausibleTables = 2_048;

function findOffsets(bytes, needle) {
  const offsets = [];
  for (let position = bytes.indexOf(needle); position !== -1;
    position = bytes.indexOf(needle, position + needle.length)) {
    offsets.push(position);
  }
  return offsets;
}

function inspectDatabaseCandidate(bytes, offset) {
  const platformFlag = bytes[offset + 4];
  const endianness = platformFlag === 1 ? 'big' : 'little';
  const length = endianness === 'big'
    ? bytes.readInt32BE(offset + 8) : bytes.readInt32LE(offset + 8);
  const count = endianness === 'big'
    ? bytes.readInt32BE(offset + 16) : bytes.readInt32LE(offset + 16);
  const reasons = [];

  if (platformFlag > 1 || bytes[offset + 5] !== 0 ||
      bytes[offset + 6] !== 0 || bytes[offset + 7] !== 0) {
    reasons.push('unexpected platform or reserved bytes');
  }
  if (length < standardHeaderLength || offset + length > bytes.length) {
    reasons.push('database length outside file bounds');
  }
  if (count < 0 || count > maxPlausibleTables) {
    reasons.push('implausible table count at offset +16');
  }

  if (reasons.length === 0) {
    const directoryEnd = offset + standardHeaderLength + count * 8;
    if (directoryEnd > offset + length) {
      reasons.push('table directory exceeds declared database bounds');
    } else {
      for (let i = 0; i < count; i++) {
        const entry = offset + 24 + i * 8;
        const relative = endianness === 'big'
          ? bytes.readUInt32BE(entry + 4) : bytes.readUInt32LE(entry + 4);
        if (directoryEnd + relative + 36 > offset + length) {
          reasons.push(`table entry ${i} points outside database bounds`);
          break;
        }
      }
    }
  }

  return {
    offset,
    endianness,
    declaredByteLength: length,
    declaredTableCount: count,
    matchesCurrentParserLayout: reasons.length === 0,
    reasons,
  };
}

/**
 * Structural reconnaissance only. No decryption, record decoding, or writes.
 * A matching signature does not prove a valid embedded database.
 */
export function probeCareerContainer(input) {
  const bytes = Buffer.isBuffer(input)
    ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const magic = bytes.length >= 8 ? bytes.toString('ascii', 0, 8) : '';
  const nameEnd = bytes.length > 18
    ? bytes.indexOf(0, 18) : -1;
  const name = nameEnd >= 18 && nameEnd <= 18 + 255
    ? bytes.toString('utf8', 18, nameEnd) : null;
  const hasPayloadHeader = bytes.length >= 18 && magic === 'FBCHUNKS';
  const declaredPayloadLength = hasPayloadHeader ? bytes.readUInt32LE(14) : null;
  const saveTypeOffset = bytes.indexOf('SaveType_');
  const bnryOffsets = findOffsets(bytes, Buffer.from('BNRY'));

  return {
    magic,
    byteLength: bytes.length,
    containerVersion: hasPayloadHeader ? bytes.readUInt16LE(8) : null,
    internalName: name,
    declaredPayloadLength,
    inferredPrefixLength: declaredPayloadLength !== null &&
      declaredPayloadLength <= bytes.length ? bytes.length - declaredPayloadLength : null,
    saveTypeOffset: saveTypeOffset >= 0 ? saveTypeOffset : null,
    bnryMarkers: bnryOffsets.map((offset) => ({
      offset,
      hasLittleEndianMarker: bytes.toString('ascii', offset + 8, offset + 12) === 'LTLE',
    })),
    databaseCandidates: findOffsets(bytes, dbSignature)
      .filter((offset) => offset + standardHeaderLength <= bytes.length)
      .map((offset) => inspectDatabaseCandidate(bytes, offset)),
    note: 'Read-only structural probe; candidate database headers may be false positives.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('Usage: node scripts/probe-fc27-career.mjs <path-to-private-save>\n');
    process.exitCode = 2;
  } else {
    try {
      const bytes = await readFile(filePath);
      process.stdout.write(JSON.stringify(probeCareerContainer(bytes), null, 2) + '\n');
    } catch (error) {
      process.stderr.write(`Unable to probe save: ${String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
