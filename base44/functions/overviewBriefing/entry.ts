import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// AI Analyst briefing for the Overview command center.
// The frontend sends a pre-aggregated finance/lead summary (current + prior period);
// we return a short plain-English briefing. Uses OpenAI (OPENAI_API_KEY secret).
async function callOpenAI({ prompt, system, model = 'gpt-4o-mini', temperature = 0.4 }) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const summary = body?.summary;
    if (!summary) return Response.json({ error: 'Missing summary' }, { status: 400 });

    const system = 'You are a sharp CFO-level financial analyst for a lead-generation business. You read a reconciliation summary where "booked" means recorded from leads and "verified" means proven by real cash received. Write tight, specific, plain-English briefings. No hype, no emojis, no markdown headings.';

    const prompt = `Write a 3-4 sentence executive briefing for the current period based on this data. Cover, in order: (1) what changed vs the prior period, (2) where the biggest money-booked-but-not-yet-proven gap is, (3) which counterparty or campaign is the top risk, (4) the single most important action to take now. Be concrete with the dollar figures given. Keep it under 90 words.

DATA (JSON):
${JSON.stringify(summary)}`;

    const briefing = await callOpenAI({ prompt, system });
    return Response.json({ briefing: String(briefing || '').trim() });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});