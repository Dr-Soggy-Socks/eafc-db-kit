/**
 * Experimental index of the compact directory observed in an FC27 Manager Career.
 * This is NOT the legacy T3DB header and does not decode or modify records.
 * A candidate is accepted only when all offsets and shortnames pass bounds checks.
 */
const magic = [0x44, 0x42, 0, 8, 0, 0, 0, 0];
const asciiFour = /^[A-Za-z]{4}$/;

export function findCompactDirectories(input, { maximumTables = 512 } = {}) {
  const bytes = Buffer.isBuffer(input)
    ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const results = [];
  for (let i = 0; i + 24 <= bytes.length; ++i) {
    if (bytes[i] !== magic[0] || bytes[i + 1] !== magic[1] ||
        !magic.every((byte, j) => bytes[i + j] === byte)) continue;
    const length = bytes.readUInt32LE(i + 8);
    const count = bytes.readUInt32LE(i + 12);
    if (length < 24 || count < 2 || count > maximumTables) continue;
    const end = i + length;
    const base = i + 24 + 8 * count;
    if (end > bytes.length || base >= end) continue;
    const entries = [];
    const seen = new Set();
    let previous = -1;
    let valid = true;
    for (let j = 0; j < count; j++) {
      const entry = i + 20 + 8 * j;
      const shortName = bytes.toString('ascii', entry, entry + 4);
      const relativeOffset = bytes.readUInt32LE(entry + 4);
      const absoluteOffset = base + relativeOffset;
      if (!asciiFour.test(shortName) || seen.has(shortName) ||
          relativeOffset <= previous || absoluteOffset >= end) {
        valid = false;
        break;
      }
      seen.add(shortName);
      entries.push({ shortName, relativeOffset, absoluteOffset });
      previous = relativeOffset;
    }
    if (!valid || entries[0].relativeOffset !== 0) continue;
    results.push({
      offset: i,
      byteLength: length,
      endOffset: end,
      tableCount: count,
      tableDataBase: base,
      tableDirectory: entries.map((entry, index) => ({
        ...entry,
        endOffset: entries[index + 1]?.absoluteOffset ?? end,
        allocatedBytes: (entries[index + 1]?.absoluteOffset ?? end) - entry.absoluteOffset,
      })),
      format: 'experimental-compact-directory',
      safeForWriting: false,
    });
  }
  return results;
}
