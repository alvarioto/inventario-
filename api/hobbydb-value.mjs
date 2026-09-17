const TINYFISH_API = 'https://agent.tinyfish.ai/v1';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function tinyfish(path, key, body) {
  const response = await fetch(TINYFISH_API + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`TinyFish HTTP ${response.status}`);
  return response.json();
}

function parseRunResult(run, item) {
  if (run.status !== 'COMPLETED') return null;
  const result = typeof run.result === 'string' ? JSON.parse(run.result) : run.result;
  if (!result || result.status !== 'ok') throw new Error(result?.message || 'hobbyDB no devolvió un valor verificable.');
  const url = new URL(result.url);
  if (url.protocol !== 'https:' || !['hobbydb.com', 'www.hobbydb.com'].includes(url.hostname)) throw new Error('hobbyDB devolvió una ficha no válida.');
  if (normalize(result.character) !== normalize(item.character) || String(result.popNumber) !== String(item.popNumber)) throw new Error('La ficha de hobbyDB no coincide con el Funko identificado.');
  const wantedVariant = normalize(item.funkoVariant || 'Classic') || 'classic';
  if (normalize(result.variant || 'Classic') !== wantedVariant) throw new Error('La variante de hobbyDB no coincide.');
  if (result.currency !== 'USD' || typeof result.amount !== 'number' || !Number.isFinite(result.amount) || result.amount <= 0) throw new Error('El valor de hobbyDB no es válido.');
  if (result.priceGuideClicked !== true || !/Estimated\s+Value/i.test(String(result.evidence || ''))) throw new Error('No se confirmó el Price Guide de hobbyDB.');
  return { amount: result.amount, currency: 'USD', url: url.href, evidence: String(result.evidence || ''), variant: result.variant || 'Classic' };
}

export default async function handler(req, res) {
  const origin = String(req.headers.origin || '');
  const allowedOrigin = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
  if (origin && allowedOrigin && origin !== allowedOrigin) return json(res, 403, { error: 'Origen no autorizado.' });
  if (origin && allowedOrigin) res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido.' });

  try {
    const key = process.env.TINYFISH_API_KEY;
    if (!key) return json(res, 503, { error: 'TinyFish no está configurado.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = body.action || 'start';
    const item = body.item || {};
    if (!item.character || !/^\d{1,5}$/.test(String(item.popNumber || ''))) return json(res, 400, { error: 'Faltan personaje o número Pop.' });

    if (action === 'start') {
      const identity = { character: String(item.character).slice(0, 120), popNumber: String(item.popNumber), variant: String(item.funkoVariant || 'Classic').slice(0, 80) };
      const run = await tinyfish('/automation/run-async', key, {
        url: 'https://www.hobbydb.com/home/Funko',
        browser_profile: 'lite',
        use_profile: true,
        ...(process.env.TINYFISH_PROFILE_ID ? { profile_id: process.env.TINYFISH_PROFILE_ID } : {}),
        goal: `Read only. Find the exact Funko ${identity.character} #${identity.popNumber}, variant ${identity.variant}. Open the matching hobbyDB item. Click the Price Guide / See Value control exactly as a user would. Read ONLY the revealed Estimated Value, never a listing price. Return JSON only: {"status":"ok|blocked|missing","url":"actual item URL","character":"...","popNumber":"...","variant":"Classic or exact variant","amount":37,"currency":"USD","priceGuideClicked":true,"evidence":"Estimated Value $37"}. Never invent a value. If sign-in, CAPTCHA or access denial prevents reading the value, return status blocked. Do not buy, modify, solve CAPTCHA or change account settings.`
      });
      if (!/^[A-Za-z0-9_-]+$/.test(run.run_id || '')) throw new Error('TinyFish no devolvió un identificador de ejecución.');
      return json(res, 202, { runId: run.run_id });
    }

    const runId = String(body.runId || '');
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) return json(res, 400, { error: 'Ejecución no válida.' });
    if (action === 'cancel') {
      await tinyfish(`/runs/${runId}/cancel`, key, {});
      return json(res, 200, { status: 'cancelled' });
    }
    if (action !== 'poll') return json(res, 400, { error: 'Acción no válida.' });

    const run = await tinyfish(`/runs/${runId}?screenshots=none`, key);
    if (run.status === 'FAILED' || run.status === 'CANCELLED') throw new Error('TinyFish no pudo leer el Price Guide.');
    if (run.status !== 'COMPLETED') return json(res, 202, { status: String(run.status || 'RUNNING').toLowerCase() });
    return json(res, 200, { status: 'completed', value: parseRunResult(run, item) });
  } catch (error) {
    return json(res, 502, { error: String(error?.message || 'No se pudo leer hobbyDB.') });
  }
}
