import test from 'node:test';
import assert from 'node:assert/strict';
import { findCompactFieldBlocks } from '../scripts/fc27-compact-fields.mjs';

const schema = [
  {shortName:'pQBA',name:'first',depth:6},
  {shortName:'aACB',name:'second',depth:7},
  {shortName:'KXDC',name:'third',depth:12},
  {shortName:'tYED',name:'fourth',depth:8},
];
function fixture() {
  const b = Buffer.alloc(280);
  let p = 40;
  b.write('pQBA',p);
  b.writeUInt32LE(6,p+4);b.writeUInt32LE(3,p+8);b.writeUInt32LE(64,p+12);p+=16;
  b.write('aACB',p);
  b[p+4]=7;b.writeUInt32LE(70,p+5);p+=9;
  b.write('KXDC',p);
  b.writeUInt32LE(100,p+4);p+=8;
  b.write('tYED',p);
  return b;
}
test('recognises 8/9/16-byte compact descriptors by reversed shortname order', () => {
  const b=fixture();const before=Buffer.from(b);
  const blocks=findCompactFieldBlocks(b,[...schema].reverse());
  assert.equal(blocks.length,1);
  const block=blocks[0];
  assert.equal(block.startOffset,40);
  assert.equal(block.matchedFields,4);
  assert.deepEqual(block.descriptors.map(f=>f.serializedBytes),[16,9,8,null]);
  assert.deepEqual(block.descriptors.map(f=>f.bitOffset),[64,70,100,null]);
  assert.equal(block.safeForWriting,false);
  assert.deepEqual(b,before);
});
test('rejects invalid depth and malformed descriptor links',()=>{
  const b=fixture();b[40+16+4]=99;
  assert.deepEqual(findCompactFieldBlocks(b,schema),[]);
  assert.throws(()=>findCompactFieldBlocks(b,[schema[0],schema[0],schema[1]]),/duplicate/);
  assert.throws(()=>findCompactFieldBlocks(b,[schema[0]]),/three/);
});
test('rejects inconsistent extended field type',()=>{
  const b=fixture();b.writeUInt32LE(7,48);
  assert.deepEqual(findCompactFieldBlocks(b,schema),[]);
});

test('recognises short/opaque descriptors without inventing their bit offsets', () => {
  const fields=[
    {shortName:'xxAA',name:'first',depth:3},
    {shortName:'yyAB',name:'second',depth:7},
    {shortName:'zzAC',name:'third',depth:5},
    {shortName:'wwAD',name:'last',depth:6},
  ];
  const bytes=Buffer.alloc(96);
  let p=12;
  bytes.write('xxAA',p); bytes[p+4]=3; p+=5;
  bytes.write('yyAB',p); bytes[p+4]=7; p+=11;
  bytes.write('zzAC',p); bytes.writeUInt32LE(99,p+4); p+=8;
  bytes.write('wwAD',p);
  const [match]=findCompactFieldBlocks(bytes,fields);
  assert.ok(match);
  assert.deepEqual(match.descriptors.map(x=>x.serializedBytes),[5,11,8,null]);
  assert.deepEqual(match.descriptors.map(x=>x.bitOffset),[null,null,99,null]);
});
