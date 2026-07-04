import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// AI-categorizes uncategorized BankTransaction records into tech / media / personal / payouts / revenue / other.
// Also returns AI reconciliation insights. Admin-only.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const all = await svc.entities.BankTransaction.list('-date', 500);
    const uncategorized = all.filter((t: any) => !t.category);

    let updated = 0;
    if (uncategorized.length > 0) {
      // Batch to keep the prompt small.
      const batch = uncategorized.slice(0, 100);
      const list = batch.map((t: any, i: number) => `${i}. ${t.description || '(no description)'} | amount ${t.amount}`).join('\n');
      const result = await svc.integrations.Core.InvokeLLM({
        prompt: `You are a bookkeeping assistant for a lead-generation business. Categorize each bank transaction into exactly one of: tech, media, personal, payouts, revenue, other.
- tech: software, SaaS, hosting, APIs, tools
- media: ad spend, marketing, agencies, creative
- personal: owner personal expenses, non-business
- payouts: paying suppliers / affiliates
- revenue: money received from buyers / clients (positive amounts)
- other: anything else

Transactions:
${list}

Return JSON with an array "items" of { index, category }.`,
        response_json_schema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'object', properties: { index: { type: 'number' }, category: { type: 'string' } } },
            },
          },
        },
      });
      const items = result?.items || [];
      for (const it of items) {
        const t = batch[it.index];
        if (t && ['tech', 'media', 'personal', 'payouts', 'revenue', 'other'].includes(it.category)) {
          await svc.entities.BankTransaction.update(t.id, { category: it.category, ai_categorized: true });
          updated++;
        }
      }
    }

    // Summary stats.
    const refreshed = await svc.entities.BankTransaction.list('-date', 500);
    const moneyIn = refreshed.filter((t: any) => t.amount > 0).reduce((a: number, t: any) => a + Number(t.amount), 0);
    const moneyOut = refreshed.filter((t: any) => t.amount < 0).reduce((a: number, t: any) => a + Number(t.amount), 0);
    const byCat: Record<string, number> = {};
    for (const t of refreshed) { const c = t.category || 'uncategorized'; byCat[c] = (byCat[c] || 0) + Number(t.amount); }

    return Response.json({ success: true, updated, money_in: moneyIn, money_out: moneyOut, by_category: byCat });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});