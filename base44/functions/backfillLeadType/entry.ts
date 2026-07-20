import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Operator-only utility to backfill the lead_type field on leads that were
// imported or created without one. lead_type lives inside the mapped_fields
// JSON string (the leads table and lead detail popup read it from there), so a
// plain updateMany cannot set it: each record needs its own JSON parsed,
// patched, and written back. This function does that server-side against live
// data, paging the whole table.
//
// Per Nick's decision on 20 July 2026, every lead missing a lead_type is filled
// with "Quiz".
//
// Modes (query param ?mode=):
//   count   (default) - report how many leads are missing lead_type, no writes
//   apply             - parse mapped_fields, add lead_type where absent, update
//
// The operation is idempotent: a lead that already has a non-empty lead_type is
// never touched, so re-running is safe.

const DEFAULT_LEAD_TYPE = 'Quiz';

// A lead needs backfill when mapped_fields has no non-empty lead_type key.
function neededPatch(lead) {
  let mapped;
  try { mapped = JSON.parse(lead.mapped_fields || '{}') || {}; } catch { return null; }
  // Case-insensitive scan for an existing, non-empty lead_type.
  for (const [k, v] of Object.entries(mapped)) {
    if (k.toLowerCase() === 'lead_type' && v != null && String(v).trim() !== '') {
      return null; // already set, leave it
    }
  }
  mapped.lead_type = DEFAULT_LEAD_TYPE;
  return { mapped_fields: JSON.stringify(mapped) };
}

async function loadAllLeads(base44) {
  const all = [];
  const pageSize = 200;
  let skip = 0;
  for (let i = 0; i < 2000; i++) {
    const page = await base44.asServiceRole.entities.Lead.list('created_date', pageSize, skip);
    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
  }
  return all;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth gate BEFORE any entity read.
    let user;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const rawMode = (url.searchParams.get('mode') || '').toLowerCase();
    const mode = ['count', 'apply'].includes(rawMode) ? rawMode : 'count';

    const leads = await loadAllLeads(base44);
    const totalScanned = leads.length;

    // Build the work list: id + computed patch for every lead that needs one.
    const work = [];
    for (const l of leads) {
      if (!l || !l.id) continue;
      const patch = neededPatch(l);
      if (patch) work.push({ id: l.id, patch });
    }

    if (mode === 'count') {
      return Response.json({
        mode: 'count',
        total_leads_scanned: totalScanned,
        missing_lead_type: work.length,
        already_set: totalScanned - work.length,
        default_lead_type: DEFAULT_LEAD_TYPE,
        note: 'No changes made. Call again with ?mode=apply to backfill.',
      }, { status: 200 });
    }

    // ── mode=apply ──────────────────────────────────────────────────────
    let updated = 0;
    let failed = 0;
    const errors = [];
    const batchSize = 20;
    for (let i = 0; i < work.length; i += batchSize) {
      const batch = work.slice(i, i + batchSize);
      await Promise.all(batch.map(async ({ id, patch }) => {
        try {
          await base44.asServiceRole.entities.Lead.update(id, patch);
          updated += 1;
        } catch (e) {
          failed += 1;
          if (errors.length < 20) errors.push({ id, error: String(e?.message || e) });
        }
      }));
    }

    return Response.json({
      mode: 'apply',
      total_leads_scanned: totalScanned,
      attempted: work.length,
      updated,
      failed,
      default_lead_type: DEFAULT_LEAD_TYPE,
      errors,
    }, { status: 200 });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
});
