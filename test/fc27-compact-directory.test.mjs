import test from 'node:test';
import assert from 'node:assert/strict';
import { findCompactDirectories } from '../scripts/fc27-compact-directory.mjs';

function makeFixture() {
  const bytes = Buffer.alloc(350);
  const pos = 48;
  bytes.set([0x44, 0x42, 0, 8, 0, 0, 0, 0], pos);
  bytes.writeUInt32LE(230, pos + 8);
  bytes.writeUInt32LE(3, pos + 12);
  bytes.writeUInt32LE(0x12345678, pos + 16);
  const entries = [['lyxL', 0], ['CZUM', 40], ['RrqT', 140]];
  for (const [i, [shortName, offset]] of entries.entries()) {
    bytes.write(shortName, pos + 20 + i * 8);
    bytes.writeUInt32LE(offset, pos + 24 + i * 8);
  }
  return bytes;
}

test('recognises compact directory and exact record-region boundaries', () => {
  const bytes = makeFixture();
  const original = Buffer.from(bytes);
  const [directory] = findCompactDirectories(bytes);
  assert.ok(directory);
  assert.equal(directory.offset, 48);
  assert.equal(directory.tableCount, 3);
  assert.deepEqual(directory.tableDirectory.map(({shortName}) => shortName), ['lyxL','CZUM','RrqT']);
  assert.equal(directory.tableDirectory[0].allocatedBytes, 40);
  assert.equal(directory.tableDirectory[1].allocatedBytes, 100);
  assert.equal(directory.tableDirectory[2].allocatedBytes, 42);
  assert.equal(directory.safeForWriting, false);
  assert.deepEqual(bytes, original);
});

test('rejects duplicate table names, backward offsets, and out-of-bounds regions', () => {
  const bytes = makeFixture();
  bytes.write('lyxL', 48 + 20 + 8);
  assert.deepEqual(findCompactDirectories(bytes), []);
  const bytes2 = makeFixture();
  bytes2.writeUInt32LE(10, 48 + 24 + 16);
  assert.deepEqual(findCompactDirectories(bytes2), []);
  const bytes3 = makeFixture();
  bytes3.writeUInt32LE(500, 48 + 24 + 16);
  assert.deepEqual(findCompactDirectories(bytes3), []);
});

test('does not mistake a legacy T3DB header for a compact directory', () => {
  const bytes = Buffer.alloc(256);
  bytes.set([0x44, 0x42, 0, 8, 0, 0, 0, 0], 0);
  bytes.writeUInt32LE(180, 8);
  bytes.writeUInt32LE(3, 16); // Legacy T3DB table-count position.
  assert.deepEqual(findCompactDirectories(bytes), []);
});
