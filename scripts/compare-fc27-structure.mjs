#!/usr/bin/env node
/** Compare two *offline* career copies without exposing data or modifying files. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { analyzeSaveDifferences } from './diff-fc27-saves.mjs';
import { probeCareerContainer } from './probe-fc27-career.mjs';
import { inspectFc27FieldMetadata } from './inspect-fc27-field-metadata.mjs';
import { findFc27TableDirectories, compareFc27TableAllocations } from './fc27-table-directory.mjs';

function smallProbe(bytes) {
  const p = probeCareerContainer(bytes);
  return {
    byteLength: p.byteLength,
    bnryMarkers: p.bnryMarkers.map(x => x.offset),
    compactDirectories: p.compactDatabaseCandidates.map(x =>
      ({offset:x.offset,tableCount:x.tableCount})),
    standardSignatureCandidates: p.databaseCandidates.map(x => ({
      offset: x.offset,
      declaredTableCount:x.declaredTableCount,
      directoryBoundsPass:x.directoryBoundsPass,
      legacyTableHeadersPass:x.legacyTableHeadersPass,
    })),
  };
}

export async function compareFc27Structures(pathA,pathB) {
  if(resolve(pathA) === resolve(pathB)) throw new Error('Specify two different offline copies.');
  const [a,b] = await Promise.all([readFile(pathA), readFile(pathB)]);
  if(a.length > 64*1024*1024 || b.length > 64*1024*1024)
    throw new RangeError('64 MiB safety limit exceeded.');
  const [fieldsA,fieldsB] = await Promise.all([
    inspectFc27FieldMetadata(pathA),inspectFc27FieldMetadata(pathB),
  ]);
  const shift = fieldsA.tableResults.map((ta,i) => {
    const tb=fieldsB.tableResults[i];
    const original=ta.matches.length===1 ? ta.matches[0].startOffset : null;
    const updated=tb.matches.length===1 ? tb.matches[0].startOffset : null;
    return {table:ta.table,matchedA:ta.matches.length,matchedB:tb.matches.length,
      fieldCount:ta.expectedFields,
      fieldStartA:original,fieldStartB:updated,
      shift:original===null||updated===null?null:updated-original};
  });
  const diff=analyzeSaveDifferences(a,b);
  const dirsA=findFc27TableDirectories(a);
  const dirsB=findFc27TableDirectories(b);
  const directoryComparison=dirsA.length===1 && dirsB.length===1
    ? compareFc27TableAllocations(dirsA[0],dirsB[0]) : null;
  return {readOnly:true,metadataOnly:true,
    snapshots:[smallProbe(a),smallProbe(b)],
    byteChanges:{identical:diff.identical,changedCommonBytes:diff.differingCommonBytes,
      lengthDifference:diff.afterBytes-diff.beforeBytes,
      changedGroupCount:diff.changedGroupCount,
      changedRegions:diff.changedRegions},
    fieldMapShifts:shift,
    directoryComparison,
    warning:'Structural differences do not identify edited player records or imply safe write support.',
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [a,b]=process.argv.slice(2);
  if(!a||!b){
    process.stderr.write('Usage: node scripts/compare-fc27-structure.mjs <offline-save-A> <offline-save-B>\n');
    process.exitCode=2;
  }else{
    try{
      const result=await compareFc27Structures(a,b);
      process.stdout.write(JSON.stringify(result,null,2)+'\n');
    }catch(err){process.stderr.write(String(err)+'\n');process.exitCode=1;}
  }
}
