import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Resolve phone_verified value from HLR result based on configured source
function resolvePhoneVerified(hlrResult, source) {
  if (!hlrResult) return '';
  if (source === 'lh_hlr_response') return hlrResult.lh_hlr_response || '';
  if (source === 'summary_score') return String(hlrResult.summary_score ?? '');
  if (source === 'boolean') return hlrResult.lh_hlr_response === 'Exact Match' ? 'true' : 'false';
  return hlrResult.lh_hlr_response || '';
}

// Format a date object using a simple format string (UTC)
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

// Run custom calculations (post-HLR, pre-LeadByte).
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
          for (const b of buckets) {
            if (ageDays <= b.max_days) { matched = b.label; break; }
          }
          enriched[calc.output_token] = matched;
        } else {
          enriched[calc.output_token] = cfg.fallback || '';
        }
      } else if (calc.transform_type === 'value_map') {
        const map = cfg.map || {};
        const normalized = String(inputValue).trim().toLowerCase();
        if (map[inputValue] !== undefined) {
          enriched[calc.output_token] = map[inputValue];
        } else {
          const matchKey = Object.keys(map).find(k => k.trim().toLowerCase() === normalized);
          enriched[calc.output_token] = matchKey !== undefined ? map[matchKey] : inputValue;
        }
      } else if (calc.transform_type === 'script') {
        enriched[calc.output_token] = inputValue;
      }
    } catch {
      enriched[calc.output_token] = inputValue;
    }
  }

  return enriched;
}

// Build LeadByte payload from template with {{token}} substitution
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

Deno.serve(async (req) => {
  // createClientFromRequest gives us .asServiceRole for all DB ops — no user session needed
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY, X_KEY, Authorization',
      },
    });
  }

  if (method === 'GET') return Response.json({ status: 'ok' }, { status: 200 });
  if (method !== 'POST') return Response.json({ Response: 'Error', message: 'Method not allowed' }, { status: 405 });

  const startTime = Date.now();
  let leadId = null;
  let supplierAttribution = 'Unknown';

  try {
    const body = await req.json();
    const payload = body.payload || body;

    // Accept key from multiple header/field names
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
    delete leadPayload['X_KEY'];
    delete leadPayload._supplier_key;
    // Always compute phone_verified from HLR — ignore supplier-provided value
    delete leadPayload.phone_verified;

    // 1. AUTH — validate API key via service role
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

    supplierAttribution = apiKeyRecord.type === 'master'
      ? 'Master'
      : (apiKeyRecord.supplier_name || 'Unknown');

    // Update key usage stats (non-blocking, don't await)
    db.entities.ApiKey.update(apiKeyRecord.id, {
      last_used_at: new Date().toISOString(),
      request_count: (apiKeyRecord.request_count || 0) + 1,
    }).catch(() => {});

    // 2. INJECT TIMESTAMP
    const now = new Date();
    const appSettingsArr = await db.entities.AppSettings.list();
    const appSettings = appSettingsArr[0] || {};
    const tsFmt = appSettings.timestamp_format || 'MM/DD/YYYY HH:MM:SS';
    leadPayload.timestamp = formatTimestamp(now, tsFmt);

    // 3. CREATE LEAD IMMEDIATELY — must happen before any downstream calls
    const lead = await db.entities.Lead.create({
      supplier_name: supplierAttribution,
      supplier_key_id: apiKeyRecord.id,
      raw_payload: JSON.stringify(leadPayload),
      final_status: 'Processing',
    });
    leadId = lead.id;

    // Load config in parallel
    const [hlrSettingsArr, connectors, calcs] = await Promise.all([
      db.entities.HlrSettings.list(),
      db.entities.LeadByteConnector.filter({ enabled: true, is_default: true }),
      db.entities.CustomCalculation.list(),
    ]);
    const hlrSettings = hlrSettingsArr[0] || null;
    const leadByteConnector = connectors[0] || null;

    // 4. NORMALISE FIELD ALIASES
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
      first_name: firstName,
      last_name: lastName,
      mobile,
      email,
    });

    // 5. HLR LOOKUP
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hlrRequestBody),
          signal: controller.signal,
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
          hlr_error: hlrError,
          hlr_request: JSON.stringify(hlrRequestBody),
        });
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'hlr', severity: 'error',
          message: hlrError,
          detail: JSON.stringify({ fail_mode: failMode, stack: err.stack }),
          supplier_name: supplierAttribution,
        });
        if (failMode === 'fail_closed') {
          const resp = { Response: 'Error', message: 'HLR lookup failed' };
          await db.entities.Lead.update(leadId, {
            final_status: 'Error', error_stage: 'hlr',
            processed_at: new Date().toISOString(),
            process_time_ms: Date.now() - startTime,
            response_returned: JSON.stringify(resp),
          });
          return Response.json(resp, { status: 200 });
        }
      }
    }

    // 6. RUN CUSTOM CALCULATIONS
    const phoneVerifiedSource = hlrSettings?.phone_verified_source || 'lh_hlr_response';
    const enrichedData = runCalculations(calcs, leadPayload, hlrResult, phoneVerifiedSource);

    if (hlrResult) {
      enrichedData.hlr_status = hlrResult.lh_hlr_response || '';
      enrichedData.hlr_score = hlrResult.summary_score != null ? String(hlrResult.summary_score) : '';
      enrichedData.country_code = hlrResult.country_code || '';
    }

    // 7. CHECK LEADBYTE CONNECTOR
    if (!leadByteConnector) {
      const resp = { Response: 'Error', message: 'No active LeadByte connector configured' };
      await Promise.all([
        db.entities.Lead.update(leadId, {
          final_status: 'Error', error_stage: 'leadbyte',
          processed_at: new Date().toISOString(),
          process_time_ms: Date.now() - startTime,
          response_returned: JSON.stringify(resp),
        }),
        db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'leadbyte', severity: 'critical',
          message: 'No active LeadByte connector configured',
          supplier_name: supplierAttribution,
        }),
      ]);
      return Response.json(resp, { status: 200 });
    }

    const leadBytePayload = buildPayloadFromTemplate(leadByteConnector.payload_template, enrichedData);

    await db.entities.Lead.update(leadId, {
      leadbyte_request: JSON.stringify(leadBytePayload),
    });

    // 8. FORWARD TO LEADBYTE
    const headerRowsParsed = typeof leadByteConnector.headers === 'string'
      ? JSON.parse(leadByteConnector.headers || '[]')
      : (leadByteConnector.headers || []);

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
      lbBodyStr = new URLSearchParams(
        typeof leadBytePayload === 'object' ? leadBytePayload : {}
      ).toString();
    } else {
      lbBodyStr = typeof leadBytePayload === 'string' ? leadBytePayload : JSON.stringify(leadBytePayload);
    }

    const lbResp = await fetch(leadByteConnector.target_url, {
      method: leadByteConnector.http_method || 'POST',
      headers: lbHeaders,
      body: lbBodyStr,
    });

    const lbText = await lbResp.text();
    let lbResult;
    try { lbResult = JSON.parse(lbText); } catch { lbResult = { raw: lbText }; }

    await db.entities.Lead.update(leadId, {
      leadbyte_response: JSON.stringify(lbResult),
    });

    // 9. MAP DECISION
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
        finalStatus = 'Sold'; supplierResponse = { Response: 'Sold' };
      } else if (recordStatus === 'Rejected') {
        finalStatus = 'Unsold'; supplierResponse = { Response: 'Unsold' };
      } else {
        finalStatus = 'Error';
        supplierResponse = { Response: 'Error', message: `LeadByte record status: ${recordStatus}` };
        await db.entities.ErrorLog.create({
          lead_id: leadId, stage: 'leadbyte', severity: 'error',
          message: `Unexpected LeadByte record status: ${recordStatus}`,
          detail: JSON.stringify(lbResult), supplier_name: supplierAttribution,
        });
      }
    } else {
      await db.entities.ErrorLog.create({
        lead_id: leadId, stage: 'leadbyte', severity: 'error',
        message: lbResult.message || 'LeadByte returned non-success',
        detail: JSON.stringify(lbResult), supplier_name: supplierAttribution,
      });
    }

    // 10. FINALIZE
    await db.entities.Lead.update(leadId, {
      final_status: finalStatus,
      processed_at: new Date().toISOString(),
      process_time_ms: Date.now() - startTime,
      response_returned: JSON.stringify(supplierResponse),
    });

    // Fire outbound webhooks async (non-blocking)
    db.entities.Webhook.filter({ enabled: true }).then(webhooks => {
      const eventName = `lead.${finalStatus.toLowerCase()}`;
      webhooks.forEach(wh => {
        const events = typeof wh.events === 'string' ? JSON.parse(wh.events) : (wh.events || []);
        if (events.includes(eventName)) {
          const whHeaders = typeof wh.headers === 'string' ? JSON.parse(wh.headers) : (wh.headers || {});
          whHeaders['Content-Type'] = 'application/json';
          fetch(wh.url, {
            method: 'POST', headers: whHeaders,
            body: JSON.stringify({ event: eventName, lead_id: leadId, status: finalStatus, supplier: supplierAttribution }),
          }).catch(() => {});
        }
      });
    }).catch(() => {});

    return Response.json(supplierResponse, { status: 200 });

  } catch (err) {
    console.error('leads uncaught error:', err.message, err.stack);

    // Always persist the lead error and log — these must never fail silently
    const errResp = { Response: 'Error', message: 'Internal processing error' };
    if (leadId) {
      await db.entities.Lead.update(leadId, {
        final_status: 'Error', error_stage: 'system',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify(errResp),
      }).catch(e => console.error('Failed to update lead on error:', e.message));
    }
    await db.entities.ErrorLog.create({
      lead_id: leadId,
      stage: 'system',
      severity: 'critical',
      message: err.message || 'Unknown error',
      detail: JSON.stringify({ stack: err.stack }),
      supplier_name: supplierAttribution,
    }).catch(e => console.error('Failed to write ErrorLog:', e.message));

    return Response.json(errResp, { status: 200 });
  }
});