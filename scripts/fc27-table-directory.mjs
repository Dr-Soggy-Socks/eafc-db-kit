/**
 * Index both observed FC27 career DB directory headers without parsing records.
 * Table allocations are declared relative offsets, not validated physical regions.
 */
const MAGIC=Buffer.from([0x44,0x42,0,8,0,0,0,0]);
const variants=[
  {name:'count-at-12',countOffset:12,entryOffset:20,baseOffset:24},
  {name:'count-at-16',countOffset:16,entryOffset:24,baseOffset:28},
];

export function findFc27TableDirectories(input,{knownShortNames}={}) {
  const bytes=Buffer.isBuffer(input)?input:Buffer.from(input.buffer,input.byteOffset,input.byteLength);
  const out=[];
  for(let start=bytes.indexOf(MAGIC);start!==-1;start=bytes.indexOf(MAGIC,start+MAGIC.length)){
    for(const v of variants) {
      if(start+v.baseOffset>bytes.length) continue;
      const byteLength=bytes.readUInt32LE(start+8);
      const count=bytes.readUInt32LE(start+v.countOffset);
      if(count<2||count>512||byteLength<256||byteLength>bytes.length-start)continue;
      const end=start+byteLength;
      const base=start+v.baseOffset+count*8;
      if(base>=end)continue;
      const entries=[];const seen=new Set();
      let valid=true;
      for(let i=0;i<count;i++){
        const entry=start+v.entryOffset+i*8;
        if(entry+8>base){valid=false;break;}
        const name=bytes.toString('ascii',entry,entry+4);
        const rel=bytes.readUInt32LE(entry+4);
        if(!/^[A-Za-z]{4}$/.test(name)||seen.has(name)||
          (knownShortNames && !knownShortNames.has(name))||
          (i===0&&rel!==0)||(i>0&&rel<=entries[i-1].relativeOffset)||
          base+rel+36>end){valid=false;break;}
        seen.add(name);
        entries.push({shortName:name,relativeOffset:rel});
      }
      if(!valid)continue;
      const tables=entries.map((entry,i)=>{
        const next=i+1<count?entries[i+1].relativeOffset:end-base;
        return {...entry,declaredAllocationBytes:next-entry.relativeOffset,directoryOrder:i};
      });
      if(tables.some(x=>x.declaredAllocationBytes<36))continue;
      out.push({offset:start,byteLength,format:v.name,tableCount:count,
        tableOffsetBase:base,tables,recordsDecoded:false,safeForWriting:false});
    }
  }
  return out;
}

export function compareFc27TableAllocations(a,b) {
  if(a.tableCount!==b.tableCount) return {
    comparable:false,reason:'different table counts',
  };
  const left=new Map(a.tables.map(t=>[t.shortName,t]));
  const right=new Map(b.tables.map(t=>[t.shortName,t]));
  if(left.size!==right.size||[...left.keys()].some(x=>!right.has(x)))return {
    comparable:false,reason:'different table identities',
  };
  const changes=[...left.keys()].filter(name=>
    left.get(name).declaredAllocationBytes!==right.get(name).declaredAllocationBytes)
    .map(name=>({shortName:name,oldBytes:left.get(name).declaredAllocationBytes,
      newBytes:right.get(name).declaredAllocationBytes}));
  const reordered=[...left.keys()].filter(name=>
    left.get(name).directoryOrder!==right.get(name).directoryOrder);
  return {comparable:true,tableCount:left.size,
    unchangedAllocations:left.size-changes.length,
    allocationsChanged:changes,
    reorderedTableCount:reordered.length,
    reorderedTableNames:reordered,
    note:'Directory allocation equality does not prove table contents or record layouts are identical.',
  };
}
