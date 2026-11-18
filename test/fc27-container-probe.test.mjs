import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCareerContainer } from '../scripts/probe-fc27-career.mjs';

const dbMagic = [0x44, 0x42, 0x00, 0x08];

test('reports FBCHUNKS metadata and BNRY markers without writing bytes', () => {
  const bytes = Buffer.alloc(320);
  bytes.write('FBCHUNKS', 0, 'ascii');
  bytes.writeUInt16LE(1, 8);
  bytes.writeUInt32LE(200, 14);
  bytes.write('Career Test', 18, 'utf8');
  bytes.write('BNRY', 100, 'ascii');
  bytes.write('LTLE', 108, 'ascii');
  bytes.write('SaveType_Manager', 128, 'ascii');
  bytes.set(dbMagic, 160);
  bytes.writeUInt32LE(10_000, 168);
  bytes.writeInt32LE(1, 176);
  const before = Buffer.from(bytes);

  const result = probeCareerContainer(bytes);
  assert.equal(result.magic, 'FBCHUNKS');
  assert.equal(result.containerVersion, 1);
  assert.equal(result.internalName, 'Career Test');
  assert.equal(result.inferredPrefixLength, 120);
  assert.deepEqual(result.bnryMarkers, [{ offset: 100, hasLittleEndianMarker: true }]);
  assert.equal(result.databaseCandidates.length, 1);
  assert.equal(result.databaseCandidates[0].matchesCurrentParserLayout, false);
  assert.match(result.databaseCandidates[0].reasons.join(', '), /outside file bounds/);
  assert.deepEqual(bytes, before);
});

test('distinguishes a structurally plausible standard DB header', () => {
  const bytes = Buffer.alloc(96);
  bytes.set(dbMagic, 0);
  bytes.writeInt32LE(64, 8);
  bytes.writeInt32LE(0, 16);

  const result = probeCareerContainer(new Uint8Array(bytes));
  assert.equal(result.databaseCandidates.length, 1);
  assert.equal(result.databaseCandidates[0].matchesCurrentParserLayout, true);
});

test('rejects an out-of-bounds directory entry even when the magic matches', () => {
  const bytes = Buffer.alloc(256);
  bytes.set(dbMagic, 24);
  bytes.writeInt32LE(160, 24 + 8);
  bytes.writeInt32LE(1, 24 + 16);
  bytes.write('ABCD', 24 + 24, 'ascii');
  bytes.writeUInt32LE(200, 24 + 28);

  const result = probeCareerContainer(bytes);
  assert.equal(result.databaseCandidates.length, 1);
  assert.equal(result.databaseCandidates[0].matchesCurrentParserLayout, false);
  assert.match(result.databaseCandidates[0].reasons.join(', '), /table entry 0/);
});

test('handles small and unknown buffers without throwing', () => {
  assert.deepEqual(probeCareerContainer(Buffer.alloc(0)).databaseCandidates, []);
  assert.equal(probeCareerContainer(Buffer.from('not a save')).magic, 'not a sa');
});
