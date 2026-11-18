import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSaveDifferences } from '../scripts/diff-fc27-saves.mjs';

function save(length=1100) {
  const b=Buffer.alloc(length,0);
  b.write('FBCHUNKS',0,'ascii');
  b.writeUInt32LE(length,14);
  return b;
}
test('identical saves have zero changed bytes and identical hashes',()=>{
  const a=save(),b=Buffer.from(a);
  const result=analyzeSaveDifferences(a,b,{blockSize:256});
  assert.equal(result.identical,true);
  assert.equal(result.changedGroupCount,0);
  assert.equal(result.differingCommonBytes,0);
  assert.equal(result.beforeSha256,result.afterSha256);
});
test('consecutive modified blocks merge into one region',()=>{
  const a=save(),b=Buffer.from(a);
  b[100]=1;b[300]=2;b[800]=3;
  const result=analyzeSaveDifferences(a,b,{blockSize:256});
  assert.equal(result.identical,false);
  assert.equal(result.differingCommonBytes,3);
  assert.equal(result.changedGroupCount,2);
  assert.deepEqual(result.changedRegions.map(x=>[x.startOffset,x.endOffsetExclusive,x.differingBytes]),
    [[0,512,2],[768,1024,1]]);
  assert.equal(a[100],0);
});
test('different lengths and truncated output are accounted for',()=>{
  const a=save(2000),b=Buffer.alloc(2300);
  a.copy(b);
  b[1300]=9;b[1500]=7;b[1900]=5;
  const result=analyzeSaveDifferences(a,b,{blockSize:256,maxRegions:1});
  assert.equal(result.appendedOrRemovedBytes,300);
  assert.equal(result.differingCommonBytes,3);
  assert.equal(result.regionsTruncated,true);
  assert.equal(result.changedRegions.length,1);
});
test('invalid magic and unsafe options are rejected',()=>{
  assert.throws(()=>analyzeSaveDifferences(Buffer.alloc(50),save()),/FBCHUNKS/);
  assert.throws(()=>analyzeSaveDifferences(save(),save(),{blockSize:4}),/options/);
  assert.throws(()=>analyzeSaveDifferences(save(),save(),{maxRegions:0}),/options/);
});
