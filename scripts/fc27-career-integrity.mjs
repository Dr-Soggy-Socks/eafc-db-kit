/** FC27 Manager Career FBCHUNKS outer integrity field. */
import { crc32 } from 'node:zlib';

export const FC27_CAREER_CRC_OFFSET = 1142;
export const FC27_CAREER_CRC_START = 1174;

function asCareerBuffer(input) {
  const bytes = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length <= FC27_CAREER_CRC_START ||
      bytes.toString('ascii', 0, 8) !== 'FBCHUNKS' ||
      bytes.toString('ascii', 1126, 1142) !== 'SaveType_Career\0') {
    throw new Error('Unsupported FC27 Manager Career save header.');
  }
  return bytes;
}

/** Check the stored CRC32 against the bytes covered by the FC27 Career header. */
export function inspectFc27CareerCrc(input) {
  const bytes = asCareerBuffer(input);
  const stored = bytes.readUInt32LE(FC27_CAREER_CRC_OFFSET);
  const calculated = crc32(bytes.subarray(FC27_CAREER_CRC_START));
  return { stored, calculated, valid: stored === calculated,
    fieldOffset: FC27_CAREER_CRC_OFFSET, coveredFrom: FC27_CAREER_CRC_START };
}

export function assertValidFc27CareerCrc(input) {
  const result = inspectFc27CareerCrc(input);
  if (!result.valid) {
    throw new Error(`Source FC27 Career CRC32 is invalid (stored ${result.stored.toString(16).padStart(8, '0')}, calculated ${result.calculated.toString(16).padStart(8, '0')}); refusing to edit.`);
  }
  return result;
}

/** Recalculate only the four-byte FC27 Career CRC field; preserve adjacent metadata. */
export function refreshFc27CareerCrc(input) {
  const bytes = asCareerBuffer(input);
  const previous = bytes.readUInt32LE(FC27_CAREER_CRC_OFFSET);
  const calculated = crc32(bytes.subarray(FC27_CAREER_CRC_START));
  bytes.writeUInt32LE(calculated, FC27_CAREER_CRC_OFFSET);
  const verified = inspectFc27CareerCrc(bytes);
  if (!verified.valid) throw new Error('FC27 Career CRC32 readback failed.');
  return { previous, crc32: calculated, fieldOffset: FC27_CAREER_CRC_OFFSET,
    coveredFrom: FC27_CAREER_CRC_START };
}
