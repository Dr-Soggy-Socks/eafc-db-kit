import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { assertValidFc27CareerCrc, inspectFc27CareerCrc, refreshFc27CareerCrc } from '../scripts/fc27-career-integrity.mjs';

function fixture() {
  const bytes = Buffer.alloc(1400);
  bytes.write('FBCHUNKS', 0, 'ascii');
  bytes.write('SaveType_Career\0', 1126, 'ascii');
  for (let i = 1174; i < bytes.length; i++) bytes[i] = (i * 37 + 11) & 255;
  bytes.writeUInt32LE(crc32(bytes.subarray(1174)), 1142);
  return bytes;
}

test('FC27 career CRC32 matches the save body beginning at byte 1174', () => {
  const bytes = fixture();
  const result = inspectFc27CareerCrc(bytes);
  assert.equal(result.valid, true);
  assert.equal(result.fieldOffset, 1142);
  assert.equal(result.coveredFrom, 1174);
  assert.deepEqual(assertValidFc27CareerCrc(bytes), result);
});

test('FC27 career CRC32 rejects changed data until recalculated', () => {
  const bytes = fixture();
  bytes[1200] ^= 0x40;
  assert.equal(inspectFc27CareerCrc(bytes).valid, false);
  assert.throws(() => assertValidFc27CareerCrc(bytes), /CRC32 is invalid/);
  const before = Buffer.from(bytes);
  const result = refreshFc27CareerCrc(bytes);
  assert.equal(result.fieldOffset, 1142);
  assert.equal(result.coveredFrom, 1174);
  assert.equal(inspectFc27CareerCrc(bytes).valid, true);
  const changed = [];
  for (let i = 0; i < bytes.length; i++) if (bytes[i] !== before[i]) changed.push(i);
  assert.deepEqual(changed, [1142, 1143, 1144, 1145]);
});

test('FC27 title bytes before the covered payload do not affect its CRC32', () => {
  const bytes = fixture();
  bytes.write('Test career', 18, 'ascii');
  assert.equal(inspectFc27CareerCrc(bytes).valid, true);
});
