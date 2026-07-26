import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// DataBot: answers questions about the app's own data + a curated Knowledge Base.
// Uses OpenAI (OPENAI_API_KEY secret).
async function callOpenAI({ prompt, system, model = 'gpt-4o-mini', temperature = 0.4, jsonSchema = null }) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const payload: Record<string, unknown> = { model, messages, temperature };
  if (jsonSchema) {
    payload.response_format = { type: 'json_schema', json_schema: { name: 'response', strict: false, schema: jsonSchema } };
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  if (jsonSchema) { try { return JSON.parse(content); } catch { return content; } }
  return content;
}

// Scope a change request into a single-concern build prompt for the CONTROLLED
// channel (Claude via connector, Base44 builder, or Claude Code). Never executes.
// If the message is really an analytics question, returns is_build=false.
async function draftBuildRequest(question, history) {
  const schema = {
    type: 'object',
    properties: {
      is_build: { type: 'boolean' },
      title: { type: 'string' },
      summary: { type: 'string' },
      target_files: { type: 'array', items: { type: 'string' } },
      do_not_touch: { type: 'array', items: { type: 'string' } },
      risk: { type: 'string', enum: ['green', 'amber', 'red'] },
      ready_prompt: { type: 'string' },
    },
    required: ['is_build', 'title', 'summary', 'ready_prompt'],
  };
  const convo = history.map((m) => `${m.role === 'user' ? 'User' : 'DataBot'}: ${m.content}`).join('\n');
  const system = `You scope change requests for the Legenex Base44 app so they can be handed to a controlled build channel (Claude via the Base44 connector, the Base44 builder, or Claude Code). You NEVER execute changes yourself. If the user's message is actually an analytics or data question rather than a request to change the app, set is_build=false and leave the other fields empty.\n\nBake these conventions into ready_prompt so it is safe to run:\n- One concern per change, with an explicit do-not-touch list.\n- Follow DESIGN-SYSTEM.md: semantic tokens only, never raw hex/hsl or raw palette utilities.\n- RED surfaces that need explicit human approval and must not be edited casually: processLead, the four LeadByteConnectors and their enabled states, Conversion Events, distribution_mode (only via distributionSetMode), credentials, live endpoints, billing records, buyer pricing and state coverage.\n- Additive schema only. No em dashes anywhere. Checkpoint before any schema or destructive change. Verify with the design-token gate and lint.\n\nready_prompt must be a complete, copy-pasteable instruction a builder can act on: the target area, the exact change, the do-not-touch list, and the verification step. Set risk=red if the request touches any RED surface, amber if it touches shared or data surfaces, green for isolated UI or docs.`;
  const prompt = `Conversation so far:\n${convo || '(none)'}\n\nUser request: ${question}\n\nReturn JSON only.`;
  return await callOpenAI({ system, prompt, jsonSchema: schema, temperature: 0.2 });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const question = (body.question || '').toString().trim();
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    if (!question) return Response.json({ error: 'No question provided' }, { status: 400 });

    const isAdmin = user.role === 'admin';
    const mode = body.mode === 'build' ? 'build' : 'data';

    // Friendly, actionable message instead of a silent 500 when the key is unset.
    if (!Deno.env.get('OPENAI_API_KEY')) {
      return Response.json({ type: 'answer', answer: 'This assistant is not configured yet: the OPENAI_API_KEY secret is missing. An admin can add it in the app secrets, then I can answer.' });
    }

    // BuildBot: draft a single-concern build request for the controlled channel.
    // Operator-gated for now; a grantable buildbot permission comes next.
    if (mode === 'build') {
      if (!isAdmin) {
        return Response.json({ type: 'answer', answer: 'BuildBot is available to admins and owners only.' });
      }
      try {
        const draft = await draftBuildRequest(question, history);
        if (draft && draft.is_build) return Response.json({ type: 'build_request', build_request: draft });
      } catch (_) { /* not a build, or draft failed: fall through to an answer */ }
    }

    // --- Gather a compact snapshot of live app data (service role for full visibility) ---
    const svc = base44.asServiceRole;
    const [leads, suppliers, buyers, adSpend, txns, kbDocs] = await Promise.all([
      svc.entities.Lead.list('-created_date', 500).catch(() => []),
      svc.entities.Supplier.list().catch(() => []),
      svc.entities.Buyer.list().catch(() => []),
      svc.entities.AdSpend.list('-date', 500).catch(() => []),
      svc.entities.BankTransaction.list('-date', 300).catch(() => []),
      svc.entities.KnowledgeDoc.filter({ active: true }, 'sort_order').catch(() => []),
    ]);

    const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
    const byStatus = {};
    for (const l of leads) byStatus[l.final_status] = (byStatus[l.final_status] || 0) + 1;

    const dataSummary = {
      leads_total: leads.length,
      leads_by_status: byStatus,
      revenue_total: Math.round(sum(leads, (l) => l.revenue)),
      suppliers_count: suppliers.length,
      supplier_names: suppliers.slice(0, 40).map((s) => s.name),
      buyers_count: buyers.length,
      buyer_names: buyers.slice(0, 40).map((b) => b.company_name),
      ad_spend_total: Math.round(sum(adSpend, (a) => a.spend)),
      // Ad spend breakdowns so questions like "where is this cost coming from"
      // can be answered with the actual source rows, not just a grand total.
      // Only account-level rows are totalled, matching how supplier cost is
      // computed, so campaign and ad detail rows do not double count.
      ad_spend_by_supplier: (() => {
        const m = {};
        for (const r of adSpend) {
          if (r.level && r.level !== 'account') continue;
          const k = r.supplier_name || '(unattributed)';
          m[k] = Math.round(((m[k] || 0) + (Number(r.spend) || 0)) * 100) / 100;
        }
        return m;
      })(),
      ad_spend_by_account: (() => {
        const m = {};
        for (const r of adSpend) {
          if (r.level && r.level !== 'account') continue;
          const k = r.cost_source || r.ad_account_id || '(unknown account)';
          m[k] = Math.round(((m[k] || 0) + (Number(r.spend) || 0)) * 100) / 100;
        }
        return m;
      })(),
      ad_spend_by_month: (() => {
        const m = {};
        for (const r of adSpend) {
          if (r.level && r.level !== 'account') continue;
          const k = String(r.date || '').slice(0, 7);
          if (!k) continue;
          m[k] = Math.round(((m[k] || 0) + (Number(r.spend) || 0)) * 100) / 100;
        }
        return m;
      })(),
      ad_spend_date_range: (() => {
        const ds = adSpend.map((r) => r.date).filter(Boolean).sort();
        return ds.length ? { earliest: ds[0], latest: ds[ds.length - 1], days: ds.length } : null;
      })(),
      ad_spend_recent_days: adSpend
        .filter((r) => !r.level || r.level === 'account')
        .slice(0, 45)
        .map((r) => ({
          date: r.date, spend: Number(r.spend) || 0, supplier: r.supplier_name || '',
          account: r.cost_source || r.ad_account_id || '', platform: r.platform || '', vertical: r.vertical || '',
        })),
      bank_money_in: Math.round(sum(txns.filter((t) => t.amount > 0), (t) => t.amount)),
      bank_money_out: Math.round(sum(txns.filter((t) => t.amount < 0), (t) => t.amount)),
      bank_unmatched: txns.filter((t) => !t.reconciled).length,
      recent_leads: leads.slice(0, 25).map((l) => ({
        supplier: l.supplier_name, status: l.final_status, revenue: l.revenue,
        email_valid: l.email_valid, created: l.created_date,
      })),
    };

    const kbContext = kbDocs.map((d) => {
      const head = d.kind === 'glossary' ? `${d.term || d.title}` : d.title;
      return `[${d.kind}] ${head}: ${d.content || ''}`;
    }).join('\n');

    const convo = history.map((m) => `${m.role === 'user' ? 'User' : 'DataBot'}: ${m.content}`).join('\n');

    const prompt = `You are DataBot, an analytics assistant embedded in the Legenex lead-management platform.
Answer the user's question using ONLY the live app data and knowledge base below. Be concise, specific, and use numbers from the data. If the data does not contain the answer, say so plainly.
When asked where a figure comes from, trace it through the breakdowns: ad_spend_by_supplier, ad_spend_by_account, ad_spend_by_month and ad_spend_recent_days hold per day ad spend with its supplier and ad account, so match the amount against those rows and name the date, supplier and account. A number that does not match a total may match a single day. Check ad_spend_date_range as well: if the latest spend date is well before today, say the spend data looks stale and give that latest date.

=== LIVE APP DATA (JSON) ===
${JSON.stringify(dataSummary)}

=== KNOWLEDGE BASE ===
${kbContext || '(empty)'}

=== CONVERSATION SO FAR ===
${convo || '(none)'}

User: ${question}
DataBot:`;

    const answer = await callOpenAI({ prompt });

    return Response.json({ type: 'answer', answer: typeof answer === 'string' ? answer : JSON.stringify(answer) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});