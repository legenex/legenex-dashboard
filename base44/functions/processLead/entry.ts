import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Resolve phone_verified value from HLR result based on configured source
function resolvePhoneVerified(hlrResult, source) {
  if (!hlrResult) return '';
  if (source === 'lh_hlr_response') return hlrResult.lh_hlr_response || '';
  if (source === 'summary_score') return String(hlrResult.summary_score ?? '');
  if (source === 'boolean') return hlrResult.lh_hlr_response === 'Exact Match' ? 'true' : 'false';
  return hlrResult.lh_hlr_response || '';
}

// Build LeadByte payload from template with {{token}} substitution
function buildPayloadFromTemplate(template, leadData, hlrData, phoneVerifiedSource) {
  if (!template) return leadData;
  let tmpl;
  try { tmpl = typeof template === 'string' ? template : JSON.stringify(template); } catch { return leadData; }

  const phoneVerified = resolvePhoneVerified(hlrData, phoneVerifiedSource);

  const result = tmpl.replace(/\{\{(\w+)\}\}/g, (_, token) => {
    if (token === 'phone_verified') return phoneVerified;
    // HLR tokens
    if (token === 'hlr_status') return (hlrData && hlrData.lh_hlr_response) ? hlrData.lh_hlr_response : '';
    if (token === 'hlr_score') return (hlrData && hlrData.summary_score != null) ? String(hlrData.summary_score) : '';
    if (token === 'country_code') return (hlrData && hlrData.country_code) ? hlrData.country_code : '';
    // Lead data tokens
    const val = leadData[token];
    return val !== undefined && val !== null ? String(val) : '';
  });

  try { return JSON.parse(result); } catch { return result; }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const method = req.method;

  if (method === 'GET') return Response.json({ status: 'ok' }, { status: 200 });
  if (method !== 'POST') return Response.json({ Response: 'Error', message: 'Method not allowed' }, { status: 405 });

  const startTime = Date.now();
  let leadId = null;

  try {
    const body = await req.json();
    const payload = body.payload || body;
    const supplierKeyRaw = payload['X-API-KEY'] || payload._supplier_key || req.headers.get('X-API-KEY') || null;
    const leadPayload = { ...payload };
    delete leadPayload['X-API-KEY'];
    delete leadPayload._supplier_key;

    // Always ignore incoming phone_verified from supplier
    delete leadPayload.phone_verified;

    // 1. AUTH
    let apiKeyRecord = null;
    if (supplierKeyRaw) {
      const keys = await base44.asServiceRole.entities.ApiKey.filter({ key: supplierKeyRaw });
      if (keys.length > 0 && keys[0].active) apiKeyRecord = keys[0];
    }

    if (!apiKeyRecord) {
      await base44.asServiceRole.entities.ErrorLog.create({
        stage: 'auth', severity: 'error',
        message: 'Invalid or missing API key',
        detail: JSON.stringify({ key_provided: supplierKeyRaw ? 'yes' : 'no' }),
        supplier_name: 'Unknown'
      });
      return Response.json({ Response: 'Error', message: 'Invalid or missing API key' }, { status: 401 });
    }

    await base44.asServiceRole.entities.ApiKey.update(apiKeyRecord.id, {
      last_used_at: new Date().toISOString(),
      request_count: (apiKeyRecord.request_count || 0) + 1
    });

    // 2. CREATE LEAD
    const lead = await base44.asServiceRole.entities.Lead.create({
      supplier_name: apiKeyRecord.supplier_name,
      supplier_key_id: apiKeyRecord.id,
      raw_payload: JSON.stringify(leadPayload),
      final_status: 'Processing'
    });
    leadId = lead.id;

    // Load config
    const hlrSettingsArr = await base44.asServiceRole.entities.HlrSettings.list();
    const hlrSettings = hlrSettingsArr[0] || null;

    const connectors = await base44.asServiceRole.entities.LeadByteConnector.filter({ enabled: true, is_default: true });
    const leadByteConnector = connectors[0] || null;

    // 3. MAP FIELDS — use Leadshook field names (firstname, lastname, phone)
    const mobile = leadPayload.phone || leadPayload.mobile || leadPayload.phone_number || '';
    const firstName = leadPayload.firstname || leadPayload.first_name || '';
    const lastName = leadPayload.lastname || leadPayload.last_name || '';
    const email = leadPayload.email || '';

    await base44.asServiceRole.entities.Lead.update(leadId, {
      mapped_fields: JSON.stringify(leadPayload),
      first_name: firstName,
      last_name: lastName,
      mobile: mobile,
      email: email
    });

    // 4. HLR LOOKUP
    let hlrResult = null;
    let hlrError = null;

    if (hlrSettings && hlrSettings.enabled) {
      const reqFieldMap = typeof hlrSettings.request_field_map === 'string'
        ? JSON.parse(hlrSettings.request_field_map || '{}')
        : (hlrSettings.request_field_map || {});

      // Map inbound Leadshook fields to HLR request fields
      // reqFieldMap keys are HLR field names, values are inbound field names
      const mobileField = reqFieldMap.mobile || 'phone';
      const firstField = reqFieldMap.first_name || 'firstname';
      const lastField = reqFieldMap.last_name || 'lastname';

      const hlrRequestBody = {
        mobile: leadPayload[mobileField] || mobile,
        first_name: leadPayload[firstField] || firstName,
        last_name: leadPayload[lastField] || lastName,
      };

      const failMode = hlrSettings.fail_mode || 'fail_open';
      const timeoutMs = hlrSettings.timeout_ms || 8000;
      const passthroughFields = typeof hlrSettings.passthrough_fields === 'string'
        ? JSON.parse(hlrSettings.passthrough_fields || '[]')
        : (hlrSettings.passthrough_fields || []);

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

        await base44.asServiceRole.entities.Lead.update(leadId, {
          hlr_request: JSON.stringify(hlrRequestBody),
          hlr_response: JSON.stringify(hlrResult),
          hlr_status: hlrResult.lh_hlr_response || '',
          hlr_summary_score: hlrResult.summary_score ?? null,
        });
      } catch (err) {
        hlrError = err.message || 'HLR lookup failed';
        await base44.asServiceRole.entities.Lead.update(leadId, {
          hlr_error: hlrError,
          hlr_request: JSON.stringify(hlrRequestBody),
        });
        await base44.asServiceRole.entities.ErrorLog.create({
          lead_id: leadId, stage: 'hlr', severity: 'error',
          message: hlrError, detail: JSON.stringify({ fail_mode: failMode }),
          supplier_name: apiKeyRecord.supplier_name,
        });
        if (failMode === 'fail_closed') {
          await base44.asServiceRole.entities.Lead.update(leadId, {
            final_status: 'Error', error_stage: 'hlr',
            processed_at: new Date().toISOString(),
            process_time_ms: Date.now() - startTime,
            response_returned: JSON.stringify({ Response: 'Error', message: 'HLR lookup failed' }),
          });
          return Response.json({ Response: 'Error', message: 'HLR lookup failed' }, { status: 200 });
        }
      }
    }

    // 5. BUILD LEADBYTE PAYLOAD using template
    if (!leadByteConnector) {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        final_status: 'Error', error_stage: 'leadbyte',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify({ Response: 'Error', message: 'No active LeadByte connector configured' }),
      });
      await base44.asServiceRole.entities.ErrorLog.create({
        lead_id: leadId, stage: 'leadbyte', severity: 'critical',
        message: 'No active LeadByte connector configured',
        supplier_name: apiKeyRecord.supplier_name,
      });
      return Response.json({ Response: 'Error', message: 'No active LeadByte connector configured' }, { status: 200 });
    }

    const phoneVerifiedSource = hlrSettings?.phone_verified_source || 'lh_hlr_response';
    const leadBytePayload = buildPayloadFromTemplate(
      leadByteConnector.payload_template,
      leadPayload,
      hlrResult,
      phoneVerifiedSource
    );

    await base44.asServiceRole.entities.Lead.update(leadId, {
      leadbyte_request: JSON.stringify(leadBytePayload),
    });

    // 6. FORWARD TO LEADBYTE
    const headerRows = typeof leadByteConnector.headers === 'string'
      ? JSON.parse(leadByteConnector.headers || '[]')
      : (leadByteConnector.headers || []);

    const lbHeaders = {};
    if (Array.isArray(headerRows)) {
      headerRows.forEach(row => { if (row.key) lbHeaders[row.key] = row.value; });
    } else {
      Object.assign(lbHeaders, headerRows);
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

    await base44.asServiceRole.entities.Lead.update(leadId, {
      leadbyte_response: JSON.stringify(lbResult),
    });

    // 7. MAP DECISION
    let finalStatus = 'Error';
    let supplierResponse = { Response: 'Error', message: 'Unexpected LeadByte response' };

    if (lbResult.status === 'Success' && lbResult.records && lbResult.records.length > 0) {
      const record = lbResult.records[0];
      const recordStatus = record.status;
      const recordResponse = record.response || {};
      await base44.asServiceRole.entities.Lead.update(leadId, {
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
        await base44.asServiceRole.entities.ErrorLog.create({
          lead_id: leadId, stage: 'leadbyte', severity: 'error',
          message: `Unexpected LeadByte record status: ${recordStatus}`,
          detail: JSON.stringify(lbResult), supplier_name: apiKeyRecord.supplier_name,
        });
      }
    } else {
      await base44.asServiceRole.entities.ErrorLog.create({
        lead_id: leadId, stage: 'leadbyte', severity: 'error',
        message: lbResult.message || 'LeadByte returned non-success',
        detail: JSON.stringify(lbResult), supplier_name: apiKeyRecord.supplier_name,
      });
    }

    // 8. FINALIZE
    await base44.asServiceRole.entities.Lead.update(leadId, {
      final_status: finalStatus,
      processed_at: new Date().toISOString(),
      process_time_ms: Date.now() - startTime,
      response_returned: JSON.stringify(supplierResponse),
    });

    // Fire outbound webhooks async (non-blocking)
    try {
      const webhooks = await base44.asServiceRole.entities.Webhook.filter({ enabled: true });
      const eventName = `lead.${finalStatus.toLowerCase()}`;
      webhooks.forEach(wh => {
        const events = typeof wh.events === 'string' ? JSON.parse(wh.events) : (wh.events || []);
        if (events.includes(eventName)) {
          const whHeaders = typeof wh.headers === 'string' ? JSON.parse(wh.headers) : (wh.headers || {});
          whHeaders['Content-Type'] = 'application/json';
          fetch(wh.url, {
            method: 'POST', headers: whHeaders,
            body: JSON.stringify({ event: eventName, lead_id: leadId, status: finalStatus, supplier: apiKeyRecord.supplier_name }),
          }).catch(() => {});
        }
      });
    } catch {}

    return Response.json(supplierResponse, { status: 200 });

  } catch (err) {
    console.error('processLead uncaught error:', err);
    if (leadId) {
      try {
        await base44.asServiceRole.entities.Lead.update(leadId, {
          final_status: 'Error', error_stage: 'system',
          processed_at: new Date().toISOString(),
          process_time_ms: Date.now() - startTime,
          response_returned: JSON.stringify({ Response: 'Error', message: 'Internal processing error' }),
        });
      } catch {}
    }
    try {
      await base44.asServiceRole.entities.ErrorLog.create({
        lead_id: leadId, stage: 'system', severity: 'critical',
        message: err.message || 'Unknown error',
        detail: JSON.stringify({ stack: err.stack }),
        supplier_name: 'Unknown',
      });
    } catch {}
    return Response.json({ Response: 'Error', message: 'Internal processing error' }, { status: 200 });
  }
});