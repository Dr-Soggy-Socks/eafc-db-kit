import test from 'node:test';
import assert from 'node:assert/strict';
import { findFc27TableDirectories, compareFc27TableAllocations } from '../scripts/fc27-table-directory.mjs';

function fixture(variant, order=['Aaaa','Bbbb','Cccc']){
  const count=order.length,start=96;
  const widths={Aaaa:48,Bbbb:80,Cccc:120};
  const extra=variant==='count-at-12'?24:28;
  const len=extra+count*8+order.reduce((s,n)=>s+widths[n],0);
  const b=Buffer.alloc(start+len+12);
  b.set([0x44,0x42,0,8,0,0,0,0],start);
  b.writeUInt32LE(len,start+8);
  b.writeUInt32LE(count,start+(variant==='count-at-12'?12:16));
  let rel=0;
  for(let i=0;i<count;i++){
    const e=start+(variant==='count-at-12'?20:24)+i*8;
    b.write(order[i],e,'ascii');b.writeUInt32LE(rel,e+4);
    rel+=widths[order[i]];
  }
  return b;
}

test('indexes compact and standard-style FC27 directories without decoding rows',()=>{
  const known=new Set(['Aaaa','Bbbb','Cccc']);
  for(const type of ['count-at-12','count-at-16']){
    const [result]=findFc27TableDirectories(fixture(type),{knownShortNames:known});
    assert.ok(result);
    assert.equal(result.format,type);
    assert.equal(result.tableCount,3);
    assert.deepEqual(result.tables.map(x=>x.declaredAllocationBytes),[48,80,120]);
    assert.equal(result.recordsDecoded,false);
    assert.equal(result.safeForWriting,false);
  }
});

test('compares table allocation sizes by table identity across reorderings',()=>{
  const a=findFc27TableDirectories(fixture('count-at-12'))[0];
  const b=findFc27TableDirectories(fixture('count-at-16',['Cccc','Aaaa','Bbbb']))[0];
  const report=compareFc27TableAllocations(a,b);
  assert.equal(report.comparable,true);
  assert.equal(report.unchangedAllocations,3);
  assert.equal(report.reorderedTableCount,3);
  assert.deepEqual(report.allocationsChanged,[]);
});

test('rejects nonascending directory offsets, unknown names, and tiny files',()=>{
  const b=fixture('count-at-16');
  const at=96;
  b.writeUInt32LE(0,at+24+8+4);
  assert.deepEqual(findFc27TableDirectories(b),[]);
  assert.deepEqual(findFc27TableDirectories(fixture('count-at-12'),{knownShortNames:new Set(['Aaaa'])}),[]);
  assert.deepEqual(findFc27TableDirectories(Buffer.alloc(30)),[]);
});
