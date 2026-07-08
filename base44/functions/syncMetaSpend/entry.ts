import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Syncs Meta ad spend across every configured token. A system-user token only
// reaches one Business Manager, so config.tokens = [{ id, label, token }] lets
// one account cover ad accounts spread across several Businesses. A lone legacy
// config.access_token is treated as one unlabeled token.
// Writes daily AdSpend rows at three levels (account, campaign, ad) so the cost
// dashboard fills in automatically. Uses service role so the scheduled
// automation (no user) can run it. The Ad Spend tab reads only account-level
// rows to avoid double counting; campaign and ad rows drive granular views.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Manual calls carry a user token; scheduled calls do not. Require admin when a user is present.
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (user && user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'meta' });

    // Resolve tokens: prefer config.tokens, fall back to a single legacy token.
    let tokens: { id: string; label: string; token: string }[] = [];
    try {
      const cfg = JSON.parse(cfgList[0]?.config || '{}');
      if (Array.isArray(cfg.tokens) && cfg.tokens.length) {
        tokens = cfg.tokens
          .filter((t: any) => t && t.token)
          .map((t: any, i: number) => ({ id: t.id || `token_${i}`, label: t.label || `Token ${i + 1}`, token: t.token }));
      } else {
        const legacy = cfg.system_user_token || cfg.master_token || cfg.access_token || '';
        if (legacy) tokens = [{ id: 'default', label: 'Default', token: legacy }];
      }
    } catch { tokens = []; }
    if (!tokens.length) return Response.json({ error: 'Meta not connected' }, { status: 400 });

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

    // Build the deduped account list across all tokens; each account keeps the
    // token that can access it. Note any token that fails to load accounts.
    const accountsById: Record<string, any> = {};
    const tokenErrors: any[] = [];
    for (const t of tokens) {
      const acctUrl = `https://graph.facebook.com/${ver}/me/adaccounts?fields=id,name,account_id,currency&limit=200&access_token=${encodeURIComponent(t.token)}`;
      const acctRes = await fetch(acctUrl);
      const acctJson = await acctRes.json();
      if (acctJson.error) {
        tokenErrors.push({ label: t.label, error: acctJson.error.message || 'Failed to load ad accounts' });
        continue;
      }
      for (const a of acctJson.data || []) {
        if (!accountsById[a.id]) accountsById[a.id] = { id: a.id, name: a.name || a.id, token: t.token, token_label: t.label };
      }
    }

    // Extract the Meta-reported lead count from a row's actions array. Sum the
    // value of the first matching action_type present, in strict priority order,
    // stopping at the first type that appears. Never invent a value.
    const LEAD_ACTION_PRIORITY = ['offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.lead_grouped'];
    const extractLeads = (actions: any): number => {
      if (!Array.isArray(actions)) return 0;
      for (const type of LEAD_ACTION_PRIORITY) {
        const matches = actions.filter((a: any) => a && a.action_type === type);
        if (matches.length) {
          return matches.reduce((sum: number, a: any) => sum + (Number(a.value) || 0), 0);
        }
      }
      return 0;
    };

    let inserted = 0;
    let campaignRowsInserted = 0;
    let adRowsInserted = 0;
    let accountsSynced = 0;
    const usedMappingIds = new Set<string>();

    for (const acct of Object.values(accountsById)) {
      const node = acct.id; // act_XXXX
      const accountName = acct.name;
      const mapping = acctMappingById[node];
      const supplierName = mapping?.supplier_name || '';
      const supplierKey = supplierName.trim().toLowerCase();

      const fetchInsights = async (level: string, fields: string) => {
        const params = new URLSearchParams({
          level,
          fields,
          time_increment: '1',
          date_preset: 'last_30d',
        });
        const url = `https://graph.facebook.com/${ver}/${node}/insights?${params}&access_token=${encodeURIComponent(acct.token)}`;
        const r = await fetch(url);
        return await r.json();
      };

      // Pass A: account level.
      const jAcct = await fetchInsights('account', 'spend,impressions,clicks,date_start,actions,cost_per_action_type');
      if (jAcct.error) {
        tokenErrors.push({ label: acct.token_label, error: `${node}: ${jAcct.error.message}` });
        continue;
      }

      accountsSynced++;

      const baseRow = (row: any) => ({
        platform: 'meta',
        mapping_id: mapping?.id || '',
        date: row.date_start,
        ad_account_id: node,
        spend: Number(row.spend) || 0,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        leads: extractLeads(row.actions),
        vertical: mapping?.vertical || '',
        brand: mapping?.brand || '',
        supplier_name: supplierName,
        supplier_key: supplierKey,
        cost_source: accountName,
      });

      for (const row of jAcct.data || []) {
        const date = row.date_start;
        // Upsert account rows: delete only this account + date + level, then insert.
        const existing = await svc.entities.AdSpend.filter({ ad_account_id: node, date, level: 'account' });
        for (const e of existing) await svc.entities.AdSpend.delete(e.id);
        await svc.entities.AdSpend.create({
          ...baseRow(row),
          level: 'account',
          meta_campaign_id: '',
          meta_campaign_name: '',
          adset_id: '',
          adset_name: '',
          ad_id: '',
          ad_name: '',
        });
        inserted++;
      }

      // Pass B: campaign level.
      const jCamp = await fetchInsights('campaign', 'spend,impressions,clicks,date_start,actions,cost_per_action_type,campaign_id,campaign_name');
      if (jCamp.error) {
        tokenErrors.push({ label: acct.token_label, error: `${node} campaign: ${jCamp.error.message}` });
      } else {
        for (const row of jCamp.data || []) {
          const date = row.date_start;
          const campaignId = row.campaign_id || '';
          const existing = await svc.entities.AdSpend.filter({ ad_account_id: node, date, level: 'campaign', meta_campaign_id: campaignId });
          for (const e of existing) await svc.entities.AdSpend.delete(e.id);
          await svc.entities.AdSpend.create({
            ...baseRow(row),
            level: 'campaign',
            meta_campaign_id: campaignId,
            meta_campaign_name: row.campaign_name || '',
            adset_id: '',
            adset_name: '',
            ad_id: '',
            ad_name: '',
          });
          campaignRowsInserted++;
        }
      }

      // Pass C: ad level.
      const jAd = await fetchInsights('ad', 'spend,impressions,clicks,date_start,actions,cost_per_action_type,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name');
      if (jAd.error) {
        tokenErrors.push({ label: acct.token_label, error: `${node} ad: ${jAd.error.message}` });
      } else {
        for (const row of jAd.data || []) {
          const date = row.date_start;
          const adId = row.ad_id || '';
          const existing = await svc.entities.AdSpend.filter({ ad_account_id: node, date, level: 'ad', ad_id: adId });
          for (const e of existing) await svc.entities.AdSpend.delete(e.id);
          await svc.entities.AdSpend.create({
            ...baseRow(row),
            level: 'ad',
            meta_campaign_id: row.campaign_id || '',
            meta_campaign_name: row.campaign_name || '',
            adset_id: row.adset_id || '',
            adset_name: row.adset_name || '',
            ad_id: adId,
            ad_name: row.ad_name || '',
          });
          adRowsInserted++;
        }
      }

      if (mapping) usedMappingIds.add(mapping.id);
    }

    // Stamp last_synced_at on every mapping that was used.
    const now = new Date().toISOString();
    for (const id of usedMappingIds) {
      await svc.entities.AdSpendMapping.update(id, { last_synced_at: now });
    }

    return Response.json({
      success: true,
      accounts_synced: accountsSynced,
      rows_synced: inserted,
      campaign_rows_inserted: campaignRowsInserted,
      ad_rows_inserted: adRowsInserted,
      token_errors: tokenErrors,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});