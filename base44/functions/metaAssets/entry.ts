import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Lists Meta (Facebook) Marketing assets using a stored long-lived access token.
// Token is saved in IntegrationConfig(name="meta") as { access_token }.
// Returns businesses, ad accounts, pages and lead forms so the UI can map them.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const cfgList = await base44.asServiceRole.entities.IntegrationConfig.filter({ name: 'meta' });
    const cfg = cfgList[0];
    if (!cfg) return Response.json({ connected: false });
    let token = '';
    try { token = JSON.parse(cfg.config || '{}').access_token || ''; } catch { token = ''; }
    if (!token) return Response.json({ connected: false });

    const ver = 'v21.0';
    const g = async (path: string, params: string) => {
      const url = `https://graph.facebook.com/${ver}/${path}?${params}&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.data || j;
    };

    // Verify token + fetch assets in parallel-ish (Graph doesn't batch here).
    const me = await g('me', 'fields=id,name');
    const businesses = await g('me/businesses', 'fields=id,name&limit=50').catch(() => []);
    const adAccounts = await g('me/adaccounts', 'fields=id,name,account_id,currency&limit=200').catch(() => []);
    const pages = await g('me/accounts', 'fields=id,name&limit=100').catch(() => []);

    // Lead forms per page (best-effort, first few pages).
    const leadForms: any[] = [];
    for (const p of (pages || []).slice(0, 10)) {
      const forms = await g(`${p.id}/leadgen_forms`, `fields=id,name,status&limit=50`).catch(() => []);
      for (const f of forms || []) leadForms.push({ ...f, page_id: p.id, page_name: p.name });
    }

    return Response.json({
      connected: true,
      account: me,
      businesses: businesses || [],
      ad_accounts: adAccounts || [],
      pages: pages || [],
      lead_forms: leadForms,
    });
  } catch (error) {
    return Response.json({ connected: false, error: (error as Error).message }, { status: 200 });
  }
});