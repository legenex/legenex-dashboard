// Caller model: public with key.
//
// This endpoint is unauthenticated at the Base44 layer and must be invocable
// without a logged-in user. It authenticates ONLY by a route token, read from
// the query param `token` or the `X-Webhook-Token` header, SHA-256 hashed and
// matched against an enabled leadbyte InboundWebhookRoute. It uses the service
// role to look up the route and to read and write Lead.
//
// This function only RECORDS LeadByte sold/unsold/return/conversion outcome
// data onto the matching Lead. It never calls processLead or any routing,
// delivery, connector, CAPI, or HLR logic. It never writes trustedform_valid
// or cert_source, and never overwrites the inbound pipeline fields.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Treat a literal single dash and empty string as null. Returns a trimmed
// string, or null when the value is empty/dash/nullish.
function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '' || s === '-') return null;
  // LeadByte sends the literal string "null" for some empty fields.
  if (s.toLowerCase() === 'null') return null;
  // Unresolved merge field, entirely wrapped in braces e.g. {supplier_brand}.
  if (/^\{.*\}$/.test(s)) return null;
  return s;
}

// Coerce to a number, or null when empty/dash/non-numeric.
function num(v: unknown): number | null {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

// Map "buyer_returned" style values to a boolean. Truthy or yes -> true,
// dash/empty/anything else -> false.
function toBool(v: unknown): boolean {
  const s = clean(v);
  if (s === null) return false;
  const lower = s.toLowerCase();
  return lower === 'yes' || lower === 'true' || lower === '1' || lower === 'y';
}

// Map the payload lead_status to a valid Lead final_status enum value, or null
// when it is missing or does not map (leaving final_status unchanged).
function mapFinalStatus(v: unknown): string | null {
  const s = clean(v);
  if (s === null) return null;
  const map: Record<string, string> = {
    sold: 'Sold',
    returned: 'Returned',
    unsold: 'Unsold',
    rejected: 'Rejected',
  };
  return map[s.toLowerCase()] || null;
}

// Only set a key when the value is non-null, so we never clobber with null.
function setIf(out: Record<string, any>, key: string, value: unknown) {
  if (value !== null && value !== undefined) out[key] = value;
}

// Translation map: webhook payload key -> app canonical field name. These land
// in Lead.mapped_fields (never first-class outcome columns). Deliberate
// exclusion: contact_trustedform_url (stays only in the raw payload, never in
// mapped_fields, and never written to trustedform_valid or cert_source).
// accident_date maps to the accident_timeframe canonical field (holding the
// raw LeadByte bucket value), never to the Calculated accident_date field.
// supplier_source maps into the "Supplier Source" canonical field like any
// other mapped field and no longer feeds supplier_name.
const CANONICAL_MAP: Record<string, string> = {
  contact_first_name: 'first_name',
  contact_last_name: 'last_name',
  contact_email: 'email',
  contact_phone: 'mobile',
  contact_zip: 'zip',
  contact_phone_verified: 'phone_verified',
  contact_jornaya_token: 'jornaya_token',
  contact_optin_url: 'optin_url',
  contact_user_agent: 'user_agent',
  geo_country: 'geoip_country',
  geo_state: 'geoip_state',
  geo_city: 'geoip_city',
  geo_zip: 'geoip_zip',
  geo_ip: 'ip_address',
  geo_language: 'geo_language',
  utm_source: 'utm_source',
  utm_campaign: 'utm_campaign',
  utm_medium: 'utm_medium',
  utm_content: 'utm_content',
  utm_terms: 'utm_terms',
  utm_ad_label: 'ad_label',
  supplier_sid: 'sid',
  supplier_ssid: 'ssid',
  supplier_s1: 's1',
  supplier_s2: 's2',
  supplier_s3: 's3',
  supplier_brand: 'supplier_brand',
  supplier_source: 'Supplier Source',
  tc_id: 'tc_id',
  leadshook_id: 'leadshook_id',
  accident_state: 'accident_state',
  accident_type: 'accident_type',
  accident_details: 'accident_details',
  incident_date: 'incident_date',
  injured: 'injured',
  injury_type: 'injury_type',
  treatment: 'treatment',
  treatment_type: 'treatment_type',
  treatment_time: 'treatment_time',
  fault: 'fault',
  attorney: 'attorney',
  attorney_change: 'attorney_change',
  insurance: 'insurance',
  police_report_filed: 'police_report',
  accident_date: 'accident_timeframe',
  lead_status: 'lead_status',
  lead_revenue: 'revenue',
  lead_vertical: 'vertical',
  leadbyte_id: 'lead_id',
  date_created: 'timestamp',
};

// Build the canonical object from the payload, keeping only cleaned present
// values (clean skips null/empty/single-dash).
function buildCanonical(body: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [payloadKey, canonicalKey] of Object.entries(CANONICAL_MAP)) {
    const value = clean(body[payloadKey]);
    if (value !== null) out[canonicalKey] = value;
  }
  return out;
}

// Parse existing mapped_fields JSON to an object; null/empty/invalid -> {}.
function parseMapped(v: unknown): Record<string, any> {
  const s = clean(v);
  if (s === null) return {};
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;

  // ── Auth gate: route token only, before any Lead access ─────────────────
  const url = new URL(req.url);
  const token = (url.searchParams.get('token') || req.headers.get('X-Webhook-Token') || '').trim();
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let route: any = null;
  try {
    const tokenHash = await sha256Hex(token);
    const routes = await svc.entities.InboundWebhookRoute.filter({
      token_hash: tokenHash,
      enabled: true,
      provider: 'leadbyte',
    });
    route = (Array.isArray(routes) ? routes : [])[0] || null;
  } catch {
    route = null;
  }
  if (!route) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Parse the outcome payload ───────────────────────────────────────────
  let body: any;
  const rawBody = await req.text();
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const leadbyteId = num(body.leadbyte_id);
    const finalStatus = mapFinalStatus(body.lead_status);
    const canonical = buildCanonical(body);

    // Outcome fields shared by update and create.
    const outcome: Record<string, any> = {};
    setIf(outcome, 'revenue', num(body.lead_revenue));
    setIf(outcome, 'supplier_payout', num(body.supplier_payout));
    setIf(outcome, 'buyer_id', clean(body.buyer_id));
    setIf(outcome, 'buyer_name', clean(body.buyer_name));
    setIf(outcome, 'buyer_conversion', clean(body.buyer_conversion));
    setIf(outcome, 'buyer_feedback', clean(body.buyer_feedback));
    outcome.buyer_returned = toBool(body.buyer_returned);
    setIf(outcome, 'buyer_return_reason', clean(body.buyer_return_reason));
    setIf(outcome, 'lead_tier', clean(body.lead_tier));
    setIf(outcome, 'lead_score', num(body.lead_score));
    setIf(outcome, 'lead_vertical', clean(body.lead_vertical));
    if (finalStatus !== null) outcome.final_status = finalStatus;
    outcome.leadbyte_outcome_at = new Date().toISOString();
    outcome.leadbyte_outcome_payload = rawBody;

    // Contact fields (used to fill blanks on update, and to seed a create).
    const contactFirst = clean(body.contact_first_name);
    const contactLast = clean(body.contact_last_name);
    const contactEmail = clean(body.contact_email);
    const contactPhone = clean(body.contact_phone);

    let matched = false;
    let leadId: string | null = null;
    let resultStatus: string | null = finalStatus;

    let existing: any = null;
    // 1. Primary match: the LeadByte lead id.
    if (leadbyteId !== null) {
      const found = await svc.entities.Lead.filter({ leadbyte_lead_id: leadbyteId });
      existing = (Array.isArray(found) ? found : [])[0] || null;
    }
    // 2. Fallback match: email, then phone. Outcome webhooks for direct-route
    //    leads carry no leadbyte_lead_id (those leads never went to LeadByte),
    //    so match them on contact identity instead of creating a phantom lead.
    if (!existing && contactEmail) {
      const found = await svc.entities.Lead.filter({ email: contactEmail });
      existing = (Array.isArray(found) ? found : [])[0] || null;
    }
    if (!existing && contactPhone) {
      const found = await svc.entities.Lead.filter({ mobile: contactPhone });
      existing = (Array.isArray(found) ? found : [])[0] || null;
    }

    if (existing) {
      matched = true;
      leadId = existing.id;
      const patch: Record<string, any> = { ...outcome };
      // Guard: an outcome postback must never downgrade a lead that already
      // sold at intake. If the lead is already Sold, keep it Sold and never
      // zero out its captured revenue.
      const alreadySold = String(existing.final_status || '').toLowerCase() === 'sold';
      if (alreadySold && patch.final_status && patch.final_status !== 'Sold' && !toBool(body.buyer_returned)) {
        delete patch.final_status;
      }
      // Never overwrite an existing non-zero revenue with a null/zero outcome value.
      if (patch.revenue == null || Number(patch.revenue) === 0) {
        if (Number(existing.revenue) > 0) delete patch.revenue;
      }
      // Fill contact fields only when currently empty.
      if (!clean(existing.first_name) && contactFirst) patch.first_name = contactFirst;
      if (!clean(existing.last_name) && contactLast) patch.last_name = contactLast;
      if (!clean(existing.email) && contactEmail) patch.email = contactEmail;
      if (!clean(existing.mobile) && contactPhone) patch.mobile = contactPhone;
      // Merge canonical fields into mapped_fields, filling only blanks so we
      // never overwrite an existing non-empty value.
      const mergedMapped = parseMapped(existing.mapped_fields);
      for (const [key, value] of Object.entries(canonical)) {
        if (clean(mergedMapped[key]) === null) mergedMapped[key] = value;
      }
      patch.mapped_fields = JSON.stringify(mergedMapped);
      await svc.entities.Lead.update(existing.id, patch);
      resultStatus = patch.final_status || existing.final_status || null;
    } else {
      // No matching lead. This is an outcome/postback webhook: it records the
      // buyer outcome onto a lead that already exists in our system. It must
      // NEVER create a new lead — doing so produced phantom "Processing"
      // duplicates for direct-route leads. Acknowledge and skip.
      await svc.entities.InboundWebhookRoute.update(route.id, {
        receipt_count: (Number(route.receipt_count) || 0) + 1,
        last_received_at: new Date().toISOString(),
      });
      return Response.json({
        ok: true,
        matched: false,
        lead_id: null,
        final_status: null,
        message: 'No matching lead found; outcome ignored (no lead created).',
      }, { status: 200 });
    }

    // On success, bump receipt telemetry on the route.
    await svc.entities.InboundWebhookRoute.update(route.id, {
      receipt_count: (Number(route.receipt_count) || 0) + 1,
      last_received_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      matched,
      lead_id: leadId,
      final_status: resultStatus,
    }, { status: 200 });
  } catch (err) {
    try {
      await svc.entities.InboundWebhookRoute.update(route.id, {
        error_count: (Number(route.error_count) || 0) + 1,
        last_error: (err as Error).message || 'Unexpected processing error',
      });
    } catch {
      // Telemetry write must not mask the original error.
    }
    return Response.json({ error: 'Processing error' }, { status: 500 });
  }
});