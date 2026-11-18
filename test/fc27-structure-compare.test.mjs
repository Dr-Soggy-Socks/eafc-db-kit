import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compareFc27Structures} from '../scripts/compare-fc27-structure.mjs';

test('compares two synthetic offline FBCHUNKS files without requiring real game data',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fc27-structure-'));
  try{
    const before=Buffer.alloc(768);
    before.write('FBCHUNKS',0,'ascii');
    before.write('Career A',18,'utf8');
    const after=Buffer.from(before);
    after[600]=9;
    const a=join(dir,'before.bin'),b=join(dir,'after.bin');
    await Promise.all([writeFile(a,before),writeFile(b,after)]);
    const report=await compareFc27Structures(a,b);
    assert.equal(report.readOnly,true);
    assert.equal(report.metadataOnly,true);
    assert.equal(report.byteChanges.changedCommonBytes,1);
    assert.equal(report.byteChanges.lengthDifference,0);
    assert.equal(report.fieldMapShifts.length,3);
    assert.ok(report.fieldMapShifts.every(x=>x.matchedA===0&&x.matchedB===0&&x.shift===null));
    await assert.rejects(()=>compareFc27Structures(a,a),/different offline/);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
