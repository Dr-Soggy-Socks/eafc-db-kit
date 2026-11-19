import test from 'node:test';
import assert from 'node:assert/strict';
import { readBits, writeBits } from '../scripts/fc27-career-player.mjs';
import { applyFieldChanges, supportedFields, renameSameLengthTitle } from '../scripts/fc27-career-batch.mjs';

const offsets = { potential:370, finishing:447, dribbling:454,
  sprintspeed:506, strength:540, shotpower:615 };
const baseline = { potential:88, finishing:72, dribbling:80,
  sprintspeed:89, strength:44, shotpower:74 };
const desired = { potential:99, sprintspeed:99, finishing:90,
  shotpower:95, dribbling:95, strength:75 };

function fixture() {
  const bytes = Buffer.alloc(128, 0x57);
  const specs = {};
  for (const name of supportedFields()) {
    specs[name] = { bitOffset:offsets[name], depth:7, rangeLow:1,
      templateValue:baseline[name] };
    writeBits(bytes, offsets[name], 7, baseline[name]-1);
  }
  return { bytes, specs };
}

test('batch patches six independent career attributes and leaves original untouched', () => {
  const {bytes, specs} = fixture();
  const original = Buffer.from(bytes);
  const {clone, edits, changedBytes} = applyFieldChanges(bytes, 0, specs, desired);
  assert.equal(edits.length, 6);
  assert.ok(changedBytes >= 1 && changedBytes <= 12);
  assert.deepEqual(bytes, original);
  for (const [name, target] of Object.entries(desired)) {
    assert.equal(readBits(clone, offsets[name], 7) + 1, target);
    assert.equal(readBits(bytes, offsets[name], 7) + 1, baseline[name]);
  }
  for (let i = 80; i < bytes.length; i++) assert.equal(clone[i], bytes[i]);
});

test('batch rejects unknown fields, out-of-range values and unverified source bits', () => {
  const {bytes, specs} = fixture();
  assert.throws(() => applyFieldChanges(bytes, 0, specs, {acceleration:99}), /not supported/);
  assert.throws(() => applyFieldChanges(bytes, 0, specs, {potential:100}), /1 to 99/);
  assert.throws(() => applyFieldChanges(bytes, 0, specs, {potential:7.5}), /integer/);
  assert.throws(() => applyFieldChanges(bytes, 0, specs, {}), /at least one/);
  assert.throws(() => applyFieldChanges(bytes, 0, specs, baseline), /No values changed/);
  const altered = Buffer.from(bytes);
  writeBits(altered, offsets.sprintspeed, 7, 42);
  assert.throws(() => applyFieldChanges(altered, 0, specs, desired), /differs from verified template/);
});

test('batch fails closed when field extends beyond verified 80-byte prefix', () => {
  const {bytes, specs} = fixture();
  specs.overallrating = {bitOffset:1106,depth:7,rangeLow:1,templateValue:75};
  assert.throws(() => applyFieldChanges(bytes, 0, specs, {overallrating:90}), /outside verified/);
});

test('same-length save title change preserves FBCHUNKS offsets and original', () => {
  const originalName = 'Career – Manager Progress 2';
  const testName = 'Career – NGUMOHA TEST POT99';
  assert.equal(Buffer.byteLength(originalName), Buffer.byteLength(testName));
  const bytes = Buffer.alloc(200, 0x42);
  bytes.write('FBCHUNKS', 0, 'ascii');
  Buffer.from(originalName, 'utf8').copy(bytes, 18);
  bytes[18 + Buffer.byteLength(originalName)] = 0;
  const old = Buffer.from(bytes);
  const renamed = renameSameLengthTitle(bytes, testName);
  assert.equal(renamed.originalTitle, originalName);
  assert.equal(renamed.title, testName);
  assert.equal(renamed.clone.toString('utf8', 18, 18 + Buffer.byteLength(testName)), testName);
  assert.equal(renamed.clone.length, old.length);
  assert.deepEqual(bytes, old);
  assert.deepEqual(renamed.clone.subarray(18 + Buffer.byteLength(testName)), old.subarray(18 + Buffer.byteLength(testName)));
  assert.throws(() => renameSameLengthTitle(bytes, 'short'), /same UTF-8 byte length/);
});
