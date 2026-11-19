#!/usr/bin/env node
/**
 * Local-only experimental FC27 save viewer.
 * Usage: node scripts/fc27-career-ui.mjs /path/to/offline/fc27-save-tests/CmMgrC...
 * POST creates a NEW offline CmMgrCTest-* file; originals and game files stay untouched.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCareerIndex, expandPlayerMatches, patchPotential } from './fc27-career-player.mjs';

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node scripts/fc27-career-ui.mjs /path/to/archived/fc27-save-tests/CmMgrC... [port]');
  process.exit(2);
}
const port = Number(process.argv[3] ?? 8767);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port.');
const index = await buildCareerIndex(inputFile);
const pathToHtml = join(dirname(fileURLToPath(import.meta.url)), 'fc27-career-ui.html');
const html = await readFile(pathToHtml, 'utf8');

function respond(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'});
  res.end(body);
}
async function jsonBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) throw new Error('Request too long.');
  }
  return JSON.parse(body);
}
const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host || '';
    if (!['127.0.0.1:' + port, 'localhost:' + port].includes(host)) {
      return respond(res, 403, { error: 'Local browser only.' });
    }
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'"});
      return res.end(html);
    }
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return respond(res, 200, {
        source: basename(index.file), matched: index.players.length, scanned: index.scanned,
        scanStart: index.scanStart, scanEnd: index.scanEnd,
        notice: index.notice, mode: 'OFFLINE BACKUP ONLY',
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/players') {
      const query = String(url.searchParams.get('q') ?? '').trim().toLocaleLowerCase();
      expandPlayerMatches(index, query);
      const results = index.players.filter(p => p.name.toLocaleLowerCase().includes(query) ||
        String(p.id).includes(query)).slice(0, 100);
      return respond(res, 200, { results, totalMatched: index.players.length });
    }
    if (req.method === 'POST' && url.pathname === '/api/patch') {
      const origin = req.headers.origin;
      if (origin && origin !== 'http://127.0.0.1:' + port &&
          origin !== 'http://localhost:' + port) return respond(res, 403, { error: 'Origin rejected.' });
      const body = await jsonBody(req);
      const id = Number(body.id), potential = Number(body.potential);
      if (!Number.isInteger(id) || !Number.isInteger(potential))
        return respond(res, 400, { error: 'ID and potential must be whole numbers.' });
      expandPlayerMatches(index, String(id));
      const target = resolve(dirname(index.file),
        'CmMgrCTest-' + id + '-pot' + potential + '-' + Date.now());
      const result = await patchPotential(index, id, potential, target);
      return respond(res, 200, {ok:true, result});
    }
    return respond(res, 404, {error:'Not found.'});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[FC27 local UI]', message);
    return respond(res, 400, {error:message});
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log('FC27 Offline Career Inspector ready at http://127.0.0.1:' + port);
  console.log('Source: ' + basename(index.file) + ' | players: ' + index.players.length);
  console.log('All output stays in the offline archive directory. The live game is untouched.');
});
