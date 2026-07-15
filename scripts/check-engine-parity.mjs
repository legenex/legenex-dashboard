// Blocking parity check: regenerates the backend engine bundle in memory and
// compares it to the committed generated file. Fails (exit 1) if they differ,
// which means the canonical source changed without regenerating the backend
// copy. This is what guarantees there is exactly one engine and no silent drift.
//
// Also fails if a hand-written routing mirror is reintroduced into the backend.
//
// Run: node scripts/check-engine-parity.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateBundle, OUT_PATH } from './generate-backend-engine.mjs';

function fail(msg) { console.error(`PARITY CHECK FAILED: ${msg}`); process.exit(1); }

// 1. Committed generated file must match a fresh generation.
let committed;
try { committed = readFileSync(OUT_PATH, 'utf8'); }
catch { fail(`${OUT_PATH} is missing. Run: node scripts/generate-backend-engine.mjs`); }

const { content } = await generateBundle();
if (committed !== content) {
  fail(`${OUT_PATH} is stale. Run: node scripts/generate-backend-engine.mjs and commit the result.`);
}

// 2. Anti-mirror: no hand-written routing engine may exist in base44/functions.
// The one allowed engine is the generated bundle under _shared.
const FORBIDDEN = [/function\s+shadowEvaluateRouting/, /routeWaterfall\s*\(/, /function\s+evaluateMember/];
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { scan(p); continue; }
    if (!p.endsWith('.ts') && !p.endsWith('.js')) continue;
    if (p.includes('_shared/routingEngine.generated')) continue; // the allowed engine
    const src = readFileSync(p, 'utf8');
    for (const re of FORBIDDEN) {
      if (re.test(src)) fail(`hand-written routing logic found in ${p} (matches ${re}). Use the canonical engine.`);
    }
  }
}
scan('base44/functions');

console.log('parity check OK: backend engine matches canonical source; no hand-written mirror.');
