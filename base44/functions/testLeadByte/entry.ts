import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { connector_id, test_payload } = body;

  const connectors = await base44.asServiceRole.entities.LeadByteConnector.filter({ id: connector_id });
  if (!connectors.length) return Response.json({ error: 'Connector not found' }, { status: 404 });
  const conn = connectors[0];

  const headerRows = typeof conn.headers === 'string' ? JSON.parse(conn.headers || '[]') : (conn.headers || []);
  const headers = {};
  if (Array.isArray(headerRows)) {
    headerRows.forEach(row => { if (row.key) headers[row.key] = row.value; });
  } else {
    Object.assign(headers, headerRows);
  }

  const contentType = conn.content_type || 'application/json';
  headers['Content-Type'] = contentType;

  let bodyStr;
  if (contentType === 'application/x-www-form-urlencoded') {
    bodyStr = new URLSearchParams(test_payload || {}).toString();
  } else {
    bodyStr = JSON.stringify(test_payload || {});
  }

  try {
    const resp = await fetch(conn.target_url, {
      method: conn.http_method || 'POST',
      headers,
      body: bodyStr,
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return Response.json({ status: resp.status, response: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 200 });
  }
});