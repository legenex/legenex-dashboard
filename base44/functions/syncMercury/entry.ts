import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Pulls transactions from the Mercury bank API and ingests them as BankTransaction records.
// Token is stored in IntegrationConfig(name='mercury') as { api_token, account_id? }.
// Dedupes on external_id (Mercury transaction id). Runs on demand and on schedule.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled (no user) and admin-triggered runs.
    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (!user) isScheduled = true;
      else if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch {
      isScheduled = true;
    }

    const svc = base44.asServiceRole;
    const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'mercury' });
    const cfg = cfgList[0];
    if (!cfg) return Response.json({ success: false, error: 'Mercury not connected' }, { status: 400 });

    let parsed = {};
    try { parsed = JSON.parse(cfg.config || '{}'); } catch { parsed = {}; }
    const token = parsed.api_token;
    if (!token) return Response.json({ success: false, error: 'Missing Mercury API token' }, { status: 400 });

    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

    // Resolve accounts (or use the configured account id).
    let accountIds = [];
    if (parsed.account_id) {
      accountIds = [parsed.account_id];
    } else {
      const accRes = await fetch('https://api.mercury.com/api/v1/accounts', { headers });
      if (!accRes.ok) {
        const t = await accRes.text();
        return Response.json({ success: false, error: `Mercury accounts error ${accRes.status}: ${t.slice(0, 200)}` }, { status: 400 });
      }
      const accJson = await accRes.json();
      accountIds = (accJson.accounts || accJson || []).map((a) => a.id).filter(Boolean);
    }

    // Existing external_ids for dedupe.
    const existing = await svc.entities.BankTransaction.filter({ source: 'mercury' }).catch(() => []);
    const seen = new Set(existing.map((t) => t.external_id).filter(Boolean));

    const toCreate = [];
    for (const accId of accountIds) {
      const txRes = await fetch(`https://api.mercury.com/api/v1/account/${accId}/transactions?limit=500`, { headers });
      if (!txRes.ok) continue;
      const txJson = await txRes.json();
      const list = txJson.transactions || txJson || [];
      for (const t of list) {
        const extId = t.id || t.transactionId;
        if (!extId || seen.has(extId)) continue;
        seen.add(extId);
        const amount = Number(t.amount) || 0;
        toCreate.push({
          source: 'mercury',
          external_id: String(extId),
          date: String(t.postedAt || t.createdAt || '').slice(0, 10),
          description: t.bankDescription || t.counterpartyName || t.note || '',
          amount,
        });
      }
    }

    if (toCreate.length) await svc.entities.BankTransaction.bulkCreate(toCreate);
    if (cfg.id) await svc.entities.IntegrationConfig.update(cfg.id, { config: JSON.stringify({ ...parsed, last_synced_at: new Date().toISOString() }) });

    return Response.json({ success: true, ingested: toCreate.length, accounts: accountIds.length, scheduled: isScheduled });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});