import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function sha256Hex(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const DEFAULT_CAPI_TEMPLATE = JSON.stringify({
  data: [{
    event_name: "Lead",
    event_time: "{_c_eventtime}",
    action_source: "website",
    event_id: "{event_id}",
    event_source_url: "{_c_eventurl}",
    user_data: {
      client_user_agent: "{_device_userAgent}",
      client_ip_address: "{ip_address}",
      fbc: "{_tracking__fbc}",
      fbp: "{_tracking__fbp}",
      em: "{email|sha256}",
      ph: "{mobile_raw|phone_us|sha256}",
      fn: "{first_name|lowercase|sha256}",
      ln: "{last_name|lowercase|sha256}",
      ct: "{_geoip_city|sha256}",
      st: "{_geoip_regionName|sha256}",
      zp: "{zip|sha256}",
      country: "{_geoip_countryName|sha256}",
      external_id: "{lead_id|sha256}"
    },
    custom_data: {
      content_name: "Check A Case Lead",
      content_category: "Lead Generation",
      vertical: "Legal",
      brand: "Check A Case",
      funnel_name: "Check A Case Survey",
      qualification_status: "Qualified Lead",
      event_category: "Lead",
      lead_event_type: "Lead",
      value: "{conv_value}",
      currency: "USD"
    }
  }]
}, null, 2);

// Test lead data used to resolve template tokens when sending a CAPI test event.
const DEFAULT_TEST_LEAD_DATA = {
  email: 'test@example.com',
  first_name: 'John',
  last_name: 'Doe',
  mobile: '4249449001',
  ip_address: '10.10.10.10',
  optin_url: 'https://example.com/landing',
  user_agent: 'Mozilla/5.0 (Test Browser)',
  fbc: 'fb.1.1234567890.abcdef',
  fbp: 'fb.1.1234567890.123456',
  city: 'Los Angeles',
  state: 'CA',
  zip: '90210',
  country: 'USA',
  lead_id: 999,
  conv_value: 0,
  event_id: 'test-event-001',
};

function phoneUs(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length === 10) return '1' + digits;
  return digits;
}

function escapeJsonString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

function resolveCapiToken(token, d, leadId) {
  switch (token) {
    case '_c_eventtime': return String(Math.floor(Date.now() / 1000));
    case '_c_eventurl': return d.optin_url || d.optinurl || '';
    case '_device_userAgent': return d.user_agent || d.useragent || '';
    case '_tracking__fbc': return d.fbc || d._tracking__fbc || '';
    case '_tracking__fbp': return d.fbp || d._tracking__fbp || '';
    case '_geoip_city': return d.city || d._geoip_city || '';
    case '_geoip_regionName': return d.state || d._geoip_regionName || '';
    case '_geoip_countryName': return d.country || d._geoip_countryName || '';
    case 'mobile_raw': return d.mobile || d.phone1 || d.phone || d.phone_number || '';
    case 'conv_value': return d.conv_value != null ? String(d.conv_value) : '';
    case 'event_id': return d.event_id || d.eventId || String(leadId);
    case 'ip_address': return d.ip_address || d.ipaddress || '';
    case 'lead_id': return d.lead_id != null ? String(d.lead_id) : '';
    case 'email': return d.email || '';
    case 'first_name': return d.first_name || d.firstname || '';
    case 'last_name': return d.last_name || d.lastname || '';
    case 'zip': return d.zip || d.zipcode || '';
    default: return d[token] != null ? String(d[token]) : '';
  }
}

async function applyCapiTransform(value, transform) {
  switch (transform) {
    case 'sha256': return await sha256Hex(value);
    case 'lowercase': return String(value).toLowerCase();
    case 'phone_us': return phoneUs(value);
    default: return value;
  }
}

async function resolveCapiTemplate(templateStr, leadData, leadId) {
  const pattern = /\{([\w.]+(?:\|[\w]+)*)\}/g;
  const matches = [];
  let m;
  while ((m = pattern.exec(templateStr)) !== null) {
    matches.push({ expr: m[1], index: m.index, length: m[0].length });
  }
  const resolved = await Promise.all(matches.map(async (match) => {
    const parts = match.expr.split('|').map(s => s.trim());
    const token = parts[0];
    const transforms = parts.slice(1);
    let value = resolveCapiToken(token, leadData || {}, leadId);
    for (const t of transforms) {
      value = await applyCapiTransform(value, t);
    }
    return escapeJsonString(value);
  }));
  let result = templateStr;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    result = result.slice(0, match.index) + resolved[i] + result.slice(match.index + match.length);
  }
  return result;
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
  const { connector_id, test_payload, event_name } = body;

  if (!connector_id) {
    return Response.json({ error: 'connector_id is required' }, { status: 400 });
  }

  const db = base44.asServiceRole;
  const connectors = await db.entities.ApiConnector.filter({ id: connector_id });
  const conn = connectors[0];
  if (!conn) return Response.json({ error: 'Connector not found' }, { status: 404 });
  if (conn.kind !== 'facebook_capi') return Response.json({ error: 'Connector is not a Facebook CAPI type' }, { status: 400 });

  const eventName = event_name || conn.lead_event_name || 'Lead';
  const apiVer = conn.fb_api_version || 'v21.0';
  const pixel = conn.fb_pixel_id;
  const token = conn.fb_access_token;
  if (!pixel || !token) return Response.json({ error: 'Pixel ID and access token are required' }, { status: 400 });

  const url = `https://graph.facebook.com/${apiVer}/${pixel}/events?access_token=${token}`;

  // Use the test payload (from the textarea) as the template, or fall back to the connector's, or the default.
  let templateStr;
  if (typeof test_payload === 'string') {
    templateStr = test_payload;
  } else if (test_payload && typeof test_payload === 'object') {
    templateStr = JSON.stringify(test_payload, null, 2);
  } else {
    templateStr = (conn.payload_template && conn.payload_template.trim() && conn.payload_template.trim() !== '{}')
      ? conn.payload_template
      : DEFAULT_CAPI_TEMPLATE;
  }

  let requestBody;
  try {
    const resolved = await resolveCapiTemplate(templateStr, DEFAULT_TEST_LEAD_DATA, 'test-lead-id');
    requestBody = JSON.parse(resolved);
  } catch (err) {
    return Response.json({ error: `Template resolution failed: ${err.message}` }, { status: 500 });
  }

  // Override event_name with the actual trigger event name
  if (requestBody.data && requestBody.data[0]) {
    requestBody.data[0].event_name = eventName;
  }
  if (conn.fb_test_event_code) requestBody.test_event_code = conn.fb_test_event_code;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const text = await resp.text();
    let fbResult;
    try { fbResult = JSON.parse(text); } catch { fbResult = { raw: text }; }

    return Response.json({
      request_body: requestBody,
      fb_response: fbResult,
      http_status: resp.status,
      fbtrace_id: fbResult.fbtrace_id || '',
      target_url: url,
    });
  } catch (err) {
    return Response.json({ error: err.message, request_body: requestBody }, { status: 500 });
  }
});