#!/usr/bin/env node
/**
 * Inspect FC27 compact table field metadata only, without decoding/writing records.
 * Usage:
 *   node scripts/inspect-fc27-field-metadata.mjs /path/to/CmMgrC... [--all-fields]
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { findCompactFieldBlocks } from './fc27-compact-fields.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const inspectedTables = ['players','teams','teamplayerlinks'];
const importantFields = new Set(['playerid','overallrating','potential','wage',
  'releaseclause','height','weight','birthdate','preferredposition1','teamid',
  'teamname','artificialkey','form']);

export async function inspectFc27FieldMetadata(filePath, { allFields = false } = {}) {
  const [bytes, xml] = await Promise.all([
    readFile(filePath),
    readFile(join(here, '../templates/FC 27/fifa_ng_db-meta.xml'), 'utf8'),
  ]);
  const root = new XMLParser({ignoreAttributes:false,attributeNamePrefix:''}).parse(xml).database;
  return {
    source: 'private-local-file',
    readOnly: true,
    version: 'FC 27',
    tableResults: inspectedTables.map(name => {
      const table = root.table.find(t => t.name === name);
      if (!table) throw new Error('Bundled FC27 XML has no '+name+' schema.');
      const descriptors = table.fields.field.map(field => ({
        shortName: field.shortname, name: field.name, depth: Number(field.depth),
      }));
      const matches = findCompactFieldBlocks(bytes, descriptors);
      return {
        table: name,
        expectedFields: descriptors.length,
        matchingBlocks: matches.length,
        matches: matches.map(block => ({
          startOffset: block.startOffset,
          lastFieldOffset: block.lastFieldOffset,
          matchedFields: block.matchedFields,
          unknownBitOffsets: block.descriptors.filter(x => x.bitOffset === null).length,
          fields: block.descriptors
            .filter(field => allFields || importantFields.has(field.name))
            .map(({name,shortName,depth,bitOffset,serializedBytes}) =>
              ({name,shortName,depth,bitOffset,serializedBytes})),
        })),
      };
    }),
    playerRecordsDecoded: 0,
    editingEnabled: false,
    warning: 'Field descriptors are not records. Physical row boundaries remain unresolved.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) {
    process.stderr.write('Usage: node scripts/inspect-fc27-field-metadata.mjs /path/to/CmMgrC... [--all-fields]\n');
    process.exitCode = 2;
  } else {
    try {
      const report = await inspectFc27FieldMetadata(input, {
        allFields: process.argv.includes('--all-fields'),
      });
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } catch (error) {
      process.stderr.write(String(error) + '\n');
      process.exitCode = 1;
    }
  }
}
