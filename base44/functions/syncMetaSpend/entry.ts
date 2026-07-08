import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Syncs Meta ad spend for every ad account the active token can access.
// Writes account-level daily AdSpend rows so the Ad Spend cost dashboard fills
// in automatically. Uses service role so the scheduled automation (no user)
// can run it. Sync is account level only to avoid double counting.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Manual calls carry a user token; scheduled calls do not. Require admin when a user is present.
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (user && user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'meta' });
    // Prefer a configured system-user / master token, otherwise fall back to
    // the long-lived user token saved by the Facebook login OAuth flow.
    let token = '';
    try {
      const cfg = JSON.parse(cfgList[0]?.config || '{}');
      token = cfg.system_user_token || cfg.master_token || cfg.access_token || '';
    } catch { token = ''; }
    if (!token) return Response.json({ error: 'Meta not connected' }, { status: 400 });

    const ver = 'v21.0';

    // Load every ad-account-level mapping once, indexed by ad_account_id so we
    // can attribute supplier / vertical / brand where a mapping exists.
    const allMappings = await svc.entities.AdSpendMapping.list();
    const acctMappingById: Record<string, any> = {};
    for (const m of allMappings) {
      if (m.platform === 'meta' && m.enabled && m.match_level === 'ad_account' && m.ad_account_id) {
        acctMappingById[m.ad_account_id] = m;
      }
    }

    // Fetch the accessible ad accounts for the active token.
    const acctUrl = `https://graph.facebook.com/${ver}/me/adaccounts?fields=id,name,account_id,currency&access_token=${encodeURIComponent(token)}`;
    const acctRes = await fetch(acctUrl);
    const acctJson = await acctRes.json();
    if (acctJson.error) {
      return Response.json({ error: acctJson.error.message || 'Failed to load ad accounts' }, { status: 400 });
    }
    const accounts = acctJson.data || [];

    let inserted = 0;
    let accountsSynced = 0;
    const usedMappingIds = new Set<string>();

    for (const acct of accounts) {
      const node = acct.id; // act_XXXX
      const accountName = acct.name || node;
      const mapping = acctMappingById[node];

      const params = new URLSearchParams({
        level: 'account',
        fields: 'spend,impressions,clicks,date_start',
        time_increment: '1',
        date_preset: 'last_30d',
      });
      const url = `https://graph.facebook.com/${ver}/${node}/insights?${params}&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) continue;

      accountsSynced++;

      for (const row of j.data || []) {
        const date = row.date_start;
        // Upsert: delete existing rows for this account + date, then insert fresh.
        const existing = await svc.entities.AdSpend.filter({ ad_account_id: node, date });
        for (const e of existing) await svc.entities.AdSpend.delete(e.id);
        await svc.entities.AdSpend.create({
          platform: 'meta',
          mapping_id: mapping?.id || '',
          date,
          ad_account_id: node,
          meta_campaign_id: '',
          spend: Number(row.spend) || 0,
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          vertical: mapping?.vertical || '',
          brand: mapping?.brand || '',
          supplier_name: mapping?.supplier_name || '',
          cost_source: accountName,
        });
        inserted++;
      }

      if (mapping) usedMappingIds.add(mapping.id);
    }

    // Stamp last_synced_at on every mapping that was used.
    const now = new Date().toISOString();
    for (const id of usedMappingIds) {
      await svc.entities.AdSpendMapping.update(id, { last_synced_at: now });
    }

    return Response.json({ success: true, accounts_synced: accountsSynced, rows_synced: inserted });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});