// Generic inbound lead webhook.
//
//   POST https://api.legenex.com/functions/webhook?key=<api_key>
//
// Replaces the per-route token model in leadbyteWebhook. One key (master, or a
// supplier-scoped key) authenticates every sender, and the sender does not have
// to be LeadByte: anything that can POST JSON works.
//
// WHAT IT DOES
//   - Authenticates on ?key= against ApiKey. Master keys accept any supplier;
//     a supplier-scoped key pins the lead to that supplier.
//   - Resolves the supplier from the key, falling back to `sid` in the payload.
//   - Reads the status from `lead_status` in the payload (dynamic). A route may
//     pin a status instead, but nothing is required to.
//   - Matches an existing lead on lead id, then email, then mobile.
//   - No match: CREATES the lead. Not every lead reaches this system through
//     processLead; affiliates post straight into their own platform, so this is
//     the first this system hears of them.
//   - Match: UPDATES revenue, buyer, status and any field the stored lead is
//     missing.
//
// RESELL AFTER RETURN
//   A lead can go Sold -> Returned -> Sold with a different buyer. `buyer_returned`
//   is sticky: once true it stays true even when the lead is resold, so the lead
//   counts once as Sold (its current status) and once as Returned (the flag).
//   Resetting the flag on resale would erase the return from every report.
//
// Field names are matched loosely, so a sender may use flat keys (email, sid,
// revenue) or the older prefixed ones (contact_email, supplier_sid, lead_revenue).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  // LeadByte and others send a bare dash for "no value".
  if (s === '' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') return null;
  return s;
};

const num = (v: unknown): number | null => {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const truthy = (v: unknown): boolean => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
};

// Payload key aliases -> canonical field. First present key wins.
const FIELD_ALIASES: Record<string, string[]> = {
  first_name: ['first_name', 'contact_first_name', 'firstname'],
  last_name: ['last_name', 'contact_last_name', 'lastname'],
  email: ['email', 'contact_email'],
  mobile: ['mobile', 'contact_phone', 'phone', 'phone1'],
  zip: ['zip', 'contact_zip', 'postcode'],
  phone_verified: ['phone_verified', 'contact_phone_verified'],
  trustedform_url: ['trustedform_url', 'contact_trustedform_url'],
  jornaya_token: ['jornaya_token', 'contact_jornaya_token'],
  optin_url: ['optin_url', 'contact_optin_url', 'optinurl'],
  user_agent: ['user_agent', 'contact_user_agent'],
  ip_address: ['ip_address', 'geo_ip', 'ipaddress'],
  geoip_country: ['geoip_country', 'geo_country', 'country'],
  geoip_state: ['geoip_state', 'geo_state'],
  geoip_city: ['geoip_city', 'geo_city'],
  geoip_zip: ['geoip_zip', 'geo_zip'],
  utm_source: ['utm_source'],
  utm_campaign: ['utm_campaign'],
  utm_medium: ['utm_medium'],
  utm_content: ['utm_content'],
  utm_terms: ['utm_terms'],
  ad_label: ['ad_label', 'utm_ad_label'],
  sid: ['sid', 'supplier_sid'],
  ssid: ['ssid', 'supplier_ssid'],
  s1: ['s1', 'supplier_s1', 'c1'],
  s2: ['s2', 'supplier_s2', 'c2'],
  s3: ['s3', 'supplier_s3', 'c3'],
  supplier_brand: ['supplier_brand'],
  'Supplier Source': ['source', 'supplier_source'],
  supplier_payout: ['supplier_payout', 'bid_amount'],
  vertical: ['vertical', 'lead_vertical'],
  lead_tier: ['lead_tier', 'tier'],
  lead_status: ['lead_status', 'status'],
  revenue: ['revenue', 'lead_revenue'],
  buyer_name: ['buyer_name', 'buyername'],
  buyer_id: ['buyer_id', 'buyer'],
  buyer_feedback: ['buyer_feedback'],
  returned: ['buyer_returned', 'returned'],
  returned_reason: ['buyer_return_reason', 'returned_reason'],
  accident_state: ['accident_state'],
  accident_type: ['accident_type'],
  accident_details: ['accident_details'],
  incident_date: ['incident_date'],
  injured: ['injured'],
  injury_type: ['injury_type'],
  treatment: ['treatment'],
  treatment_type: ['treatment_type'],
  treatment_time: ['treatment_time'],
  fault: ['fault'],
  attorney: ['attorney'],
  insurance: ['insurance'],
  police_report: ['police_report', 'police_report_filed'],
  tc_id: ['tc_id'],
  leadshook_id: ['leadshook_id'],
  lead_id: ['lead_id', 'leadbyte_id', 'leadid'],
  timestamp: ['timestamp', 'date_created', 'received'],
};

function canonicalise(body: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, keys] of Object.entries(FIELD_ALIASES)) {
    for (const k of keys) {
      const v = clean(body[k]);
      if (v !== null) { out[field] = v; break; }
    }
  }
  return out;
}

// Payload status -> the app's final_status values.
const STATUS_MAP: Record<string, string> = {
  sold: 'Sold',
  unsold: 'Unsold',
  returned: 'Returned',
  return: 'Returned',
  rejected: 'Rejected',
  reject: 'Rejected',
  duplicate: 'Duplicate',
  disqualified: 'Disqualified',
  dq: 'Disqualified',
  qualified: 'Qualified',
  queued: 'Queued',
  error: 'Error',
};

const mapStatus = (v: unknown): string | null => {
  const s = clean(v);
  return s ? (STATUS_MAP[s.toLowerCase()] || null) : null;
};

const reply = (status: number, payload: Record<string, unknown>) =>
  Response.json(payload, { status });

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return reply(405, { ok: false, outcome: 'rejected', reason: 'method_not_allowed', message: 'POST a JSON body to this endpoint.' });
  }

  let raw = '';
  let body: Record<string, any> = {};
  try {
    raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return reply(400, { ok: false, outcome: 'rejected', reason: 'invalid_json', message: 'Body was not valid JSON.' });
  }

  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;

  // ---- Auth on ?key= (header accepted as an alternative) --------------------
  const url = new URL(req.url);
  const presented = clean(url.searchParams.get('key'))
    || clean(req.headers.get('x-api-key'))
    || clean(body.key);

  if (!presented) {
    return reply(401, { ok: false, outcome: 'rejected', reason: 'missing_key', message: 'No API key supplied. Append ?key=... to the URL.' });
  }

  let apiKey: any = null;
  try {
    const found = await svc.entities.ApiKey.filter({ key: presented });
    apiKey = (Array.isArray(found) ? found : [])[0] || null;
  } catch { /* fall through to the rejection below */ }

  if (!apiKey || apiKey.active === false) {
    return reply(401, {
      ok: false, outcome: 'rejected', reason: 'invalid_key',
      message: apiKey ? 'That API key is disabled.' : 'That API key is not recognised.',
    });
  }

  try {
    const c = canonicalise(body);
    const email = c.email || null;
    const mobile = c.mobile || null;
    const externalId = num(c.lead_id);
    const status = mapStatus(c.lead_status);

    // ---- Supplier resolution ------------------------------------------------
    // A supplier-scoped key pins the supplier. A master key resolves it from
    // the sid on the payload, matched loosely against the Supplier records
    // because a sid (LEADFLOW, INBNDS-SURVEY) and a name (LeadFlow, Inbounds)
    // differ in case and suffix.
    let supplierName: string | null = clean(apiKey.supplier_name);
    if (!supplierName && c.sid) {
      supplierName = c.sid;
      try {
        const sups = await svc.entities.Supplier.list();
        const n = (v: unknown) => String(v ?? '').trim().toLowerCase();
        const s = n(c.sid);
        const hit = (Array.isArray(sups) ? sups : []).find((x: any) => {
          const name = n(x.name);
          return name && s && (name === s || s.includes(name) || name.includes(s));
        });
        if (hit?.name) supplierName = hit.name;
      } catch { /* keep the sid as the attribution */ }
    }

    if (!email && !mobile && externalId === null) {
      return reply(400, {
        ok: false, outcome: 'rejected', reason: 'no_identifying_fields',
        message: 'Payload carried no email, mobile or lead id, so the lead can neither be matched nor created.',
      });
    }

    // ---- Match --------------------------------------------------------------
    let existing: any = null;
    const firstOf = (r: unknown) => (Array.isArray(r) ? r : [])[0] || null;
    if (externalId !== null) {
      existing = firstOf(await svc.entities.Lead.filter({ leadbyte_lead_id: externalId }));
    }
    if (!existing && email) {
      existing = firstOf(await svc.entities.Lead.filter({ email }));
    }
    if (!existing && mobile) {
      existing = firstOf(await svc.entities.Lead.filter({ mobile }));
    }

    // Record the request against the key regardless of outcome.
    const touchKey = async () => {
      try {
        await svc.entities.ApiKey.update(apiKey.id, {
          last_used_at: new Date().toISOString(),
          request_count: (Number(apiKey.request_count) || 0) + 1,
        });
      } catch { /* telemetry only */ }
    };

    // ---- Update -------------------------------------------------------------
    if (existing) {
      const prior = (() => {
        try { return JSON.parse(existing.mapped_fields || '{}') || {}; } catch { return {}; }
      })();

      const patch: Record<string, any> = {};
      const changed: string[] = [];

      const revenue = num(c.revenue);
      if (revenue !== null && revenue !== Number(existing.revenue)) { patch.revenue = revenue; changed.push('revenue'); }

      const payout = num(c.supplier_payout);
      if (payout !== null && payout !== Number(existing.supplier_payout)) { patch.supplier_payout = payout; changed.push('supplier_payout'); }

      if (c.buyer_name && c.buyer_name !== existing.buyer_name) { patch.buyer_name = c.buyer_name; changed.push('buyer_name'); }
      if (c.buyer_id && c.buyer_id !== existing.buyer_id) { patch.buyer_id = c.buyer_id; changed.push('buyer_id'); }
      if (c.buyer_feedback) patch.buyer_feedback = c.buyer_feedback;

      if (status && status !== existing.final_status) { patch.final_status = status; changed.push('final_status'); }

      // Sticky return flag. A lead resold after a return must still count as a
      // return, so this only ever goes false -> true, never back.
      const nowReturned = status === 'Returned' || truthy(c.returned);
      if (nowReturned && existing.buyer_returned !== true) { patch.buyer_returned = true; changed.push('buyer_returned'); }
      if (c.returned_reason) patch.buyer_return_reason = c.returned_reason;

      if (externalId !== null && existing.leadbyte_lead_id !== externalId) patch.leadbyte_lead_id = externalId;
      if (supplierName && !clean(existing.supplier_name)) patch.supplier_name = supplierName;

      // Merge the payload into mapped_fields without overwriting values already
      // present: the stored lead is the fuller record for anything the outcome
      // does not carry.
      const merged = { ...prior };
      let mergedChanged = false;
      for (const [k, v] of Object.entries(c)) {
        if (clean(merged[k]) === null && clean(v) !== null) { merged[k] = v; mergedChanged = true; }
      }
      merged.last_outcome_at = new Date().toISOString();
      if (status) merged.last_outcome_status = status;
      if (mergedChanged || status) patch.mapped_fields = JSON.stringify(merged);

      if (changed.length === 0) {
        await touchKey();
        return reply(200, {
          ok: true, outcome: 'duplicate', lead_id: existing.id,
          final_status: existing.final_status || null, supplier: existing.supplier_name || supplierName,
          message: 'Lead already recorded with these values. Nothing changed.',
        });
      }

      await svc.entities.Lead.update(existing.id, patch);
      await touchKey();
      return reply(200, {
        ok: true, outcome: 'updated', lead_id: existing.id,
        final_status: patch.final_status || existing.final_status || null,
        supplier: patch.supplier_name || existing.supplier_name || supplierName,
        changed,
        message: `Matched an existing lead and updated ${changed.join(', ')}.`,
      });
    }

    // ---- Create -------------------------------------------------------------
    // lead_type is sid-derived and lives inside mapped_fields, not as a column.
    const sidUpper = String(c.sid || '').trim().toUpperCase();
    const leadType = (sidUpper === 'LEADFLOW' || sidUpper === 'LGNX') ? 'Quiz' : 'Affiliate';

    const created = await svc.entities.Lead.create({
      archived: false,
      first_name: c.first_name || undefined,
      last_name: c.last_name || undefined,
      email: email || undefined,
      mobile: mobile || undefined,
      supplier_name: supplierName || undefined,
      revenue: num(c.revenue) ?? undefined,
      supplier_payout: num(c.supplier_payout) ?? undefined,
      buyer_name: c.buyer_name || undefined,
      buyer_id: c.buyer_id || undefined,
      buyer_feedback: c.buyer_feedback || undefined,
      buyer_returned: status === 'Returned' || truthy(c.returned),
      buyer_return_reason: c.returned_reason || undefined,
      final_status: status || undefined,
      leadbyte_lead_id: externalId ?? undefined,
      mapped_fields: JSON.stringify({
        ...c,
        lead_type: leadType,
        ingest_channel: 'webhook',
        ingest_key: apiKey.name || apiKey.key_prefix || null,
        last_outcome_at: new Date().toISOString(),
        last_outcome_status: status || null,
      }),
    });

    await touchKey();
    return reply(200, {
      ok: true, outcome: 'created', lead_id: created?.id || null,
      final_status: status || null, supplier: supplierName,
      message: 'Lead was not in this system and has been created from the payload.',
    });
  } catch (error) {
    return reply(500, { ok: false, outcome: 'error', message: (error as Error).message });
  }
});
