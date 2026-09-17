const HOBBYDB = 'https://www.hobbydb.com';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

async function hobbydbFetch(path, cookie, accept = 'text/html') {
  const response = await fetch(path.startsWith('http') ? path : HOBBYDB + path, {
    method: 'GET',
    headers: {
      Accept: accept,
      Cookie: cookie,
      'User-Agent': 'Mozilla/5.0 FrikiVault/1.0',
      Referer: HOBBYDB + '/marketplaces/hobbydb'
    },
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('La sesión de hobbyDB ha caducado.');
    error.code = 'SESSION_EXPIRED';
    throw error;
  }
  if (!response.ok) throw new Error(`hobbyDB HTTP ${response.status}`);
  return response;
}

function extractCandidates(html) {
  const result = [];
  const seen = new Set();
  const rx = /<a\b[^>]*href=["']([^"']*\/marketplaces\/hobbydb\/catalog_items\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = rx.exec(html))) {
    const rawHref = match[1];
    if (/\/select_type(?:\?|$)/i.test(rawHref)) continue;
    const url = new URL(rawHref, HOBBYDB).href;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = decodeHtml(match[2]);
    if (!title) continue;
    result.push({ url, title });
  }
  return result;
}

function extractTitle(html) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtml(match?.[1] || '');
}

function extractCatalogItemId(html) {
  const patterns = [
    /flag_formCatalogItem(\d{3,})/i,
    /CatalogItem(\d{3,})/,
    /catalog-item-id=["'](\d{3,})["']/i,
    /catalog_item_id=(\d{3,})/i,
    /"catalogItemId"\s*:\s*"?(\d{3,})/i
  ];
  for (const pattern of patterns) {
    const match = String(html).match(pattern);
    if (match) return match[1];
  }
  return null;
}

function candidateScore(item, candidate, detailHtml) {
  const title = normalize(extractTitle(detailHtml) || candidate.title);
  const body = normalize(decodeHtml(detailHtml));
  const character = normalize(item.character);
  const variant = normalize(item.funkoVariant || 'Classic');
  const pop = String(item.popNumber || '').trim();
  const characterTokens = character.split(' ').filter(x => x.length > 1);
  let score = 0;

  if (character && title.includes(character)) score += 35;
  for (const token of characterTokens) if (title.includes(token)) score += 5;
  if (pop && new RegExp(`(^|[^0-9])${pop}([^0-9]|$)`).test(body)) score += 40;
  if (/\bfunko\b|\bpop!?\b/.test(body)) score += 8;
  if (variant && !['classic', 'standard'].includes(variant)) {
    const tokens = variant.split(' ').filter(x => x.length > 2);
    const matched = tokens.filter(x => body.includes(x)).length;
    score += matched * 4;
    if (tokens.length && matched === tokens.length) score += 10;
  }
  return score;
}

async function resolveItem(item, cookie) {
  if (item.hobbydbUrl) {
    const url = new URL(item.hobbydbUrl);
    if (!['hobbydb.com', 'www.hobbydb.com'].includes(url.hostname)) throw new Error('URL de hobbyDB no válida.');
    const response = await hobbydbFetch(url.href, cookie);
    const html = await response.text();
    const id = extractCatalogItemId(html);
    if (!id) throw new Error('No se pudo obtener el ID de la ficha de hobbyDB.');
    return { id, url: url.href, title: extractTitle(html), score: 999 };
  }

  const query = [item.character, item.popNumber, item.funkoVariant && !/^classic$/i.test(item.funkoVariant) ? item.funkoVariant : '']
    .filter(Boolean)
    .join(' ');
  const searchPath = `/marketplaces/hobbydb/catalog_items?filters[q][0]=${encodeURIComponent(query)}`;
  const searchResponse = await hobbydbFetch(searchPath, cookie);
  const searchHtml = await searchResponse.text();
  const candidates = extractCandidates(searchHtml).slice(0, 10);
  if (!candidates.length) throw new Error('No se encontró una ficha candidata en hobbyDB.');

  const checked = [];
  for (const candidate of candidates) {
    try {
      const detailResponse = await hobbydbFetch(candidate.url, cookie);
      const detailHtml = await detailResponse.text();
      const id = extractCatalogItemId(detailHtml);
      if (!id) continue;
      checked.push({
        id,
        url: candidate.url,
        title: extractTitle(detailHtml) || candidate.title,
        score: candidateScore(item, candidate, detailHtml)
      });
    } catch {
      // Ignore one bad candidate and keep checking the rest.
    }
  }

  checked.sort((a, b) => b.score - a.score);
  const best = checked[0];
  if (!best || best.score < 45) throw new Error('No se pudo verificar una ficha exacta de hobbyDB para este Funko.');
  return best;
}

async function readPriceGuide(catalogItemId, cookie) {
  const response = await hobbydbFetch(`/api/price_guide?catalog_item_id=${encodeURIComponent(catalogItemId)}`, cookie, 'application/json');
  const payload = await response.json();
  const attributes = payload?.data?.[0]?.attributes;
  const amount = Number(attributes?.estimated_value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    currency: 'USD',
    timestamp: attributes?.timestamp || null,
    calculatedFor: attributes?.calculated_for || null
  };
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
    const cookie = String(process.env.HOBBYDB_COOKIE || '').trim();
    if (!cookie) return json(res, 503, { error: 'La sesión de hobbyDB no está configurada.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const item = body.item || {};
    if (!item.character || !/^\d{1,5}$/.test(String(item.popNumber || ''))) {
      return json(res, 400, { error: 'Faltan personaje o número Pop.' });
    }

    const match = await resolveItem(item, cookie);
    const guide = await readPriceGuide(match.id, cookie);
    if (!guide) return json(res, 404, { error: 'Sin valor publicado en hobbyDB.' });

    return json(res, 200, {
      status: 'completed',
      value: {
        amount: guide.amount,
        currency: 'USD',
        url: match.url,
        evidence: `Estimated Value $${guide.amount}`,
        variant: item.funkoVariant || 'Classic',
        title: match.title,
        catalogItemId: match.id,
        timestamp: guide.timestamp,
        calculatedFor: guide.calculatedFor
      }
    });
  } catch (error) {
    const message = String(error?.message || 'No se pudo leer hobbyDB.');
    const status = error?.code === 'SESSION_EXPIRED' ? 401 : 502;
    return json(res, status, { error: message });
  }
}
