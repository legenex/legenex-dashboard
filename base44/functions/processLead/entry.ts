import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Resolve phone_verified value from HLR result based on configured source
function resolvePhoneVerified(hlrResult, source) {
  if (!hlrResult) return '';
  if (source === 'lh_hlr_response') return hlrResult.lh_hlr_response || '';
  if (source === 'summary_score') return String(hlrResult.summary_score ?? '');
  if (source === 'boolean') return hlrResult.lh_hlr_response === 'Exact Match' ? 'true' : 'false';
  return hlrResult.lh_hlr_response || '';
}

function formatTimestamp(date, fmt) {
  const pad = (n) => String(n).padStart(2, '0');
  return (fmt || 'MM/DD/YYYY HH:MM:SS')
    .replace('YYYY', date.getUTCFullYear())
    .replace('MM', pad(date.getUTCMonth() + 1))
    .replace('DD', pad(date.getUTCDate()))
    .replace('HH', pad(date.getUTCHours()))
    .replace('MM', pad(date.getUTCMinutes()))
    .replace('SS', pad(date.getUTCSeconds()));
}

function runCalculations(calcs, leadData, hlrResult, phoneVerifiedSource) {
  const enriched = { ...leadData };
  enriched.phone_verified = resolvePhoneVerified(hlrResult, phoneVerifiedSource);
  const sorted = [...calcs].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  for (const calc of sorted) {
    if (!calc.enabled) continue;
    let cfg = {};
    try { cfg = JSON.parse(calc.config || '{}'); } catch {}
    const inputValue = enriched[calc.input_field] ?? '';
    try {
      if (calc.transform_type === 'date_age_bucket') {
        const fmt = cfg.date_format || 'MM/DD/YYYY';
        let parsed = null;
        if (fmt === 'MM/DD/YYYY') {
          const parts = String(inputValue).split('/');
          if (parts.length === 3) parsed = new Date(`${parts[2]}-${parts[0]}-${parts[1]}T00:00:00Z`);
        } else if (fmt === 'YYYY-MM-DD') {
          parsed = new Date(inputValue + 'T00:00:00Z');
        } else {
          parsed = new Date(inputValue);
        }
        if (parsed && !isNaN(parsed)) {
          const ageDays = Math.floor((Date.now() - parsed.getTime()) / 86400000);
          const buckets = (cfg.buckets || []).slice().sort((a, b) => a.max_days - b.max_days);
          let matched = cfg.fallback || '';
          for (const b of buckets) { if (ageDays <= b.max_days) { matched = b.label; break; } }
          enriched[calc.output_token] = matched;
        } else { enriched[calc.output_token] = cfg.fallback || ''; }
      } else if (calc.transform_type === 'value_map') {
        const map = cfg.map || {};
        const normalized = String(inputValue).trim().toLowerCase();
        if (map[inputValue] !== undefined) { enriched[calc.output_token] = map[inputValue]; }
        else {
          const matchKey = Object.keys(map).find(k => k.trim().toLowerCase() === normalized);
          enriched[calc.output_token] = matchKey !== undefined ? map[matchKey] : inputValue;
        }
      } else if (calc.transform_type === 'script') {
        enriched[calc.output_token] = inputValue;
      }
    } catch { enriched[calc.output_token] = inputValue; }
  }
  return enriched;
}

function buildPayloadFromTemplate(template, enrichedData) {
  if (!template) return enrichedData;
  let tmpl;
  try { tmpl = typeof template === 'string' ? template : JSON.stringify(template); } catch { return enrichedData; }
  const result = tmpl.replace(/\{\{([\w.]+)\}\}/g, (_, token) => {
    const val = enrichedData[token];
    return val !== undefined && val !== null ? String(val) : '';
  });
  try { return JSON.parse(result); } catch { return result; }
}

// ── CAPI helpers ──────────────────────────────────────────────────────────

async function sha256Hex(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeStr(s) { return String(s || '').trim().toLowerCase(); }

function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '1' + digits;
  return digits;
}

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Build Facebook CAPI user_data object from lead data. Uses pre-hashed values
// from inbound if available, otherwise computes SHA-256.
async function buildCapiUserData(d) {
  const ud = {};
  if (d.email_hash) ud.em = [d.email_hash];
  else if (d.email) ud.em = [await sha256Hex(normalizeStr(d.email))];
  if (d.phone_hash) ud.ph = [d.phone_hash];
  else if (d.mobile) ud.ph = [await sha256Hex(normalizePhone(d.mobile))];
  if (d.first_name_hash) ud.fn = [d.first_name_hash];
  else if (d.first_name) ud.fn = [await sha256Hex(normalizeStr(d.first_name))];
  if (d.last_name_hash) ud.ln = [d.last_name_hash];
  else if (d.last_name) ud.ln = [await sha256Hex(normalizeStr(d.last_name))];
  if (d.city_hash) ud.ct = [d.city_hash];
  else if (d.city) ud.ct = [await sha256Hex(normalizeStr(d.city))];
  if (d.state_hash) ud.st = [d.state_hash];
  else if (d.state) ud.st = [await sha256Hex(normalizeStr(d.state))];
  if (d.zip_hash) ud.zp = [d.zip_hash];
  else if (d.zip) ud.zp = [await sha256Hex(normalizeStr(d.zip))];
  if (d.country_hash) ud.country = [d.country_hash];
  else if (d.country) ud.country = [await sha256Hex(normalizeStr(d.country))];
  if (d.ip_address || d.ipaddress) ud.client_ip_address = d.ip_address || d.ipaddress;
  if (d.user_agent) ud.client_user_agent = d.user_agent;
  if (d.fbc) ud.fbc = d.fbc;
  if (d.fbp) ud.fbp = d.fbp;
  if (d.external_id_hash) ud.external_id = d.external_id_hash;
  else if (d.external_id) ud.external_id = await sha256Hex(normalizeStr(d.external_id));
  return ud;
}

// Send a single Facebook CAPI event and return a result object.
async function sendCapiEvent(conn, leadData, leadId, eventName) {
  const apiVer = conn.fb_api_version || 'v21.0';
  const pixel = conn.fb_pixel_id;
  const token = conn.fb_access_token;
  const url = `https://graph.facebook.com/${apiVer}/${pixel}/events?access_token=${token}`;
  const actionSource = conn.action_source || 'website';
  const eventId = leadData.event_id || leadData.eventId || String(leadId);
  const eventSourceUrl = leadData.optin_url || leadData.optinurl || '';
  const userData = await buildCapiUserData(leadData);
  const body = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: actionSource,
      event_source_url: eventSourceUrl,
      event_id: eventId,
      user_data: userData,
      custom_data: {
        brand: leadData.supplier_brand || leadData.brand || '',
        supplier: leadData.supplier_name || '',
        lead_status: leadData.lead_status || '',
      },
    }],
  };
  if (conn.fb_test_event_code) body.test_event_code = conn.fb_test_event_code;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let fbResult;
    try { fbResult = JSON.parse(text); } catch { fbResult = { raw: text }; }
    return {
      connector: conn.name,
      event_name: eventName,
      pixel,
      http_status: resp.status,
      fbtrace_id: fbResult.fbtrace_id || '',
      success: resp.ok,
      raw: fbResult,
    };
  } catch (err) {
    return {
      connector: conn.name,
      event_name: eventName,
      pixel,
      http_status: null,
      fbtrace_id: '',
      success: false,
      error: err.message,
    };
  }
}

// Send a webhook/generic_http event.
async function sendHttpEvent(conn, leadData, leadId) {
  const payload = buildPayloadFromTemplate(conn.payload_template, { ...leadData, lead_id: leadId });
  const headerRows = parseJsonArray(conn.headers);
  const hdrs = {};
  for (const r of headerRows) { if (r.key) hdrs[r.key] = r.value; }
  const ct = conn.content_type || 'application/json';
  hdrs['Content-Type'] = ct;
  let bodyStr;
  if (ct === 'application/x-www-form-urlencoded') {
    bodyStr = new URLSearchParams(typeof payload === 'object' ? payload : {}).toString();
  } else {
    bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }
  try {
    const resp = await fetch(conn.target_url, { method: conn.http_method || 'POST', headers: hdrs, body: bodyStr });
    return { connector: conn.name, http_status: resp.status, success: resp.ok };
  } catch (err) {
    return { connector: conn.name, http_status: null, success: false, error: err.message };
  }
}

// Check if a connector's filters match the current lead.
function connectorMatchesFilters(conn, leadData, supplierAttribution, supplierRecord) {
  const brands = parseJsonArray(conn.filter_brands);
  if (brands.length > 0) {
    const lb = leadData.supplier_brand || leadData.brand || '';
    if (!brands.includes(lb)) return false;
  }
  const suppliers = parseJsonArray(conn.filter_suppliers);
  if (suppliers.length > 0) {
    const sn = supplierAttribution || '';
    const sid = leadData.sid || leadData.supplier_sid || '';
    if (!suppliers.includes(sn) && !suppliers.includes(sid)) return false;
  }
  const types = parseJsonArray(conn.filter_supplier_types);
  if (types.length > 0) {
    const st = supplierRecord?.supplier_type || '';
    if (!types.includes(st)) return false;
  }
  return true;
}

// Fire all matching connectors for a given trigger. Fire-and-forget: returns
// immediately, results handled in background.
function fireConnectors(db, connectors, trigger, leadData, leadId, supplierAttribution, supplierRecord, capiEventNameMap) {
  for (const conn of connectors) {
    if (!conn.enabled) continue;
    const triggers = parseJsonArray(conn.triggers);
    if (!triggers.includes(trigger)) continue;
    if (!connectorMatchesFilters(conn, leadData, supplierAttribution, supplierRecord)) continue;

    if (conn.kind === 'facebook_capi') {
      const eventName = capiEventNameMap[trigger] || 'Lead';
      sendCapiEvent(conn, leadData, leadId, eventName)
        .then(async (result) => {
          await appendCapiLog(db, leadId, result);
          if (!result.success) {
            await db.entities.ErrorLog.create({
              lead_id: leadId, stage: 'leadbyte', severity: 'warning',
              message: `CAPI failure: ${conn.name} (${eventName})`,
              detail: JSON.stringify(result), supplier_name: supplierAttribution,
            }).catch(() => {});
            await evaluateNotifications(db, ['capi_failure', 'api_error'], { id: leadId }, supplierAttribution,
              { message: `CAPI failure: ${conn.name} (${eventName}) - ${result.error || result.http_status}` }).catch(() => {});
          }
        })
        .catch(async (err) => {
          await appendCapiLog(db, leadId, { connector: conn.name, event_name: eventName, pixel: conn.fb_pixel_id, http_status: null, fbtrace_id: '', success: false, error: err.message });
          await db.entities.ErrorLog.create({
            lead_id: leadId, stage: 'leadbyte', severity: 'warning',
            message: `CAPI error: ${conn.name} (${eventName})`,
            detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution,
          }).catch(() => {});
        });
    } else {
      // webhook or generic_http
      sendHttpEvent(conn, leadData, leadId)
        .then(async (result) => {
          if (!result.success) {
            await db.entities.ErrorLog.create({
              lead_id: leadId, stage: 'leadbyte', severity: 'warning',
              message: `API error: ${conn.name}`,
              detail: JSON.stringify(result), supplier_name: supplierAttribution,
            }).catch(() => {});
            await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution,
              { message: `API error: ${conn.name} - ${result.error || result.http_status}` }).catch(() => {});
          }
        })
        .catch(async (err) => {
          await db.entities.ErrorLog.create({
            lead_id: leadId, stage: 'leadbyte', severity: 'warning',
            message: `API error: ${conn.name}`,
            detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution,
          }).catch(() => {});
        });
    }
  }
}

// Append a CAPI result to the lead's capi_log field.
async function appendCapiLog(db, leadId, result) {
  try {
    const leads = await db.entities.Lead.filter({ id: leadId });
    const lead = leads[0];
    if (!lead) return;
    let log = [];
    try { log = JSON.parse(lead.capi_log || '[]'); } catch {}
    log.push({ connector: result.connector, event_name: result.event_name, pixel: result.pixel, http_status: result.http_status, fbtrace_id: result.fbtrace_id });
    await db.entities.Lead.update(leadId, { capi_log: JSON.stringify(log) });
  } catch {}
}

// Evaluate notification rules matching the given condition types.
async function evaluateNotifications(db, conditionTypes, lead, supplierAttribution, context = {}) {
  try {
    const rules = await db.entities.NotificationRule.filter({ enabled: true });
    for (const rule of rules) {
      if (!conditionTypes.includes(rule.condition_type)) continue;
      let summary = '';
      if (rule.condition_type === 'capi_failure' || rule.condition_type === 'api_error') {
        summary = `${rule.name}: ${context.message || 'API connector failure'}`;
      } else if (rule.condition_type === 'lead_queued') {
        summary = `${rule.name}: Lead queued - ${context.queue_reason || lead.queue_reason || 'unknown'}`;
      } else if (rule.condition_type === 'missing_fields') {
        summary = `${rule.name}: Missing required fields - ${context.queue_reason || ''}`;
      } else {
        continue;
      }
      const channels = parseJsonArray(rule.channels);
      const recipients = parseJsonArray(rule.recipients);
      await db.entities.NotificationEvent.create({
        rule_id: rule.id, triggered_at: new Date().toISOString(),
        summary, channel: channels.join(',') || 'email', delivered: false,
      }).catch(() => {});
      if (channels.includes('email') && recipients.length > 0) {
        try {
          await db.integrations.Core.SendEmail({
            to: recipients[0],
            subject: `Legenex Alert: ${rule.name}`,
            body: `${summary}\n\nLead ID: ${lead.id}\nSupplier: ${supplierAttribution}`,
          });
        } catch {}
      }
    }
  } catch {}
}

// ── Response Mapping ──────────────────────────────────────────────────────

function getPathValue(obj, path) {
  if (!path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function applyOperator(actual, operator, expected) {
  let act = actual == null ? '' : actual;
  if (typeof act === 'object') act = JSON.stringify(act);
  else act = String(act);
  const exp = expected || '';
  switch (operator) {
    case 'equals': return act === exp;
    case 'not_equals': return act !== exp;
    case 'contains': return act.includes(exp);
    case 'not_contains': return !act.includes(exp);
    case 'starts_with': return act.startsWith(exp);
    case 'ends_with': return act.endsWith(exp);
    case 'is_empty': return act === '';
    case 'is_not_empty': return act !== '';
    default: return act.includes(exp);
  }
}

async function resolveResponseMapping(db, lbResult, fallbackResponse, fallbackStatus) {
  try {
    const mappings = await db.entities.ResponseMapping.list('sort_order', 50);
    if (mappings.length === 0) return { response: fallbackResponse, status: fallbackStatus };
    const sorted = mappings.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const m of sorted) {
      if (m.is_fallback) continue;
      const actual = getPathValue(lbResult, m.field_path || 'records[0].status');
      if (applyOperator(actual, m.operator || 'contains', m.lb_status)) {
        return { response: { Response: m.response_label }, status: m.final_status };
      }
    }
    const fb = sorted.find(m => m.is_fallback);
    if (fb) return { response: { Response: fb.response_label }, status: fb.final_status };
    return { response: fallbackResponse, status: fallbackStatus };
  } catch {
    return { response: fallbackResponse, status: fallbackStatus };
  }
}

// ── TrustedForm validation ────────────────────────────────────────────────

const TRUSTEDFORM_RE = /^https?:\/\/cert\.trustedform\.com\/[0-9a-fA-F]{40}(\?.*)?$/;

function isValidTrustedForm(url) {
  if (!url || typeof url !== 'string') return false;
  return TRUSTEDFORM_RE.test(url.trim());
}

// Check required custom fields against the lead payload.
function checkRequiredFields(customFields, leadData) {
  const missing = [];
  for (const f of customFields) {
    if (!f.required) continue;
    const val = leadData[f.field_name];
    if (val === undefined || val === null || String(val).trim() === '') {
      missing.push(f.field_name);
    }
  }
  return missing;
}

// Patterns that indicate a LeadByte rejection is due to missing/invalid fields
const QUEUE_REJECTION_PATTERNS = ['missing', 'required', 'invalid', 'not provided'];

function isQueueableRejection(reasonText) {
  const lower = String(reasonText || '').toLowerCase();
  return QUEUE_REJECTION_PATTERNS.some(p => lower.includes(p));
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;
  const method = req.method;

  if (method === 'GET') return Response.json({ status: 'ok' }, { status: 200 });
  if (method !== 'POST') return Response.json({ Response: 'Error', message: 'Method not allowed' }, { status: 405 });

  const startTime = Date.now();
  let leadId = null;

  try {
    const body = await req.json();
    const payload = body.payload || body;

    let supplierKeyRaw =
      req.headers.get('X-API-KEY') ||
      req.headers.get('X_KEY') ||
      req.headers.get('x-api-key') ||
      req.headers.get('x_key') ||
      payload['X-API-KEY'] ||
      payload['X_KEY'] ||
      payload._supplier_key ||
      null;
    if (!supplierKeyRaw) {
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader.startsWith('Basic ')) {
        const decoded = atob(authHeader.slice(6));
        supplierKeyRaw = decoded.split(':')[0] || null;
      }
    }

    const leadPayload = { ...payload };
    delete leadPayload['X-API-KEY'];
    delete leadPayload._supplier_key;
    delete leadPayload.phone_verified;

    // ── a. AUTH ──────────────────────────────────────────────────────────
    let apiKeyRecord = null;
    if (supplierKeyRaw) {
      const keys = await db.entities.ApiKey.filter({ key: supplierKeyRaw });
      if (keys.length > 0 && keys[0].active) apiKeyRecord = keys[0];
    }
    if (!apiKeyRecord) {
      await db.entities.ErrorLog.create({
        stage: 'auth', severity: 'error',
        message: 'Invalid or missing API key',
        detail: JSON.stringify({ key_provided: supplierKeyRaw ? 'yes' : 'no' }),
        supplier_name: 'Unknown',
      });
      return Response.json({ Response: 'Error', message: 'Invalid or missing API key' }, { status: 401 });
    }

    const supplierAttribution = apiKeyRecord.type === 'master'
      ? 'Master' : (apiKeyRecord.supplier_name || 'Unknown');

    await db.entities.ApiKey.update(apiKeyRecord.id, {
      last_used_at: new Date().toISOString(),
      request_count: (apiKeyRecord.request_count || 0) + 1,
    });

    // ── a. CREATE LEAD ────────────────────────────────────────────────────
    const now = new Date();
    const appSettingsArr = await db.entities.AppSettings.list();
    const appSettings = appSettingsArr[0] || {};
    const tsFmt = appSettings.timestamp_format || 'MM/DD/YYYY HH:MM:SS';
    leadPayload.timestamp = formatTimestamp(now, tsFmt);

    const lead = await db.entities.Lead.create({
      supplier_name: supplierAttribution,
      supplier_key_id: apiKeyRecord.id,
      raw_payload: JSON.stringify(leadPayload),
      final_status: 'Processing',
    });
    leadId = lead.id;

    // Load all config in parallel
    const [hlrSettingsArr, connectors, calcs, customFields, apiConnectors, responseMappings] = await Promise.all([
      db.entities.HlrSettings.list(),
      db.entities.LeadByteConnector.filter({ enabled: true, is_default: true }),
      db.entities.CustomCalculation.list(),
      db.entities.CustomField.list(),
      db.entities.ApiConnector.filter({ enabled: true }),
      db.entities.ResponseMapping.list('sort_order', 50),
    ]);
    const hlrSettings = hlrSettingsArr[0] || null;
    const leadByteConnector = connectors[0] || null;

    // Look up supplier record for type-based filtering
    let supplierRecord = null;
    if (apiKeyRecord.supplier_id) {
      const ss = await db.entities.Supplier.filter({ id: apiKeyRecord.supplier_id });
      if (ss.length > 0) supplierRecord = ss[0];
    } else if (supplierAttribution !== 'Master') {
      const ss = await db.entities.Supplier.filter({ name: supplierAttribution });
      if (ss.length > 0) supplierRecord = ss[0];
    }

    // ── Normalize field aliases ──────────────────────────────────────────
    const mobile = leadPayload.mobile || leadPayload.phone1 || leadPayload.phone || leadPayload.phone_number || '';
    const firstName = leadPayload.first_name || leadPayload.firstname || '';
    const lastName = leadPayload.last_name || leadPayload.lastname || '';
    const email = leadPayload.email || '';

    if (!leadPayload.first_name && firstName) leadPayload.first_name = firstName;
    if (!leadPayload.last_name && lastName) leadPayload.last_name = lastName;
    if (!leadPayload.mobile && mobile) leadPayload.mobile = mobile;
    if (!leadPayload.ip_address && leadPayload.ipaddress) leadPayload.ip_address = leadPayload.ipaddress;
    if (!leadPayload.optin_url && leadPayload.optinurl) leadPayload.optin_url = leadPayload.optinurl;
    if (!leadPayload.trustedform_url && leadPayload.trustedform_cert) leadPayload.trustedform_url = leadPayload.trustedform_cert;
    if (!leadPayload.jornaya_token && leadPayload.jornaya_leadid) leadPayload.jornaya_token = leadPayload.jornaya_leadid;
    if (!leadPayload.supplier_brand && leadPayload.brand) leadPayload.supplier_brand = leadPayload.brand;
    if (!leadPayload.ad_label && leadPayload.utm_ad_label) leadPayload.ad_label = leadPayload.utm_ad_label;

    await db.entities.Lead.update(leadId, {
      mapped_fields: JSON.stringify(leadPayload),
      first_name: firstName, last_name: lastName, mobile: mobile, email: email,
    });

    // ── ADAPTIVE FIELDS: auto-create new inbound fields ────────────────
    if (appSettings.adaptive_fields_enabled !== false) {
      const DEFAULT_IGNORE = ['key', 'api_key', 'apikey', 'x_key', 'x-api-key', 'authorization', 'auth', 'bearer', 'token', 'secret', 'password', 'sig', 'signature'];
      const ignoreList = parseJsonArray(appSettings.adaptive_fields_ignore_list);
      const effectiveIgnore = ignoreList.length > 0 ? ignoreList : DEFAULT_IGNORE;
      const ignoreSet = new Set(effectiveIgnore.map(s => String(s).trim().toLowerCase()));
      const existingFieldNames = new Set(customFields.map(f => f.field_name.toLowerCase()));

      const newFields = [];
      for (const [rawKey, rawValue] of Object.entries(leadPayload)) {
        const normKey = String(rawKey).trim().toLowerCase();
        if (ignoreSet.has(normKey)) continue;
        if (existingFieldNames.has(normKey)) continue;

        let fieldType = 'string';
        if (typeof rawValue === 'boolean') fieldType = 'boolean';
        else if (typeof rawValue === 'number') fieldType = 'number';
        else if (typeof rawValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawValue)) fieldType = 'date';

        const sampleValue = String(rawValue ?? '').slice(0, 200);
        const humanLabel = normKey.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        newFields.push({
          field_name: rawKey,
          label: humanLabel,
          field_type: fieldType,
          source: 'inbound',
          sample_value: sampleValue,
          auto_created: true,
          include_in_leadbyte: true,
          leadbyte_field_name: rawKey,
          sort_order: customFields.length + newFields.length,
        });
        existingFieldNames.add(normKey);
      }

      if (newFields.length > 0) {
        try {
          await db.entities.CustomField.bulkCreate(newFields);

          // Template mode: append new fields to payload_template
          if (leadByteConnector && leadByteConnector.forwarding_mode === 'template' && leadByteConnector.payload_template) {
            try {
              const parsed = JSON.parse(leadByteConnector.payload_template);
              let modified = false;
              for (const nf of newFields) {
                if (!(nf.field_name in parsed)) {
                  parsed[nf.field_name] = '{{' + nf.field_name + '}}';
                  modified = true;
                }
              }
              if (modified) {
                const newTemplate = JSON.stringify(parsed, null, 2);
                await db.entities.LeadByteConnector.update(leadByteConnector.id, { payload_template: newTemplate });
                leadByteConnector.payload_template = newTemplate;
              }
            } catch {}
          }
        } catch {}
      }
    }

    // ── b. FIRE ON RECEIVED (fire-and-forget) ────────────────────────────
    const capiEventNameMap = { on_received: 'Lead', on_sold: 'SubmittedApplication', on_unsold: 'Lead', on_dq: 'Lead', on_queued: 'Lead' };
    // Override with connector-specific event names for CAPI
    const onReceivedConnectors = apiConnectors.filter(c => {
      const t = parseJsonArray(c.triggers);
      return t.includes('on_received');
    });
    for (const conn of onReceivedConnectors) {
      if (!connectorMatchesFilters(conn, leadPayload, supplierAttribution, supplierRecord)) continue;
      if (conn.kind === 'facebook_capi') {
        const eventName = conn.lead_event_name || 'Lead';
        sendCapiEvent(conn, leadPayload, leadId, eventName)
          .then(async (result) => {
            await appendCapiLog(db, leadId, result);
            if (!result.success) {
              await db.entities.ErrorLog.create({
                lead_id: leadId, stage: 'leadbyte', severity: 'warning',
                message: `CAPI on_received failure: ${conn.name} (${eventName})`,
                detail: JSON.stringify(result), supplier_name: supplierAttribution,
              }).catch(() => {});
              await evaluateNotifications(db, ['capi_failure', 'api_error'], { id: leadId }, supplierAttribution,
                { message: `CAPI on_received failure: ${conn.name} - ${result.error || result.http_status}` }).catch(() => {});
            }
          })
          .catch(async (err) => {
            await appendCapiLog(db, leadId, { connector: conn.name, event_name: conn.lead_event_name || 'Lead', pixel: conn.fb_pixel_id, http_status: null, fbtrace_id: '', success: false, error: err.message });
            await db.entities.ErrorLog.create({
              lead_id: leadId, stage: 'leadbyte', severity: 'warning',
              message: `CAPI on_received error: ${conn.name}`,
              detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution,
            }).catch(() => {});
          });
      } else {
        sendHttpEvent(conn, leadPayload, leadId)
          .then(async (result) => {
            if (!result.success) {
              await db.entities.ErrorLog.create({
                lead_id: leadId, stage: 'leadbyte', severity: 'warning',
                message: `API on_received error: ${conn.name}`,
                detail: JSON.stringify(result), supplier_name: supplierAttribution,
              }).catch(() => {});
              await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution,
                { message: `API on_received error: ${conn.name} - ${result.error || result.http_status}` }).catch(() => {});
            }
          })
          .catch(async (err) => {
            await db.entities.ErrorLog.create({
              lead_id: leadId, stage: 'leadbyte', severity: 'warning',
              message: `API on_received error: ${conn.name}`,
              detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution,
            }).catch(() => {});
          });
      }
    }

    // ── c. HLR LOOKUP ────────────────────────────────────────────────────
    let hlrResult = null;
    let hlrRequestBody = {};

    if (hlrSettings && hlrSettings.enabled) {
      const reqFieldMap = typeof hlrSettings.request_field_map === 'string'
        ? JSON.parse(hlrSettings.request_field_map || '{}')
        : (hlrSettings.request_field_map || {});
      const mobileField = reqFieldMap.mobile || 'phone';
      const firstField = reqFieldMap.first_name || 'firstname';
      const lastField = reqFieldMap.last_name || 'lastname';

      hlrRequestBody = {
        mobile: leadPayload[mobileField] || mobile,
        first_name: leadPayload[firstField] || firstName,
        last_name: leadPayload[lastField] || lastName,
      };
      const failMode = hlrSettings.fail_mode || 'fail_open';
      const timeoutMs = hlrSettings.timeout_ms || 8000;

      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);
        const hlrResp = await fetch(hlrSettings.endpoint_url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hlrRequestBody), signal: controller.signal,
        });
        clearTimeout(tid);
        if (!hlrResp.ok) throw new Error(`HLR returned HTTP ${hlrResp.status}`);
        hlrResult = await hlrResp.json();
        await db.entities.Lead.update(leadId, {
          hlr_request: JSON.stringify(hlrRequestBody),
          hlr_response: JSON.stringify(hlrResult),
          hlr_status: hlrResult.lh_hlr_response || '',
          hlr_summary_score: hlrResult.summary_score ?? null,
        });
      } catch (err) {
        const hlrError = err.message || 'HLR lookup failed';
        await db.entities.Lead.update(leadId, {
          hlr_error: hlrError, hlr_request: JSON.stringify(hlrRequestBody),
        });
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'hlr', severity: 'error',
          message: hlrError, detail: JSON.stringify({ fail_mode: failMode }),
          supplier_name: supplierAttribution,
        });
        if (failMode === 'fail_closed') {
          await db.entities.Lead.update(leadId, {
            final_status: 'Error', error_stage: 'hlr',
            processed_at: new Date().toISOString(),
            process_time_ms: Date.now() - startTime,
            response_returned: JSON.stringify({ Response: 'Error', message: 'HLR lookup failed' }),
          });
          return Response.json({ Response: 'Error', message: 'HLR lookup failed' }, { status: 200 });
        }
      }
    }

    // ── Run custom calculations ──────────────────────────────────────────
    const phoneVerifiedSource = hlrSettings?.phone_verified_source || 'lh_hlr_response';
    const enrichedData = runCalculations(calcs, leadPayload, hlrResult, phoneVerifiedSource);
    if (hlrResult) {
      enrichedData.hlr_status = hlrResult.lh_hlr_response || '';
      enrichedData.hlr_score = hlrResult.summary_score != null ? String(hlrResult.summary_score) : '';
      enrichedData.country_code = hlrResult.country_code || '';
    }

    // ── d. GATE: TrustedForm + required fields ───────────────────────────
    const trustedformUrl = leadPayload.trustedform_url || leadPayload.trustedform_cert || '';
    const tfValid = isValidTrustedForm(trustedformUrl);
    const missingFields = checkRequiredFields(customFields, leadPayload);

    if (!tfValid || missingFields.length > 0) {
      const reasons = [];
      if (!tfValid) reasons.push('Invalid or missing TrustedForm certificate');
      if (missingFields.length > 0) reasons.push(`Missing required fields: ${missingFields.join(', ')}`);
      const queueReason = reasons.join('; ');

      // Fire on_queued connectors (fire-and-forget)
      fireConnectors(db, apiConnectors, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord, capiEventNameMap);

      // Evaluate notification rules
      await evaluateNotifications(db, ['lead_queued', 'missing_fields'], { id: leadId, queue_reason: queueReason }, supplierAttribution, { queue_reason: queueReason });

      const queueResponse = { Response: 'Unsold' };
      await db.entities.Lead.update(leadId, {
        final_status: 'Queued',
        queue_reason: queueReason,
        trustedform_valid: tfValid,
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(queueResponse),
      });
      return Response.json(queueResponse, { status: 200 });
    }

    await db.entities.Lead.update(leadId, { trustedform_valid: true });

    // ── e. FORWARD TO LEADBYTE ───────────────────────────────────────────
    if (!leadByteConnector) {
      await db.entities.Lead.update(leadId, {
        final_status: 'Error', error_stage: 'leadbyte',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify({ Response: 'Error', message: 'No active LeadByte connector configured' }),
      });
      await db.entities.ErrorLog.create({
        lead_id: leadId, stage: 'leadbyte', severity: 'critical',
        message: 'No active LeadByte connector configured',
        supplier_name: supplierAttribution,
      });
      return Response.json({ Response: 'Error', message: 'No active LeadByte connector configured' }, { status: 200 });
    }

    const leadBytePayload = buildPayloadFromTemplate(leadByteConnector.payload_template, enrichedData);
    await db.entities.Lead.update(leadId, { leadbyte_request: JSON.stringify(leadBytePayload) });

    const headerRowsParsed = parseJsonArray(leadByteConnector.headers);
    const lbHeaders = {};
    if (Array.isArray(headerRowsParsed)) {
      headerRowsParsed.forEach(row => { if (row.key) lbHeaders[row.key] = row.value; });
    } else {
      Object.assign(lbHeaders, headerRowsParsed);
    }
    const contentType = leadByteConnector.content_type || 'application/json';
    lbHeaders['Content-Type'] = contentType;

    let lbBodyStr;
    if (contentType === 'application/x-www-form-urlencoded') {
      lbBodyStr = new URLSearchParams(typeof leadBytePayload === 'object' ? leadBytePayload : {}).toString();
    } else {
      lbBodyStr = typeof leadBytePayload === 'string' ? leadBytePayload : JSON.stringify(leadBytePayload);
    }

    const lbResp = await fetch(leadByteConnector.target_url, {
      method: leadByteConnector.http_method || 'POST',
      headers: lbHeaders, body: lbBodyStr,
    });
    const lbText = await lbResp.text();
    let lbResult;
    try { lbResult = JSON.parse(lbText); } catch { lbResult = { raw: lbText }; }
    await db.entities.Lead.update(leadId, { leadbyte_response: JSON.stringify(lbResult) });

    // ── f. PARSE LEADBYTE RESPONSE ──────────────────────────────────────
    let finalStatus = 'Error';
    let supplierResponse = { Response: 'Error', message: 'Unexpected LeadByte response' };

    if (lbResult.status === 'Success' && lbResult.records && lbResult.records.length > 0) {
      const record = lbResult.records[0];
      const recordStatus = record.status;
      const recordResponse = record.response || {};
      await db.entities.Lead.update(leadId, {
        leadbyte_queue_id: record.queueId || '',
        leadbyte_record_status: recordStatus || '',
        leadbyte_lead_id: recordResponse.leadId || null,
        leadbyte_rejection_id: recordResponse.rejectionId ? String(recordResponse.rejectionId) : '',
        leadbyte_process_time: recordResponse.processTime || null,
      });

      if (recordStatus === 'Approved') {
        // ── f. Approved => Sold + FIRE ON SOLD ──────────────────────────
        finalStatus = 'Sold';
        supplierResponse = { Response: 'Sold' };

        // Fire on_sold connectors (fire-and-forget)
        const onSoldConnectors = apiConnectors.filter(c => parseJsonArray(c.triggers).includes('on_sold'));
        for (const conn of onSoldConnectors) {
          if (!connectorMatchesFilters(conn, leadPayload, supplierAttribution, supplierRecord)) continue;
          if (conn.kind === 'facebook_capi') {
            const eventName = conn.sold_event_name || 'SubmittedApplication';
            sendCapiEvent(conn, leadPayload, leadId, eventName)
              .then(async (result) => {
                await appendCapiLog(db, leadId, result);
                if (!result.success) {
                  await db.entities.ErrorLog.create({
                    lead_id: leadId, stage: 'leadbyte', severity: 'warning',
                    message: `CAPI on_sold failure: ${conn.name} (${eventName})`,
                    detail: JSON.stringify(result), supplier_name: supplierAttribution,
                  }).catch(() => {});
                  await evaluateNotifications(db, ['capi_failure', 'api_error'], { id: leadId }, supplierAttribution,
                    { message: `CAPI on_sold failure: ${conn.name} - ${result.error || result.http_status}` }).catch(() => {});
                }
              })
              .catch(async (err) => {
                await db.entities.ErrorLog.create({
                  lead_id: leadId, stage: 'leadbyte', severity: 'warning',
                  message: `CAPI on_sold error: ${conn.name}`,
                  detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution,
                }).catch(() => {});
              });
          } else {
            sendHttpEvent(conn, leadPayload, leadId)
              .then(async (result) => {
                if (!result.success) {
                  await db.entities.ErrorLog.create({
                    lead_id: leadId, stage: 'leadbyte', severity: 'warning',
                    message: `API on_sold error: ${conn.name}`,
                    detail: JSON.stringify(result), supplier_name: supplierAttribution,
                  }).catch(() => {});
                }
              })
              .catch(async (err) => {
                await db.entities.ErrorLog.create({
                  lead_id: leadId, stage: 'leadbyte', severity: 'warning',
                  message: `API on_sold error: ${conn.name}`,
                  detail: JSON.stringify({ error: err.message }), supplier_name: supplierAttribution,
                }).catch(() => {});
              });
          }
        }
      } else if (recordStatus === 'Rejected') {
        // ── f. Rejected => check for queueable patterns ─────────────────
        const rejectionReason = recordResponse.message || recordResponse.reason || recordResponse.error || record.error || record.response_message || '';
        if (isQueueableRejection(rejectionReason)) {
          finalStatus = 'Queued';
          const queueReason = `LeadByte rejection (possible missing/invalid field): ${rejectionReason}`;
          await db.entities.Lead.update(leadId, { queue_reason: queueReason });
          supplierResponse = { Response: 'Unsold' };
          // Fire on_queued connectors + evaluate rules
          fireConnectors(db, apiConnectors, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord, capiEventNameMap);
          await evaluateNotifications(db, ['lead_queued', 'missing_fields'], { id: leadId, queue_reason: queueReason }, supplierAttribution, { queue_reason: queueReason });
        } else {
          finalStatus = 'Unsold';
          supplierResponse = { Response: 'Unsold' };
          // Fire on_unsold + on_dq connectors
          fireConnectors(db, apiConnectors, 'on_unsold', leadPayload, leadId, supplierAttribution, supplierRecord, capiEventNameMap);
          fireConnectors(db, apiConnectors, 'on_dq', leadPayload, leadId, supplierAttribution, supplierRecord, capiEventNameMap);
        }
      } else {
        finalStatus = 'Error';
        supplierResponse = { Response: 'Error', message: `LeadByte record status: ${recordStatus}` };
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'leadbyte', severity: 'error',
          message: `Unexpected LeadByte record status: ${recordStatus}`,
          detail: JSON.stringify(lbResult), supplier_name: supplierAttribution,
        });
        await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution,
          { message: `Unexpected LeadByte status: ${recordStatus}` }).catch(() => {});
      }
    } else {
      // ── f. Top-level non-success: handle errors[] shape ──────────────
      const topStatus = lbResult.status || '';
      const errors = lbResult.errors || [];
      const firstError = errors.length > 0 ? String(errors[0]?.message || errors[0]?.error || errors[0] || '') : '';
      const lowerErr = firstError.toLowerCase();

      if (/duplicate/i.test(firstError)) {
        finalStatus = 'Duplicate';
        supplierResponse = { Response: 'Duplicate' };
        await db.entities.Lead.update(leadId, { queue_reason: `Duplicate: ${firstError}` });
      } else if (isQueueableRejection(firstError)) {
        finalStatus = 'Queued';
        const queueReason = `LeadByte error (missing/invalid field): ${firstError || topStatus}`;
        await db.entities.Lead.update(leadId, { queue_reason: queueReason });
        supplierResponse = { Response: 'Unsold' };
        fireConnectors(db, apiConnectors, 'on_queued', leadPayload, leadId, supplierAttribution, supplierRecord, capiEventNameMap);
        await evaluateNotifications(db, ['lead_queued', 'missing_fields'], { id: leadId, queue_reason: queueReason }, supplierAttribution, { queue_reason: queueReason });
      } else {
        finalStatus = 'Error';
        supplierResponse = { Response: 'Error', message: firstError || lbResult.message || 'LeadByte returned non-success' };
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'leadbyte', severity: 'error',
          message: firstError || lbResult.message || 'LeadByte returned non-success',
          detail: JSON.stringify(lbResult), supplier_name: supplierAttribution,
        });
        await evaluateNotifications(db, ['api_error'], { id: leadId }, supplierAttribution,
          { message: firstError || lbResult.message || 'LeadByte returned non-success' }).catch(() => {});
      }
    }

    // ── g. RESOLVE SUPPLIER RESPONSE VIA RESPONSEMAPPING ─────────────────
    if (finalStatus !== 'Queued' && finalStatus !== 'Duplicate') {
      const mapped = await resolveResponseMapping(db, lbResult, supplierResponse, finalStatus);
      supplierResponse = mapped.response;
      if (mapped.status && mapped.status !== finalStatus && finalStatus === 'Error') {
        finalStatus = mapped.status;
      }
    }

    // ── FINALIZE ─────────────────────────────────────────────────────────
    await db.entities.Lead.update(leadId, {
      final_status: finalStatus,
      processed_at: new Date().toISOString(),
      process_time_ms: Date.now() - startTime,
      response_returned: JSON.stringify(supplierResponse),
    });

    // Fire outbound webhooks async (non-blocking)
    try {
      const webhooks = await db.entities.Webhook.filter({ enabled: true });
      const eventName = `lead.${finalStatus.toLowerCase()}`;
      webhooks.forEach(wh => {
        const events = parseJsonArray(wh.events);
        if (events.includes(eventName)) {
          const whHeaders = typeof wh.headers === 'string' ? JSON.parse(wh.headers || '{}') : (wh.headers || {});
          whHeaders['Content-Type'] = 'application/json';
          fetch(wh.url, {
            method: 'POST', headers: whHeaders,
            body: JSON.stringify({ event: eventName, lead_id: leadId, status: finalStatus, supplier: supplierAttribution }),
          }).catch(() => {});
        }
      });
    } catch {}

    return Response.json(supplierResponse, { status: 200 });

  } catch (err) {
    console.error('processLead uncaught error:', err);
    if (leadId) {
      try {
        await db.entities.Lead.update(leadId, {
          final_status: 'Error', error_stage: 'system',
          processed_at: new Date().toISOString(),
          process_time_ms: Date.now() - startTime,
          response_returned: JSON.stringify({ Response: 'Error', message: 'Internal processing error' }),
        });
      } catch {}
    }
    try {
      await db.entities.ErrorLog.create({
        lead_id: leadId, stage: 'system', severity: 'critical',
        message: err.message || 'Unknown error',
        detail: JSON.stringify({ stack: err.stack }),
        supplier_name: 'Unknown',
      });
    } catch {}
    return Response.json({ Response: 'Error', message: 'Internal processing error' }, { status: 200 });
  }
});