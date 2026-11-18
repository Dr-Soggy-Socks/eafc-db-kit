/**
 * Read-only FC27 field-descriptor probe.
 *
 * Observed compact career field identifiers are ordered by reversed shortname.
 * This parser is deliberately separate from the legacy T3DB binary reader.
 * It infers bit positions in the serialized field map, NOT game record values.
 */
const allowedGaps = [5, 8, 9, 11, 16];

export function findCompactFieldBlocks(input, schemaFields) {
  const bytes = Buffer.isBuffer(input)
    ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!Array.isArray(schemaFields) || schemaFields.length < 3) {
    throw new TypeError('At least three schema fields are required.');
  }
  const fields = schemaFields.map((entry) => ({
    shortName: entry.shortName,
    name: entry.name,
    depth: Number(entry.depth),
  }));
  if (fields.some((f) => !/^[A-Za-z]{4}$/.test(f.shortName) ||
      !Number.isInteger(f.depth) || f.depth < 0 || f.depth > 10_000) ||
      new Set(fields.map((f) => f.shortName)).size !== fields.length) {
    throw new TypeError('Invalid or duplicate schema field definition.');
  }
  const ordered = fields.sort((a, b) => {
    const x = a.shortName.split('').reverse().join('');
    const y = b.shortName.split('').reverse().join('');
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const first = Buffer.from(ordered[0].shortName, 'ascii');
  const hits = [];
  for (let start = bytes.indexOf(first); start !== -1;
    start = bytes.indexOf(first, start + 1)) {
    const descriptors = [];
    let cursor = start;
    let valid = true;
    for (let i = 0; i < ordered.length - 1; ++i) {
      const field = ordered[i];
      const next = Buffer.from(ordered[i + 1].shortName, 'ascii');
      if (cursor + 16 > bytes.length ||
          bytes.toString('ascii', cursor, cursor + 4) !== field.shortName) {
        valid = false;
        break;
      }
      const gap = allowedGaps.find((width) =>
        cursor + width + 4 <= bytes.length && bytes.subarray(cursor + width, cursor + width + 4).equals(next));
      if (gap === undefined) {
        valid = false;
        break;
      }
      if ([5, 9, 11].includes(gap) && bytes[cursor + 4] !== field.depth) {
        valid = false;
        break;
      }
      if (gap === 16 && (bytes.readUInt32LE(cursor + 4) !== field.depth ||
          ![0, 3, 4, 13, 14].includes(bytes.readUInt32LE(cursor + 8)))) {
        valid = false;
        break;
      }
      const rawOffset = [5, 11].includes(gap) ? null
        : bytes.readUInt32LE(cursor + (gap === 8 ? 4 : gap === 9 ? 5 : 12));
      // Some FC27 descriptors omit or reorder offsets. Preserve the field match,
      // but never treat implausible values as decoded bit positions.
      const bitOffset = rawOffset !== null && rawOffset <= 100_000 ? rawOffset : null;
      descriptors.push({ ...field, offset: cursor, serializedBytes: gap, bitOffset,
        storageType: gap === 16 ? bytes.readUInt32LE(cursor + 8) : null });
      cursor += gap;
    }
    if (!valid || cursor + 4 > bytes.length ||
        bytes.toString('ascii', cursor, cursor + 4) !== ordered.at(-1).shortName) {
      continue;
    }
    descriptors.push({ ...ordered.at(-1), offset: cursor, serializedBytes: null, bitOffset: null,
      storageType: null });
    hits.push({ startOffset: start, lastFieldOffset: cursor,
      matchedFields: descriptors.length, descriptors, safeForWriting: false });
  }
  return hits;
}
