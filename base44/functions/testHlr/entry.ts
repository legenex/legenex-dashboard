import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { phone, firstname, lastname } = body;

  const hlrArr = await base44.asServiceRole.entities.HlrSettings.list();
  if (!hlrArr.length) return Response.json({ error: 'No HLR settings configured' }, { status: 404 });
  const hlr = hlrArr[0];

  const reqFieldMap = typeof hlr.request_field_map === 'string'
    ? JSON.parse(hlr.request_field_map || '{}')
    : (hlr.request_field_map || {});

  const hlrBody = {
    [reqFieldMap.mobile || 'mobile']: phone,
    [reqFieldMap.first_name || 'first_name']: firstname,
    [reqFieldMap.last_name || 'last_name']: lastname,
  };

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), hlr.timeout_ms || 8000);
    const resp = await fetch(hlr.endpoint_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hlrBody),
      signal: controller.signal,
    });
    clearTimeout(tid);
    const data = await resp.json();
    return Response.json({ request: hlrBody, response: data });
  } catch (err) {
    return Response.json({ error: err.message, request: hlrBody }, { status: 200 });
  }
});