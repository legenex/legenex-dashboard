import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Build LeadByte payload from template with {{token}} substitution
function buildPayloadFromTemplate(template, data) {
  if (!template) return data;
  let tmpl;
  try { tmpl = typeof template === 'string' ? template : JSON.stringify(template); } catch { return data; }
  const result = tmpl.replace(/\{\{([\w.]+)\}\}/g, (_, token) => {
    const val = data[token];
    return val !== undefined && val !== null ? String(val) : '';
  });
  try { return JSON.parse(result); } catch { return result; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { connector_id, test_payload } = body;

  if (!connector_id || !test_payload) {
    return Response.json({ error: 'connector_id and test_payload are required' }, { status: 400 });
  }

  // Load connector via service role
  const db = base44.asServiceRole;
  const connectors = await db.entities.LeadByteConnector.filter({ id: connector_id });
  const connector = connectors[0];
  if (!connector) return Response.json({ error: 'Connector not found' }, { status: 404 });

  // Build payload based on forwarding mode
  const mode = connector.forwarding_mode || 'template';
  let outboundPayload;
  if (mode === 'pass-through') {
    outboundPayload = { ...test_payload };
  } else {
    outboundPayload = buildPayloadFromTemplate(connector.payload_template, test_payload);
  }

  // Build headers from connector header rows
  const headerRowsParsed = typeof connector.headers === 'string'
    ? JSON.parse(connector.headers || '[]')
    : (connector.headers || []);

  const lbHeaders = {};
  if (Array.isArray(headerRowsParsed)) {
    headerRowsParsed.forEach(row => { if (row.key) lbHeaders[row.key] = row.value; });
  } else {
    Object.assign(lbHeaders, headerRowsParsed);
  }

  const contentType = connector.content_type || 'application/json';
  lbHeaders['Content-Type'] = contentType;

  let bodyStr;
  if (contentType === 'application/x-www-form-urlencoded') {
    bodyStr = new URLSearchParams(typeof outboundPayload === 'object' ? outboundPayload : {}).toString();
  } else {
    bodyStr = typeof outboundPayload === 'string' ? outboundPayload : JSON.stringify(outboundPayload);
  }

  // POST directly to LeadByte
  let lbResponse = null;
  let httpStatus = null;
  try {
    const resp = await fetch(connector.target_url, {
      method: connector.http_method || 'POST',
      headers: lbHeaders,
      body: bodyStr,
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try { lbResponse = JSON.parse(text); } catch { lbResponse = { raw: text }; }
  } catch (err) {
    lbResponse = { error: err.message };
  }

  return Response.json({
    request_body: outboundPayload,
    lb_response: lbResponse,
    http_status: httpStatus,
    forwarding_mode: mode,
    target_url: connector.target_url,
  });
});