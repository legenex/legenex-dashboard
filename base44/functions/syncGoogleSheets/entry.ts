import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Google Sheets data source sync.
//
// A sheet has a purpose that decides where its rows are written:
//   leads          rows are ingested through processLead (the original behaviour,
//                  and what an absent purpose still means)
//   buyer_feedback rows are matched to a lead and written as BuyerFeedback
//   inbound_calls  rows are either ingested as leads or recorded against a lead,
//                  depending on purpose_config.create_leads
//   disqualified   rows are matched to a lead and recorded as a DQ outcome
//   cost           rows are written as AdSpend against a supplier
//
// Modes:
//   { account_status: true }                connected Google account and whether
//                                           Drive listing is authorised
//   { list_spreadsheets: true }             list sheets from Drive (needs Drive scope)
//   { list_worksheets: true, sheet_id }     list tab names in a spreadsheet
//   { preview: true, sheet_id, worksheet }  columns, a sample row and a row count
//   { source_id }                           sync one source
//   { source_id, dry_run: true }            report what would be written, write nothing
//   { scheduled: true }                     sync every source whose interval has elapsed
//   {}                                      sync every enabled sheet source

const ROW_BUDGET = 300; // new rows processed per run, so one big sheet cannot stall the queue

async function sha256Hex(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

function parseJsonObject(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { const p = JSON.parse(val); return p && typeof p === 'object' ? p : {}; } catch { return {}; }
}

async function googleToken(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('googlesheets');
  return conn?.accessToken;
}

// Convert a 2D value grid (first row = headers) into an array of row objects.
function gridToObjects(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const headers = values[0].map((h) => String(h || '').trim());
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    if (row.every((c) => c == null || String(c).trim() === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx] != null ? row[idx] : ''; });
    out.push(obj);
  }
  return out;
}

async function fetchValues(token, sheetId, worksheet) {
  const range = encodeURIComponent(worksheet || 'Sheet1');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Sheets API HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }
  return await resp.json();
}

// Number-like text from a sheet cell. Strips currency symbols, commas and spaces.
function toNumber(val) {
  if (val == null || val === '') return null;
  const cleaned = String(val).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Sheet dates arrive as text in many shapes. Return an ISO date (YYYY-MM-DD) or null.
function toIsoDate(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (us) return `${us[3]}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function digitsOnly(val) {
  return String(val || '').replace(/\D/g, '');
}

// Find the lead a row belongs to. Returns { lead, matched_by } or nulls.
async function matchLead(db, field, rawValue) {
  const value = String(rawValue == null ? '' : rawValue).trim();
  if (!value) return { lead: null, matched_by: null };

  if (field === 'id') {
    const hit = await db.entities.Lead.filter({ id: value });
    return { lead: hit?.[0] || null, matched_by: hit?.[0] ? 'id' : null };
  }
  if (field === 'lead_id') {
    const hit = await db.entities.Lead.filter({ lead_id: value });
    return { lead: hit?.[0] || null, matched_by: hit?.[0] ? 'lead_id' : null };
  }
  if (field === 'email') {
    const hit = await db.entities.Lead.filter({ email: value.toLowerCase() });
    if (hit?.[0]) return { lead: hit[0], matched_by: 'email' };
    const exact = await db.entities.Lead.filter({ email: value });
    return { lead: exact?.[0] || null, matched_by: exact?.[0] ? 'email' : null };
  }
  if (field === 'mobile') {
    const exact = await db.entities.Lead.filter({ mobile: value });
    if (exact?.[0]) return { lead: exact[0], matched_by: 'mobile' };
    const digits = digitsOnly(value);
    if (digits) {
      const byDigits = await db.entities.Lead.filter({ mobile: digits });
      if (byDigits?.[0]) return { lead: byDigits[0], matched_by: 'mobile' };
      const last10 = digits.slice(-10);
      if (last10 && last10 !== digits) {
        const byLast10 = await db.entities.Lead.filter({ mobile: last10 });
        if (byLast10?.[0]) return { lead: byLast10[0], matched_by: 'mobile' };
      }
    }
    return { lead: null, matched_by: null };
  }
  return { lead: null, matched_by: null };
}

// Read a row's value for one of our field names, using the column mapping.
function mappedValue(row, mapping, field) {
  for (const [col, target] of Object.entries(mapping)) {
    if (target === field && row[col] !== undefined) return row[col];
  }
  return undefined;
}

function truthy(val) {
  const s = String(val == null ? '' : val).trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y' || s === 'converted' || s === 'returned';
}

// ---------------------------------------------------------------------------
// Per-purpose row writers. Each returns 'written', 'skipped' or throws.
// ---------------------------------------------------------------------------

async function writeLeadRow(db, base44, source, row, mapping, dryRun) {
  const leadPayload = {};
  for (const [col, field] of Object.entries(mapping)) {
    if (!field || field === '__ignore__') continue;
    if (row[col] !== undefined) leadPayload[field] = row[col];
  }
  leadPayload.lead_source = source.name;
  leadPayload.source_channel = 'google_sheets';
  if (source.campaign_id) leadPayload.campaign_id = source.campaign_id;
  leadPayload._supplier_key = source._supplier_key;
  if (dryRun) return 'written';
  await base44.asServiceRole.functions.invoke('processLead', leadPayload);
  return 'written';
}

async function writeFeedbackRow(db, source, row, mapping, cfg, dryRun) {
  const matchValue = source.match_column ? row[source.match_column] : undefined;
  const { lead, matched_by } = await matchLead(db, source.match_field || 'email', matchValue);
  if (!lead) return 'skipped';

  const disposition = String(
    mappedValue(row, mapping, 'disposition') ?? (cfg.disposition_column ? row[cfg.disposition_column] : '') ?? '',
  ).trim();
  if (!disposition) return 'skipped';

  const converted = truthy(mappedValue(row, mapping, 'buyer_conversion') ?? (cfg.converted_column ? row[cfg.converted_column] : ''));
  const returned = truthy(mappedValue(row, mapping, 'buyer_returned') ?? (cfg.returned_column ? row[cfg.returned_column] : ''));
  const revenue = toNumber(mappedValue(row, mapping, 'revenue') ?? (cfg.revenue_column ? row[cfg.revenue_column] : null));
  const buyerCode = source.buyer_code || lead.buyer_id || '';

  if (dryRun) return 'written';

  await db.entities.BuyerFeedback.create({
    lead_id: lead.id,
    buyer_id: buyerCode,
    matched_by: matched_by || 'unknown',
    disposition: disposition.slice(0, 120),
    raw_disposition: disposition,
    outcome: converted ? 'converted' : returned ? 'returned' : 'contacted',
    revenue_value: revenue == null ? undefined : revenue,
    notes: cfg.notes_column ? String(row[cfg.notes_column] || '').slice(0, 500) : undefined,
    source: `sheet:${source.name}`,
    match_confidence: matched_by === 'email' || matched_by === 'lead_id' || matched_by === 'id' ? 'high' : 'medium',
  });

  // Only fields that carry the buyer's own verdict are written back onto the lead.
  const leadPatch = {};
  if (disposition) leadPatch.buyer_feedback = disposition.slice(0, 200);
  if (converted) leadPatch.buyer_conversion = true;
  if (returned) leadPatch.buyer_returned = true;
  if (returned && cfg.return_reason_column) leadPatch.buyer_return_reason = String(row[cfg.return_reason_column] || '').slice(0, 300);
  if (Object.keys(leadPatch).length) await db.entities.Lead.update(lead.id, leadPatch);

  return 'written';
}

async function writeDisqualifiedRow(db, source, row, mapping, cfg, dryRun) {
  const matchValue = source.match_column ? row[source.match_column] : undefined;
  const { lead, matched_by } = await matchLead(db, source.match_field || 'email', matchValue);
  if (!lead) return 'skipped';

  const reason = String(
    mappedValue(row, mapping, 'disposition') ?? (cfg.reason_column ? row[cfg.reason_column] : '') ?? '',
  ).trim() || 'Disqualified';

  if (dryRun) return 'written';

  await db.entities.BuyerFeedback.create({
    lead_id: lead.id,
    buyer_id: source.buyer_code || lead.buyer_id || '',
    matched_by: matched_by || 'unknown',
    disposition: reason.slice(0, 120),
    raw_disposition: reason,
    outcome: 'disqualified',
    source: `sheet:${source.name}`,
    match_confidence: matched_by === 'email' || matched_by === 'lead_id' || matched_by === 'id' ? 'high' : 'medium',
  });

  // final_status is the lead's own lifecycle. It is only rewritten when the
  // operator has explicitly asked this sheet to do so.
  const patch = { buyer_feedback: reason.slice(0, 200) };
  if (cfg.set_status === true) patch.final_status = 'Disqualified';
  await db.entities.Lead.update(lead.id, patch);
  return 'written';
}

async function writeCallRow(db, base44, source, row, mapping, cfg, dryRun) {
  // A call sheet either creates leads or records an outcome on an existing lead.
  if (cfg.create_leads === true) return await writeLeadRow(db, base44, source, row, mapping, dryRun);
  return await writeFeedbackRow(db, source, row, mapping, cfg, dryRun);
}

async function writeCostRow(db, source, row, cfg, dryRun) {
  const date = toIsoDate(source.date_column ? row[source.date_column] : null);
  const spend = toNumber(cfg.spend_column ? row[cfg.spend_column] : null);
  if (!date || spend == null) return 'skipped';

  if (dryRun) return 'written';

  const supplierName = source.supplier_name || '';
  await db.entities.AdSpend.create({
    date,
    spend,
    platform: 'sheet',
    level: 'account',
    cost_source: `sheet:${source.name}`,
    supplier_name: supplierName || undefined,
    supplier_key: supplierName ? supplierName.trim().toLowerCase() : undefined,
    vertical: cfg.vertical || undefined,
    currency: cfg.currency || 'USD',
    leads: toNumber(cfg.leads_column ? row[cfg.leads_column] : null) ?? 0,
    clicks: toNumber(cfg.clicks_column ? row[cfg.clicks_column] : null) ?? 0,
    impressions: toNumber(cfg.impressions_column ? row[cfg.impressions_column] : null) ?? 0,
  });
  return 'written';
}

// ---------------------------------------------------------------------------

async function syncOne(db, base44, source, dryRun) {
  const purpose = source.purpose || 'leads';
  const mapping = parseJsonObject(source.mapping);
  const cfg = parseJsonObject(source.purpose_config);
  const included = parseJsonArray(source.included_columns);
  const seen = new Set(parseJsonArray(source.seen_keys));
  const dedupeCol = source.dedupe_column || '';

  const token = await googleToken(base44);
  const data = await fetchValues(token, source.sheet_id, source.worksheet);
  let rows = gridToObjects(data.values || []);

  // Column include list, when set, is applied before anything reads the row.
  if (included.length) {
    rows = rows.map((r) => {
      const trimmed = {};
      for (const col of included) if (r[col] !== undefined) trimmed[col] = r[col];
      return trimmed;
    });
  }

  const counts = { read: rows.length, written: 0, skipped: 0, errored: 0, remaining: 0 };
  const newKeys = [];
  let budget = ROW_BUDGET;

  for (const row of rows) {
    const marker = dedupeCol && row[dedupeCol] != null && String(row[dedupeCol]).trim() !== ''
      ? String(row[dedupeCol]).trim()
      : await sha256Hex(JSON.stringify(row));
    if (seen.has(marker)) continue;

    if (budget <= 0) { counts.remaining++; continue; }
    budget--;

    try {
      let result;
      if (purpose === 'buyer_feedback') result = await writeFeedbackRow(db, source, row, mapping, cfg, dryRun);
      else if (purpose === 'disqualified') result = await writeDisqualifiedRow(db, source, row, mapping, cfg, dryRun);
      else if (purpose === 'inbound_calls') result = await writeCallRow(db, base44, source, row, mapping, cfg, dryRun);
      else if (purpose === 'cost') result = await writeCostRow(db, source, row, cfg, dryRun);
      else result = await writeLeadRow(db, base44, source, row, mapping, dryRun);

      if (result === 'written') {
        counts.written++;
        // A skipped row is left unmarked so a later run can pick it up once the
        // lead it refers to exists.
        seen.add(marker);
        newKeys.push(marker);
      } else {
        counts.skipped++;
      }
    } catch (err) {
      counts.errored++;
      if (!dryRun) {
        await db.entities.ErrorLog.create({
          stage: 'system',
          severity: 'warning',
          message: `Sheet sync failed: ${source.name} (${purpose})`,
          detail: JSON.stringify({ error: err.message }),
          supplier_name: source.supplier_name || 'Unknown',
        }).catch(() => {});
      }
    }
  }

  if (dryRun) {
    return { source: source.name, purpose, dry_run: true, ...counts };
  }

  const merged = [...parseJsonArray(source.seen_keys), ...newKeys].slice(-5000);
  await db.entities.LeadSource.update(source.id, {
    seen_keys: JSON.stringify(merged),
    last_synced_at: new Date().toISOString(),
    last_sync_status: `${counts.written} written, ${counts.skipped} skipped of ${counts.read} rows`,
    last_run_counts: JSON.stringify(counts),
    ingested_count: (source.ingested_count || 0) + counts.written,
  });

  return { source: source.name, purpose, rows: counts.read, ingested: counts.written, ...counts };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    let body = {};
    try { body = await req.json(); } catch { /* empty body means sync all */ }

    // Who the connected Google account is, and whether Drive listing works.
    // The panel shows this beside the sheets so a broken connection is visible
    // where it matters, not buried in the Integrations tab.
    if (body.account_status) {
      let account = null;
      let connected = false;
      try {
        const conn = await base44.asServiceRole.connectors.getConnection('googlesheets');
        connected = !!conn?.accessToken;
        account = conn?.connectedAccount || conn?.connected_account || conn?.account || conn?.email || null;
      } catch (err) {
        return Response.json({ connected: false, can_list: false, error: err.message });
      }
      let canList = false;
      try {
        const token = await googleToken(base44);
        const probe = await fetch(
          'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)'
          + '&q=' + encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        canList = probe.ok;
      } catch { canList = false; }
      return Response.json({ connected, account, can_list: canList });
    }

    // List the spreadsheets in the connected Drive so the operator picks from a
    // dropdown instead of pasting a URL. Needs a Drive scope on the connector;
    // without it the caller falls back to pasting a link.
    if (body.list_spreadsheets) {
      const token = await googleToken(base44);
      const url = 'https://www.googleapis.com/drive/v3/files'
        + '?q=' + encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false")
        + '&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=100';
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) {
        const txt = await resp.text();
        return Response.json({
          files: [],
          scope_missing: resp.status === 403 || resp.status === 401,
          error: `Drive API HTTP ${resp.status}: ${txt.slice(0, 200)}`,
        });
      }
      const data = await resp.json();
      return Response.json({ files: data.files || [] });
    }

    // Tab names for a chosen spreadsheet.
    if (body.list_worksheets) {
      const token = await googleToken(base44);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${body.sheet_id}?fields=properties.title,sheets.properties.title`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) {
        const txt = await resp.text();
        return Response.json({ error: `Sheets API HTTP ${resp.status}: ${txt.slice(0, 200)}` }, { status: 400 });
      }
      const data = await resp.json();
      return Response.json({
        title: data?.properties?.title || '',
        worksheets: (data?.sheets || []).map((s) => s?.properties?.title).filter(Boolean),
      });
    }

    // Header row, a sample row and a row count, for mapping setup.
    if (body.preview) {
      const token = await googleToken(base44);
      let data;
      try {
        data = await fetchValues(token, body.sheet_id, body.worksheet);
      } catch (err) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      const rows = gridToObjects(data.values || []);
      const columns = (data.values && data.values[0])
        ? data.values[0].map((h) => String(h || '').trim()).filter(Boolean)
        : [];
      return Response.json({ columns, sample: rows[0] || {}, samples: rows.slice(0, 3), rowCount: rows.length });
    }

    const sourceId = body.source_id || null;
    const dryRun = body.dry_run === true;

    let sources;
    if (sourceId) sources = await db.entities.LeadSource.filter({ id: sourceId });
    else sources = await db.entities.LeadSource.filter({ kind: 'google_sheets', enabled: true });
    sources = (sources || []).filter((s) => s.kind === 'google_sheets');

    // Scheduled runs respect each source's chosen interval.
    if (body.scheduled) {
      const intervalMs = { '15m': 15 * 60000, '1h': 60 * 60000, '6h': 6 * 3600000, daily: 24 * 3600000 };
      const nowMs = Date.now();
      sources = sources.filter((s) => {
        if (!s.enabled) return false;
        const due = intervalMs[s.sync_interval || '1h'] || 3600000;
        if (!s.last_synced_at) return true;
        return nowMs - new Date(s.last_synced_at).getTime() >= due - 30000; // 30s slack
      });
    }

    if (sources.length === 0) return Response.json({ results: [], message: 'No Google Sheets sources to sync' });

    const results = [];
    for (const source of sources) {
      if (!source.sheet_id) { results.push({ source: source.name, error: 'No sheet configured' }); continue; }

      // Only a lead-bearing sheet needs an ingestion key, because only it
      // reaches processLead. The other purposes write records directly.
      const purpose = source.purpose || 'leads';
      const needsKey = purpose === 'leads'
        || (purpose === 'inbound_calls' && parseJsonObject(source.purpose_config).create_leads === true);
      if (needsKey) {
        let supplierKey = null;
        if (source.api_key_id) {
          const keys = await db.entities.ApiKey.filter({ id: source.api_key_id });
          if (keys[0]) supplierKey = keys[0].key;
        }
        if (!supplierKey) { results.push({ source: source.name, error: 'No API key linked' }); continue; }
        source._supplier_key = supplierKey;
      }

      try {
        results.push(await syncOne(db, base44, source, dryRun));
      } catch (err) {
        if (!dryRun) {
          await db.entities.LeadSource.update(source.id, {
            last_synced_at: new Date().toISOString(),
            last_sync_status: `Error: ${err.message}`.slice(0, 200),
          }).catch(() => {});
        }
        results.push({ source: source.name, error: err.message });
      }
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
