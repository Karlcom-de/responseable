import 'server-only';

type Capability = 'CHAT' | 'EMBEDDINGS' | 'STT';
export function aiConfig(capability: Capability) {
  const prefix = 'RESPONSEABLE_AI_' + capability;
  const model = process.env[prefix + '_MODEL'];
  if (!model) return;
  try {
    const url = new URL(process.env[prefix + '_URL'] || '');
    if (!(url.protocol === 'https:' || url.protocol === 'http:' && (process.env.RESPONSEABLE_AI_ALLOW_HTTP === 'true' || ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash) return;
    return { base: url.href.replace(/\/?$/, '/'), model, key: process.env[prefix + '_KEY'] };
  } catch { return; }
}

export async function aiRequest(capability: Capability, payload: Record<string, unknown> | FormData) {
  const config = aiConfig(capability);
  if (!config) throw new Error('AI capability unavailable');
  const form = payload instanceof FormData;
  const path = { CHAT: 'chat/completions', EMBEDDINGS: 'embeddings', STT: 'audio/transcriptions' }[capability];
  if (form) payload.set('model', config.model);
  const response = await fetch(config.base + path, {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: {
      ...(!form && { 'Content-Type': 'application/json' }),
      ...(config.key && { Authorization: 'Bearer ' + config.key }),
    },
    body: form ? payload : JSON.stringify({ ...payload, model: config.model }),
  });
  if (!response.ok) throw new Error('AI provider unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI provider returned no response');
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1_000_000) {
      await reader.cancel();
      throw new Error('AI response exceeds limit');
    }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString());
}

export async function aiBudget(operator: string, capability: string) {
  const { query } = await import('./store');
  const window = Math.floor(Date.now() / 60_000);
  const [entry] = await query<{ count: number }>(`
    INSERT INTO ai_budget VALUES ($1,$2,$3,1)
    ON CONFLICT (operator,capability) DO UPDATE SET count=CASE WHEN ai_budget."window"=$3 THEN LEAST(ai_budget.count+1,1000) ELSE 1 END, "window"=$3
    RETURNING count
  `, [operator, capability, window]);
  return entry.count <= (capability === 'STT' ? 30 : 8);
}

export async function embedding(input: string) {
  const response = await aiRequest('EMBEDDINGS', { input });
  const vector = response.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length < 1 || vector.length > 4096 || !vector.every(Number.isFinite)) throw Error();
  const magnitude = Math.hypot(...vector);
  if (!magnitude || !Number.isFinite(magnitude)) throw Error();
  return vector.map(value => value / magnitude);
}
