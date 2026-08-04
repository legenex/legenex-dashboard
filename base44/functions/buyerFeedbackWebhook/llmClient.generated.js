// GENERATED FILE - DO NOT EDIT BY HAND.
// Source of truth: base44/functions/_shared/llmClient.js
// Regenerate: node scripts/generate-llm-client.mjs
// canonical-llm-sha256: 8882a58d5f365bad1102b2b08a6cb3640b7285937edbca0d7afbc296280f02ae
// Canonical LLM client with provider failover.
//
// Every AI feature in this app calls this. It tries OpenAI first, and if OpenAI
// is unavailable for ANY reason (secret missing, key revoked, quota exhausted,
// model retired, network or 5xx) it transparently falls back to Anthropic.
// A caller gets a string back and does not care which provider served it.
//
// Before this existed, ten backend functions each carried their own private
// copy of callOpenAI, so a single provider outage took out every AI feature at
// once and every fix had to be applied ten times.
//
// This file lives under base44/functions/_shared deliberately, NOT src/lib: it
// references Deno globals, and putting it in src/ would trip the frontend lint
// config. It has ZERO imports so scripts/generate-llm-client.mjs can copy it
// verbatim into each consuming function folder. Do not add an import here.

// OpenAI model -> closest Anthropic equivalent.
const MODEL_FALLBACK = {
  'gpt-4o-mini': 'claude-haiku-4-5-20251001',
  'gpt-4o': 'claude-sonnet-5',
};
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

// Thrown when a provider cannot serve the request. Carries a machine-readable
// reason so the caller can distinguish "misconfigured" from "provider down".
function providerError(provider, code, detail) {
  const err = new Error(`${provider.toUpperCase()}_${code}: ${detail}`);
  err.provider = provider;
  err.code = code;
  return err;
}

async function callOpenAIProvider({ prompt, system, model, temperature, json, maxTokens }) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw providerError('openai', 'KEY_MISSING', 'OPENAI_API_KEY is not set on this app.');

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const body = { model, messages, temperature };
  if (maxTokens) body.max_tokens = maxTokens;
  if (json) body.response_format = { type: 'json_object' };

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw providerError('openai', 'NETWORK', e.message);
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 401) throw providerError('openai', 'KEY_REJECTED', detail);
    if (res.status === 429) throw providerError('openai', 'QUOTA', detail);
    if (res.status === 404) throw providerError('openai', 'MODEL_MISSING', `model "${model}" unavailable. ${detail}`);
    throw providerError('openai', `HTTP_${res.status}`, detail);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

async function callAnthropicProvider({ prompt, system, model, temperature, json, maxTokens }) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw providerError('anthropic', 'KEY_MISSING', 'ANTHROPIC_API_KEY is not set on this app.');

  const anthropicModel = MODEL_FALLBACK[model] || DEFAULT_ANTHROPIC_MODEL;

  // Anthropic has no response_format flag, so JSON mode is instructed instead
  // and the fences are stripped from the result below.
  const sys = json
    ? `${system ? `${system}\n\n` : ''}Respond with a single valid JSON object and nothing else. No prose, no markdown code fences.`
    : system;

  const body = {
    model: anthropicModel,
    // Required by Anthropic, unlike OpenAI where it is optional.
    max_tokens: maxTokens || 2048,
    messages: [{ role: 'user', content: prompt }],
  };
  if (sys) body.system = sys;
  if (typeof temperature === 'number') body.temperature = temperature;

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw providerError('anthropic', 'NETWORK', e.message);
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 401) throw providerError('anthropic', 'KEY_REJECTED', detail);
    if (res.status === 429) throw providerError('anthropic', 'QUOTA', detail);
    if (res.status === 404) throw providerError('anthropic', 'MODEL_MISSING', `model "${anthropicModel}" unavailable. ${detail}`);
    throw providerError('anthropic', `HTTP_${res.status}`, detail);
  }

  const data = await res.json();
  const text = (data?.content || [])
    .filter((b) => b?.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return json ? text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim() : text;
}

// Full result: the text plus which provider served it and why any failover
// happened. Use this where the UI should show provenance.
export async function callLLMDetailed({
  prompt,
  system,
  model = 'gpt-4o-mini',
  temperature = 0.4,
  json = false,
  maxTokens,
} = {}) {
  const args = { prompt, system, model, temperature, json, maxTokens };

  let openaiError = null;
  try {
    const text = await callOpenAIProvider(args);
    return { text, provider: 'openai', model, failover: false, openai_error: null };
  } catch (e) {
    openaiError = e;
  }

  try {
    const text = await callAnthropicProvider(args);
    return {
      text,
      provider: 'anthropic',
      model: MODEL_FALLBACK[model] || DEFAULT_ANTHROPIC_MODEL,
      failover: true,
      openai_error: openaiError.message,
    };
  } catch (anthropicError) {
    // Both down. Report both causes: reporting only the second one sends the
    // operator to fix the wrong provider.
    throw new Error(
      `ALL_PROVIDERS_FAILED. OpenAI: ${openaiError.message} | Anthropic: ${anthropicError.message}`,
    );
  }
}

// Drop-in replacement for the old per-function callOpenAI. Returns a string.
export async function callLLM(args) {
  const { text } = await callLLMDetailed(args);
  return text;
}
