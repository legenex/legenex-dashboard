import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const url = new URL(req.url);
  const method = req.method;

  // ── Health endpoint ──
  if (method === 'GET') {
    return Response.json({ status: 'ok' }, { status: 200 });
  }

  if (method !== 'POST') {
    return Response.json({ Response: 'Error', message: 'Method not allowed' }, { status: 405 });
  }

  const startTime = Date.now();
  let leadId = null;

  try {
    const body = await req.json();
    const payload = body.payload || body;
    const supplierKeyRaw = payload._supplier_key || null;
    const leadPayload = { ...payload };
    delete leadPayload._supplier_key;

    // ════════════════════════════════════════════════
    // BASE44 DATA LAYER: Load settings & config
    // ════════════════════════════════════════════════
    
    // 1. AUTH — Resolve supplier key
    let apiKeyRecord = null;
    if (supplierKeyRaw) {
      const keys = await base44.asServiceRole.entities.ApiKey.filter({ key: supplierKeyRaw });
      if (keys.length > 0 && keys[0].active) {
        apiKeyRecord = keys[0];
      }
    }

    if (!apiKeyRecord) {
      // Write auth error log
      await base44.asServiceRole.entities.ErrorLog.create({
        stage: 'auth',
        severity: 'error',
        message: 'Invalid or missing API key',
        detail: JSON.stringify({ key_provided: supplierKeyRaw ? 'yes' : 'no' }),
        supplier_name: 'Unknown'
      });
      return Response.json({ Response: 'Error', message: 'Invalid or missing API key' }, { status: 401 });
    }

    // Update key usage
    await base44.asServiceRole.entities.ApiKey.update(apiKeyRecord.id, {
      last_used_at: new Date().toISOString(),
      request_count: (apiKeyRecord.request_count || 0) + 1
    });

    // 2. CREATE LEAD ROW immediately
    const lead = await base44.asServiceRole.entities.Lead.create({
      supplier_name: apiKeyRecord.supplier_name,
      supplier_key_id: apiKeyRecord.id,
      raw_payload: JSON.stringify(leadPayload),
      final_status: 'Processing'
    });
    leadId = lead.id;

    // Load config from entities
    const hlrSettingsArr = await base44.asServiceRole.entities.HlrSettings.list();
    const hlrSettings = hlrSettingsArr[0] || null;

    const connectors = await base44.asServiceRole.entities.LeadByteConnector.filter({ enabled: true, is_default: true });
    const leadByteConnector = connectors[0] || null;

    const customFields = await base44.asServiceRole.entities.CustomField.list();

    // ════════════════════════════════════════════════
    // PURE PIPELINE: Copy-pasteable into Express
    // ════════════════════════════════════════════════

    // 3. MAP FIELDS
    const fieldMap = {};
    customFields.forEach(f => { fieldMap[f.field_name] = f; });

    const mapped = {};
    for (const [key, val] of Object.entries(leadPayload)) {
      mapped[key] = val;
    }

    // Extract core fields with defaults
    const mobile = mapped.mobile || mapped.phone || mapped.phone_number || '';
    const firstName = mapped.first_name || '';
    const lastName = mapped.last_name || '';
    const email = mapped.email || '';

    // Update lead with mapped data
    await base44.asServiceRole.entities.Lead.update(leadId, {
      mapped_fields: JSON.stringify(mapped),
      first_name: firstName,
      last_name: lastName,
      mobile: mobile,
      email: email
    });

    // 4. HLR LOOKUP (synchronous, inline)
    let hlrResult = null;
    let hlrError = null;
    let hlrPassthroughData = {};

    if (hlrSettings && hlrSettings.enabled) {
      const reqFieldMap = typeof hlrSettings.request_field_map === 'string' 
        ? JSON.parse(hlrSettings.request_field_map) 
        : (hlrSettings.request_field_map || {});

      const hlrRequestBody = {
        [reqFieldMap.mobile || 'mobile']: mobile,
        [reqFieldMap.first_name || 'first_name']: firstName,
        [reqFieldMap.last_name || 'last_name']: lastName
      };

      const passthroughFields = typeof hlrSettings.passthrough_fields === 'string'
        ? JSON.parse(hlrSettings.passthrough_fields)
        : (hlrSettings.passthrough_fields || []);

      const failMode = hlrSettings.fail_mode || 'fail_open';
      const timeoutMs = hlrSettings.timeout_ms || 8000;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const hlrResp = await fetch(hlrSettings.endpoint_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hlrRequestBody),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!hlrResp.ok) {
          throw new Error(`HLR returned HTTP ${hlrResp.status}`);
        }

        hlrResult = await hlrResp.json();

        // Extract passthrough data
        passthroughFields.forEach(field => {
          if (hlrResult[field] !== undefined) {
            hlrPassthroughData[field] = hlrResult[field];
          }
        });

        // Update lead with HLR data
        await base44.asServiceRole.entities.Lead.update(leadId, {
          hlr_request: JSON.stringify(hlrRequestBody),
          hlr_response: JSON.stringify(hlrResult),
          hlr_status: hlrResult.lh_hlr_response || '',
          hlr_summary_score: hlrResult.summary_score ?? null
        });

      } catch (err) {
        hlrError = err.message || 'HLR lookup failed';
        console.error('HLR Error:', hlrError);

        if (failMode === 'fail_closed') {
          // Stop processing
          await base44.asServiceRole.entities.Lead.update(leadId, {
            final_status: 'Error',
            error_stage: 'hlr',
            hlr_error: hlrError,
            hlr_request: JSON.stringify(hlrRequestBody || {}),
            processed_at: new Date().toISOString(),
            process_time_ms: Date.now() - startTime,
            response_returned: JSON.stringify({ Response: 'Error', message: 'HLR lookup failed' })
          });
          await base44.asServiceRole.entities.ErrorLog.create({
            lead_id: leadId,
            stage: 'hlr',
            severity: 'error',
            message: hlrError,
            detail: JSON.stringify({ fail_mode: 'fail_closed' }),
            supplier_name: apiKeyRecord.supplier_name
          });
          return Response.json({ Response: 'Error', message: 'HLR lookup failed' }, { status: 200 });
        }

        if (failMode === 'forward_blank') {
          passthroughFields.forEach(field => {
            hlrPassthroughData[field] = '';
          });
        }
        // fail_open: continue without HLR fields

        await base44.asServiceRole.entities.Lead.update(leadId, {
          hlr_error: hlrError,
          hlr_request: JSON.stringify(hlrRequestBody || {})
        });
      }
    }

    // 5. BUILD LEADBYTE PAYLOAD
    if (!leadByteConnector) {
      await base44.asServiceRole.entities.Lead.update(leadId, {
        final_status: 'Error',
        error_stage: 'leadbyte',
        processed_at: new Date().toISOString(),
        process_time_ms: Date.now() - startTime,
        response_returned: JSON.stringify({ Response: 'Error', message: 'No active LeadByte connector configured' })
      });
      await base44.asServiceRole.entities.ErrorLog.create({
        lead_id: leadId,
        stage: 'leadbyte',
        severity: 'critical',
        message: 'No active LeadByte connector configured',
        supplier_name: apiKeyRecord.supplier_name
      });
      return Response.json({ Response: 'Error', message: 'No active LeadByte connector configured' }, { status: 200 });
    }

    const leadBytePayload = {};

    // Add custom fields marked for LeadByte
    customFields.forEach(cf => {
      if (cf.include_in_leadbyte && cf.leadbyte_field_name) {
        const val = mapped[cf.field_name];
        if (val !== undefined) {
          leadBytePayload[cf.leadbyte_field_name] = val;
        }
      }
    });

    // If no custom fields are configured, send all mapped fields
    if (Object.keys(leadBytePayload).length === 0) {
      Object.assign(leadBytePayload, mapped);
    }

    // Append HLR passthrough fields
    Object.assign(leadBytePayload, hlrPassthroughData);

    // Store assembled payload
    await base44.asServiceRole.entities.Lead.update(leadId, {
      leadbyte_request: JSON.stringify(leadBytePayload)
    });

    // 6. FORWARD TO LEADBYTE
    const lbHeaders = typeof leadByteConnector.headers === 'string'
      ? JSON.parse(leadByteConnector.headers)
      : (leadByteConnector.headers || {});

    const lbResp = await fetch(leadByteConnector.target_url, {
      method: 'POST',
      headers: lbHeaders,
      body: JSON.stringify(leadBytePayload)
    });

    const lbResponseText = await lbResp.text();
    let lbResult;
    try {
      lbResult = JSON.parse(lbResponseText);
    } catch {
      lbResult = { raw: lbResponseText };
    }

    await base44.asServiceRole.entities.Lead.update(leadId, {
      leadbyte_response: JSON.stringify(lbResult)
    });

    // 7. MAP DECISION
    let finalStatus = 'Error';
    let supplierResponse = { Response: 'Error', message: 'Unexpected LeadByte response' };

    if (lbResult.status === 'Success' && lbResult.records && lbResult.records.length > 0) {
      const record = lbResult.records[0];
      const recordStatus = record.status;
      const recordResponse = record.response || {};

      // Capture LeadByte details
      await base44.asServiceRole.entities.Lead.update(leadId, {
        leadbyte_queue_id: record.queueId || '',
        leadbyte_record_status: recordStatus || '',
        leadbyte_lead_id: recordResponse.leadId || null,
        leadbyte_rejection_id: recordResponse.rejectionId ? String(recordResponse.rejectionId) : '',
        leadbyte_process_time: recordResponse.processTime || null
      });

      if (recordStatus === 'Approved') {
        finalStatus = 'Sold';
        supplierResponse = { Response: 'Sold' };
      } else if (recordStatus === 'Rejected') {
        finalStatus = 'Unsold';
        supplierResponse = { Response: 'Unsold' };
      } else {
        finalStatus = 'Error';
        supplierResponse = { Response: 'Error', message: `LeadByte record status: ${recordStatus}` };
        await base44.asServiceRole.entities.ErrorLog.create({
          lead_id: leadId,
          stage: 'leadbyte',
          severity: 'error',
          message: `Unexpected LeadByte record status: ${recordStatus}`,
          detail: JSON.stringify(lbResult),
          supplier_name: apiKeyRecord.supplier_name
        });
      }
    } else {
      // Non-success from LeadByte
      await base44.asServiceRole.entities.ErrorLog.create({
        lead_id: leadId,
        stage: 'leadbyte',
        severity: 'error',
        message: lbResult.message || 'LeadByte returned non-success',
        detail: JSON.stringify(lbResult),
        supplier_name: apiKeyRecord.supplier_name
      });
    }

    // 8. FINALIZE
    const processTimeMs = Date.now() - startTime;
    await base44.asServiceRole.entities.Lead.update(leadId, {
      final_status: finalStatus,
      processed_at: new Date().toISOString(),
      process_time_ms: processTimeMs,
      response_returned: JSON.stringify(supplierResponse)
    });

    // Fire webhooks (async, non-blocking)
    try {
      const webhooks = await base44.asServiceRole.entities.Webhook.filter({ enabled: true });
      const eventName = `lead.${finalStatus.toLowerCase()}`;
      webhooks.forEach(wh => {
        const events = typeof wh.events === 'string' ? JSON.parse(wh.events) : (wh.events || []);
        if (events.includes(eventName)) {
          const whHeaders = typeof wh.headers === 'string' ? JSON.parse(wh.headers) : (wh.headers || {});
          whHeaders['Content-Type'] = 'application/json';
          fetch(wh.url, {
            method: 'POST',
            headers: whHeaders,
            body: JSON.stringify({ event: eventName, lead_id: leadId, status: finalStatus, supplier: apiKeyRecord.supplier_name })
          }).catch(() => {});
        }
      });
    } catch {}

    return Response.json(supplierResponse, { status: 200 });

  } catch (err) {
    console.error('processLead uncaught error:', err);

    // Ensure lead is never stuck on Processing
    if (leadId) {
      try {
        await base44.asServiceRole.entities.Lead.update(leadId, {
          final_status: 'Error',
          error_stage: 'system',
          processed_at: new Date().toISOString(),
          process_time_ms: Date.now() - startTime,
          response_returned: JSON.stringify({ Response: 'Error', message: 'Internal processing error' })
        });
      } catch {}
    }

    try {
      await base44.asServiceRole.entities.ErrorLog.create({
        lead_id: leadId,
        stage: 'system',
        severity: 'critical',
        message: err.message || 'Unknown error',
        detail: JSON.stringify({ stack: err.stack }),
        supplier_name: 'Unknown'
      });
    } catch {}

    return Response.json({ Response: 'Error', message: 'Internal processing error' }, { status: 200 });
  }
});