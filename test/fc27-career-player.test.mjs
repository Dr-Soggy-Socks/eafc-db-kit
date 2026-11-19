import test from 'node:test';
import assert from 'node:assert/strict';
import { readBits, writeBits } from '../scripts/fc27-career-player.mjs';

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
