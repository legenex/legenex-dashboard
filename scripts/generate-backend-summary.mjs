#!/usr/bin/env node
// Plain English backend summary generator.
//
// Reads every backend function and entity schema and produces a short, readable
// description of what each one does, so the review workspace can show "what this
// page's backend actually does" as bullets a person can read and comment on,
// rather than a list of file names.
//
// The descriptions are EXTRACTED, not invented: each function's summary comes
// from the header comment already written at the top of its entry file. Where a
// function has no header comment, that is reported as a gap rather than filled in
// with a guess, because an undocumented function in the lead pipeline is itself
// worth knowing about.
//
// Also derives, from the source:
//   * which entities the function reads and which it writes
//   * whether it touches a RED surface
//   * whether it enforces a caller model before reading
//
// Output: src/lib/progress/backendSummary.json
//
// Run:  node scripts/generate-backend-summary.mjs
//       node scripts/generate-backend-summary.mjs --check

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(ROOT, 'base44/functions');
const ENTITIES_DIR = join(ROOT, 'base44/entities');
const OUT = join(ROOT, 'src/lib/progress/backendSummary.json');

const CHECK_ONLY = process.argv.includes('--check');

// Surfaces that must never be changed without explicit approval.
const RED_PATTERNS = [
  { key: 'processLead', re: /processlead/i },
  { key: 'leadbyte_connectors', re: /leadbyteconnector|leadbytewebhook/i },
  { key: 'conversion_events', re: /conversionevent|capiconnector/i },
  { key: 'distribution_mode', re: /distribution_?mode|distributionsetmode/i },
  { key: 'credentials', re: /\bapi_?key\b|\bsecret\b|\bcredential/i },
  { key: 'billing', re: /billingrun|billinglineitem|\binvoice\b|buyerpayment|supplierpayout/i },
  { key: 'buyer_pricing', re: /buyerstatecpl|buyercplrule|statestatus/i },
  { key: 'trustedform', re: /trustedform|certbackup/i },
  { key: 'portal_scoping', re: /portaldata|supplierportaldata|portalprojection/i },
];

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// Pull the leading block of // comments that sits above the first statement.
// That is where this codebase puts its explanation of what a function is for.
function headerComment(code) {
  const lines = code.split('\n');
  const collected = [];
  let started = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (started && collected.length) break;
      continue;
    }
    if (line.startsWith('import ')) { if (started) break; continue; }
    if (line.startsWith('//')) {
      started = true;
      collected.push(line.replace(/^\/\/\s?/, ''));
      continue;
    }
    if (started) break;
    // A non-import, non-comment statement before any comment means there is none.
    if (!line.startsWith('/*')) break;
  }
  return collected;
}

// Turn the comment block into a headline plus supporting bullets.
function shapeSummary(commentLines) {
  const text = commentLines.join('\n').trim();
  if (!text) return { headline: '', detail: [], documented: false };

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

  const first = paragraphs[0] || '';
  // The first sentence of the first paragraph is the headline.
  const headline = (first.match(/^(.*?[.!?])(\s|$)/)?.[1] || first).trim();
  const rest = first.slice(headline.length).trim();

  const detail = [];
  if (rest) detail.push(rest);
  paragraphs.slice(1).forEach((p) => detail.push(p));

  return {
    headline: headline.replace(/\s+/g, ' '),
    // Keep it readable: a handful of short points, not the whole essay.
    detail: detail.map((d) => d.replace(/\s+/g, ' ')).filter((d) => d.length > 12).slice(0, 4),
    documented: true,
  };
}

function analyseFunction(name) {
  const dir = join(FUNCTIONS_DIR, name);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;

  const entryPath = ['entry.ts', 'entry.js', 'index.ts']
    .map((f) => join(dir, f))
    .find((p) => existsSync(p));
  if (!entryPath) return null;

  const code = read(entryPath);
  const summary = shapeSummary(headerComment(code));

  const reads = new Set();
  const writes = new Set();
  let m;

  const entityRe = /entities\.([A-Z][A-Za-z0-9_]*)\s*\.\s*([a-zA-Z]+)/g;
  while ((m = entityRe.exec(code))) {
    const [, entity, method] = m;
    if (['create', 'update', 'delete', 'bulkCreate', 'updateMany'].includes(method)) writes.add(entity);
    else reads.add(entity);
  }

  const red = RED_PATTERNS.filter((r) => r.re.test(name) || r.re.test(code)).map((r) => r.key);

  // Does it check who is calling before it reads anything?
  const usesServiceRole = /asServiceRole/.test(code);
  const checksCaller = /auth\.me\(\)/.test(code) && /(base_role|permissions|role\s*!==\s*'admin')/.test(code);

  const externalCalls = [];
  const fetchRe = /fetch\(\s*[`'"]?(https?:\/\/[^`'")\s]+)/g;
  while ((m = fetchRe.exec(code))) {
    try { externalCalls.push(new URL(m[1]).host); } catch { /* ignore */ }
  }

  return {
    name,
    file: entryPath.replace(`${ROOT}/`, ''),
    lines: code.split('\n').length,
    headline: summary.headline,
    detail: summary.detail,
    documented: summary.documented,
    reads: [...reads].sort(),
    writes: [...writes].sort(),
    read_only: writes.size === 0,
    uses_service_role: usesServiceRole,
    enforces_caller_model: checksCaller,
    // A service-role function that never checks its caller is a real finding.
    caller_model_gap: usesServiceRole && !checksCaller,
    external_hosts: [...new Set(externalCalls)].sort(),
    red_surfaces: red,
  };
}

function analyseEntity(file) {
  const raw = read(join(ENTITIES_DIR, file));
  let schema;
  try { schema = JSON.parse(raw); } catch { return null; }

  const props = schema.properties || {};
  const names = Object.keys(props);
  const described = names.filter((n) => props[n]?.description);

  // Entity schemas carry no top level description in this codebase, so the
  // readable summary is assembled from the field descriptions that exist.
  const highlights = described
    .slice(0, 4)
    .map((n) => `${n}: ${props[n].description}`);

  return {
    name: schema.name || file.replace('.jsonc', ''),
    file: `base44/entities/${file}`,
    field_count: names.length,
    required: schema.required || [],
    documented_fields: described.length,
    undocumented_fields: names.length - described.length,
    has_rls: Boolean(schema.rls && Object.keys(schema.rls).length),
    rls_operations: schema.rls ? Object.keys(schema.rls) : [],
    highlights,
  };
}

const functionNames = existsSync(FUNCTIONS_DIR)
  ? readdirSync(FUNCTIONS_DIR).filter((f) => !f.startsWith('_') && !f.startsWith('.'))
  : [];

const functions = functionNames
  .map(analyseFunction)
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

const entities = (existsSync(ENTITIES_DIR) ? readdirSync(ENTITIES_DIR) : [])
  .filter((f) => f.endsWith('.jsonc'))
  .map(analyseEntity)
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

const payload = {
  generated_at: new Date().toISOString(),
  generator: 'scripts/generate-backend-summary.mjs',
  counts: {
    functions: functions.length,
    documented: functions.filter((f) => f.documented).length,
    undocumented: functions.filter((f) => !f.documented).length,
    read_only: functions.filter((f) => f.read_only).length,
    caller_model_gaps: functions.filter((f) => f.caller_model_gap).length,
    entities: entities.length,
    entities_without_rls: entities.filter((e) => !e.has_rls).length,
  },
  functions,
  entities,
};

const next = `${JSON.stringify(payload, null, 2)}\n`;
const strip = (s) => s.replace(/"generated_at":\s*"[^"]*",?\n/, '').trim();
const prevRaw = read(OUT);
const changed = strip(prevRaw) !== strip(next);

if (CHECK_ONLY) {
  if (changed) {
    console.error('backend summary is STALE. Run: node scripts/generate-backend-summary.mjs');
    process.exit(1);
  }
  console.log(`backend summary OK. ${payload.counts.functions} functions, ${payload.counts.entities} entities.`);
  process.exit(0);
}

if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, next);

const c = payload.counts;
console.log(`backend summary written: ${OUT.replace(`${ROOT}/`, '')}`);
console.log(`  ${c.functions} functions (${c.documented} documented, ${c.undocumented} with no header comment)`);
console.log(`  ${c.read_only} read only, ${c.caller_model_gaps} service-role functions with no visible caller check`);
console.log(`  ${c.entities} entities, ${c.entities_without_rls} without row level security`);
