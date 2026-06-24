import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Public lead intake endpoint (/functions/leads)
// Delegates the ENTIRE lead-processing pipeline to processLead so there is
// a single source of truth. processLead handles: API-key auth, HLR, custom
// calculations, TrustedForm gate, required-fields gate, LeadByte connector
// filters & field conditions (with DQ routing), revenue capture, Facebook
// CAPI + Deliveries firing on all triggers, duplicate handling, response
// mapping, and outbound webhooks.
//
// This wrapper only handles CORS and injects the supplier API key from
// headers into the payload (as _supplier_key) so processLead can find it.

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
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

  try {
    const body = await req.json();
    const payload = body.payload || body;

    // Extract API key from headers and inject into payload so processLead can authenticate.
    // processLead already checks payload._supplier_key, payload['X-API-KEY'], and payload['X_KEY'].
    let supplierKeyRaw =
      req.headers.get('X-API-KEY') ||
      req.headers.get('X_KEY') ||
      req.headers.get('x-api-key') ||
      req.headers.get('x_key') ||
      null;
    if (!supplierKeyRaw) {
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader.startsWith('Basic ')) {
        const decoded = atob(authHeader.slice(6));
        supplierKeyRaw = decoded.split(':')[0] || null;
      }
    }
    if (supplierKeyRaw && !payload._supplier_key) {
      payload._supplier_key = supplierKeyRaw;
    }

    // Delegate the entire pipeline to processLead — single source of truth.
    // base44.functions.invoke throws on non-200 responses (processLead returns
    // 401 for invalid API keys). Extract the response body so suppliers get
    // the correct error message.
    try {
      const result = await base44.asServiceRole.functions.invoke('processLead', payload);
      const data = result?.data !== undefined ? result.data : result;
      return Response.json(data, { status: 200 });
    } catch (invokeErr) {
      const errData = invokeErr?.response?.data;
      if (errData) {
        let body = errData;
        if (typeof errData === 'string') {
          try { body = JSON.parse(errData); } catch { body = { Response: 'Error', message: errData }; }
        }
        return Response.json(body, { status: invokeErr?.response?.status || 200 });
      }
      throw invokeErr;
    }
  } catch (err) {
    return Response.json({ Response: 'Error', message: 'Internal processing error' }, { status: 200 });
  }
});