import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Distribution AI Insights: summarizes OPERATIONAL trends for a selected period.
// The frontend sends a pre-aggregated, revenue-free summary; we return a short narrative.
// Uses OpenAI (OPENAI_API_KEY secret).
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
    const summary = body.summary || {};
    const periodLabel = (body.periodLabel || 'the selected period').toString();

    const prompt = `You are an operations analyst for the Legenex lead-distribution platform.
Analyze ONLY the operational data below for ${periodLabel}. Do NOT mention revenue, profit, CPL, or any money — this is an operations view only.

Write 3-5 short bullet insights covering, where the data supports it:
- volume shifts vs the prior period
- rising disqualification (DQ) or error rates
- supplier or source anomalies (a source spiking, dropping, or with unusually high DQ/error/reject rates)
- notable status-mix changes (unsold, returns, rejections)

Be specific and use the actual numbers/percentages from the data. If a trend is flat or data is thin, say so briefly. Return plain text bullets starting with "- ". No preamble, no closing summary.

=== OPERATIONAL DATA (JSON) ===
${JSON.stringify(summary)}`;

    const answer = await callOpenAI({ prompt });

    return Response.json({ insights: typeof answer === 'string' ? answer : JSON.stringify(answer) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});