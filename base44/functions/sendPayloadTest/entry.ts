import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { target_url, method, content_type, payload, headers } = await req.json();
    if (!target_url) return Response.json({ error: 'target_url is required' }, { status: 400 });

    const hdrs = { 'Content-Type': content_type || 'application/json' };
    if (Array.isArray(headers)) {
      for (const h of headers) {
        if (h && h.key) hdrs[h.key] = h.value ?? '';
      }
    }

    const resp = await fetch(target_url, {
      method: method || 'POST',
      headers: hdrs,
      body: payload == null ? '' : String(payload),
    });

    const respText = await resp.text();
    let body;
    try { body = JSON.parse(respText); } catch { body = respText; }

    return Response.json({
      status: resp.status,
      statusText: resp.statusText,
      ok: resp.ok,
      body,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});