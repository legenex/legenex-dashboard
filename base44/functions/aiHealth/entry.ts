import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Caller model: authenticated operator only.
//
// Diagnostic for the shared OpenAI dependency. Ten backend functions
// (dataBot, overviewBriefing, adManagerInsights, distributionInsights,
// reconInsights, categorizeTransactions, walkthroughGuide, whatsNew,
// progressPrompt, buyerFeedbackWebhook) all read the same OPENAI_API_KEY
// secret. When they fail there is no way to tell from the UI whether the
// secret is absent, revoked, out of quota, or whether the model was retired.
// This reports exactly that, and never returns the key itself.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (String(user.role || '').toLowerCase() !== 'admin') {
      return Response.json({ error: 'Operator access required' }, { status: 403 });
    }

    const key = Deno.env.get('OPENAI_API_KEY');

    const result: Record<string, unknown> = {
      checked_at: new Date().toISOString(),
      key_present: Boolean(key),
      key_length: key ? key.length : 0,
      // Shape only. Never the value. A real key starts sk- and modern project
      // keys start sk-proj-, so a wrong-shape secret is visible without
      // exposing anything usable.
      key_shape: key ? `${key.slice(0, 3)}...${key.length} chars` : null,
    };

    if (!key) {
      result.verdict = 'KEY_MISSING';
      result.detail = 'OPENAI_API_KEY is not set on this app. Set it in the Base44 dashboard under Settings then Secrets. Every AI feature depends on it.';
      return Response.json(result, { status: 200 });
    }

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
    } catch (e) {
      result.verdict = 'NETWORK_BLOCKED';
      result.detail = `Could not reach api.openai.com from the function runtime: ${(e as Error).message}`;
      return Response.json(result, { status: 200 });
    }

    result.openai_http_status = res.status;

    if (res.status === 401) {
      const body = await res.text();
      result.verdict = 'KEY_REJECTED';
      result.detail = `The secret is set but OpenAI rejected it. Usually revoked, deleted, or belonging to a different project. OpenAI said: ${body.slice(0, 300)}`;
      return Response.json(result, { status: 200 });
    }
    if (res.status === 429) {
      result.verdict = 'QUOTA_EXCEEDED';
      result.detail = 'The key is valid but the account is rate limited or out of billing credit.';
      return Response.json(result, { status: 200 });
    }
    if (!res.ok) {
      const body = await res.text();
      result.verdict = 'OPENAI_ERROR';
      result.detail = `Unexpected status ${res.status}: ${body.slice(0, 300)}`;
      return Response.json(result, { status: 200 });
    }

    const data = await res.json();
    const ids = new Set((data?.data || []).map((m: { id: string }) => m.id));
    const required = ['gpt-4o-mini', 'gpt-4o'];
    const missing = required.filter((m) => !ids.has(m));

    result.models_visible = ids.size;
    result.required_models = Object.fromEntries(required.map((m) => [m, ids.has(m)]));

    if (missing.length > 0) {
      result.verdict = 'MODEL_UNAVAILABLE';
      result.detail = `The key works but these models are not available to it: ${missing.join(', ')}. The app hardcodes gpt-4o-mini in nine functions, so they will all fail until the model is changed or access is granted.`;
      return Response.json(result, { status: 200 });
    }

    result.verdict = 'HEALTHY';
    result.detail = 'The key is valid and the required models are available. If AI features still fail, the cause is downstream of the key.';
    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json(
      { verdict: 'DIAGNOSTIC_FAILED', detail: (error as Error).message },
      { status: 200 },
    );
  }
});
