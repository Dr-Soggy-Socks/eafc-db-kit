import test from 'node:test';
import assert from 'node:assert/strict';
import { readBits, writeBits, expandPlayerMatches } from '../scripts/fc27-career-player.mjs';

test('FC27 career potential bits read and change without disturbing neighbors', () => {
  const bytes = Buffer.from([0xff, 0xff, 0x7f, 0x5a, 0x01, 0x23, 0x45]);
  const original = Buffer.from(bytes);
  const bit = 9, width = 7;
  writeBits(bytes, bit, width, 94);
  assert.equal(readBits(bytes, bit, width), 94);
  for (let i = 0; i < bytes.length * 8; i++) {
    if (i >= bit && i < bit + width) continue;
    assert.equal(readBits(bytes, i, 1), readBits(original, i, 1), 'neighbor bit ' + i);
  }
});
test('FC27 career potential at real template bit position decodes correctly', () => {
  const bytes = Buffer.alloc(120);
  writeBits(bytes, 370, 7, 88);
  assert.equal(readBits(bytes, 370, 7) + 1, 89);
  writeBits(bytes, 370, 7, 94);
  assert.equal(readBits(bytes, 370, 7) + 1, 95);
  assert.equal(bytes.subarray(0, 46).every(b => b === 0), true);
  assert.equal(bytes.subarray(48).every(b => b === 0), true);
});
test('bit encoder refuses out-of-range potential and partial record access', () => {
  const bytes = Buffer.alloc(2);
  assert.throws(() => writeBits(bytes, 2, 7, 128), /range/);
  assert.throws(() => writeBits(bytes, 12, 7, 5), /outside/);
  assert.throws(() => readBits(bytes, -1, 7), /outside/);
  assert.throws(() => readBits(bytes, 0, 31), /outside/);
});
test('bit encoder round trips every value in a 7-bit field', () => {
  const bytes = Buffer.alloc(12);
  for (let i = 0; i < 128; i++) {
    writeBits(bytes, 13, 7, i);
    assert.equal(readBits(bytes, 13, 7), i);
  }
});

test('targeted FC27 fallback locates an otherwise unknown player uniquely', () => {
  const refStart = 1219340;
  const reference = Buffer.alloc(refStart + 156);
  for (let i = 0; i < 120; i++) reference[refStart + i] = (i * 59 + (i * i * 13)) & 255;
  writeBits(reference, refStart * 8 + 370, 7, 87);
  const career = Buffer.alloc(4000);
  reference.copy(career, 512, refStart, refStart + 112);
  // These changed bytes defeat some full-prefix anchors but leave three distinct
  // 12-byte fragments matched in the same physical record.
  for (let i = 0; i < 18; i++) career[512 + i] ^= 0xaa;
  for (let i = 76; i < 80; i++) career[512 + i] ^= 0x7f;
  const index = {
    reference, career, catalog: [{
      j: 0, id: 80376, name: 'Rio Ngumoha', templateOverall: 75, templatePotential: 88,
    }],
    triedIds: new Set(), players: [], scanStart: 200, scanEnd: 3800,
  };
  const added = expandPlayerMatches(index, 'Ngumoha');
  assert.equal(added.length, 1);
  assert.equal(added[0].id, 80376);
  assert.equal(added[0].offset, 512);
  assert.equal(added[0].careerPotential, 88);
  assert.ok(added[0].anchors >= 3);
  assert.equal(expandPlayerMatches(index, '80376').length, 0);
});
