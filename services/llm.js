// services/llm.js
require('dotenv').config();
const fetch = globalThis.fetch || require('node-fetch');

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  // allow missing key in dev/testing when DEV_LLM_STUB is used
  if (!process.env.DEV_LLM_STUB) {
    throw new Error('OPENAI_API_KEY is not set in the environment.');
  }
}

const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30000); // 30 seconds for complex bills
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES || 2);
const TEMPERATURE = Number(process.env.LLM_TEMPERATURE || 0.2);

function stripCodeFences(s) {
  if (!s) return s;
  return s.replace(/(^```json\s*|```$)/g, '').trim();
}

async function callLLM({ system, user, max_tokens = 700, temperature = TEMPERATURE }) {
  if (process.env.DEV_LLM_STUB === 'true') {
    // quick deterministic stub for local dev — return the same shape as the real call
    return {
      json: { dev_stub: true },
      meta: { latencyMs: 0, tokens: 0, model: MODEL, stub: true }
    };
  }

  // Ensure provider sees a clear JSON instruction when using json_object response_format.
  let userContent = user || '';
  const systemContent = system || '';
  if (!/json/i.test(systemContent) && !/json/i.test(userContent)) {
    // Append a safe short instruction to the user content to satisfy providers that require 'json' to be present
    userContent = userContent + '\n\nPlease return your answer as a JSON object.';
  }

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
    temperature,
    max_tokens,
    // ask for a JSON object if provider supports response_format
    response_format: { type: 'json_object' },
  };

  let attempt = 0;
  let lastErr = null;
  while (attempt <= MAX_RETRIES) {
    attempt += 1;
    const controller = new AbortController();
    const start = Date.now();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        lastErr = new Error(`LLM ${res.status}: ${txt}`);
        // retryable for 5xx
        if (res.status >= 500 && attempt <= MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 300 * attempt));
          continue;
        }
        throw lastErr;
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || '';
      const cleaned = stripCodeFences(content);
      let json;
      try {
        json = JSON.parse(cleaned);
      } catch (e) {
        lastErr = e;
        if (attempt <= MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
          continue;
        }
        throw new Error('Failed to parse JSON from LLM response: ' + e.message);
      }

      // tokens and model metadata if provided
      const tokens = data?.usage?.total_tokens || null;
      const model = data?.model || MODEL;

      return { json, meta: { latencyMs, tokens, model } };
    } catch (err) {
      lastErr = err;
      if (err.name === 'AbortError') {
        lastErr = new Error('LLM request timed out');
      }
      if (attempt <= MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr || new Error('LLM call failed');
}

module.exports = { callLLM };
