import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Syncs Meta ad spend for all enabled AdSpendMapping records and writes daily AdSpend rows.
// Feeds true CPL per supplier/source. Can be called manually from the UI or on a schedule.
// Uses service role so the scheduled automation (no user) can run it.
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
    const mappings = (await svc.entities.AdSpendMapping.list()).filter((m: any) => m.platform === 'meta' && m.enabled);
    let inserted = 0;

    for (const m of mappings) {
      const level = m.match_level === 'ad_set' ? 'adset' : (m.match_level === 'campaign' ? 'campaign' : 'account');
      const node = m.match_level !== 'ad_account' && m.meta_campaign_id ? m.meta_campaign_id : m.ad_account_id;
      if (!node) continue;

      const params = new URLSearchParams({
        level,
        fields: 'spend,impressions,clicks,date_start',
        time_increment: '1',
        date_preset: 'last_7d',
      });
      const url = `https://graph.facebook.com/${ver}/${node}/insights?${params}&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) continue;

      for (const row of j.data || []) {
        const date = row.date_start;
        // Upsert: delete same-day rows for this mapping then insert fresh.
        const existing = await svc.entities.AdSpend.filter({ mapping_id: m.id, date });
        for (const e of existing) await svc.entities.AdSpend.delete(e.id);
        await svc.entities.AdSpend.create({
          platform: 'meta',
          mapping_id: m.id,
          date,
          ad_account_id: m.ad_account_id,
          meta_campaign_id: m.meta_campaign_id || '',
          spend: Number(row.spend) || 0,
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          vertical: m.vertical || '',
          brand: m.brand || '',
          supplier_name: m.supplier_name || '',
          cost_source: m.cost_source || '',
        });
        inserted++;
      }
      await svc.entities.AdSpendMapping.update(m.id, { last_synced_at: new Date().toISOString() });
    }

    return Response.json({ success: true, mappings: mappings.length, rows_synced: inserted });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});