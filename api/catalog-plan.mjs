const SOURCE_REGISTRY = Object.freeze({
  figureRealm: {
    id: 'figure-realm',
    name: 'Figure Realm',
    role: 'catalog',
    mode: 'manual-search',
    baseUrl: 'https://www.figurerealm.com/actionfigure?action=search',
    categories: ['figure'],
    strengths: ['manufacturer','series','subseries','exclusive','itemNumber','upc','year','height']
  },
  figureStash: {
    id: 'figure-stash',
    name: 'FigureStash',
    role: 'catalog',
    mode: 'manual-search',
    baseUrl: 'https://figurestash.com/action-figure-database',
    categories: ['figure'],
    strengths: ['manufacturer','line','character','wave','variant']
  },
  coleka: {
    id: 'coleka',
    name: 'Coleka',
    role: 'catalog',
    mode: 'manual-search',
    baseUrl: 'https://www.coleka.com/en/other-collections_r657',
    categories: ['figure','plush','replica','merch','other'],
    strengths: ['broad-catalog','brand','franchise','character','variant']
  },
  legendsVerse: {
    id: 'legendsverse',
    name: 'Legendsverse',
    role: 'catalog',
    mode: 'manual-search',
    baseUrl: 'https://legendsverse.com/',
    categories: ['figure'],
    strengths: ['modern-lines','manufacturer','line','character','variant']
  },
  iCollect: {
    id: 'icollect',
    name: 'iCollect Everything',
    role: 'catalog',
    mode: 'manual-search',
    baseUrl: 'https://www.icollecteverything.com/action-figures/',
    categories: ['figure','other'],
    strengths: ['broad-catalog','barcode','brand','line']
  },
  actionFigure411: {
    id: 'actionfigure411',
    name: 'ActionFigure411',
    role: 'catalog',
    mode: 'manual-search',
    baseUrl: 'https://www.actionfigure411.com/',
    categories: ['figure'],
    strengths: ['manufacturer','line','character','release']
  },
  ebay: {
    id: 'ebay',
    name: 'eBay',
    role: 'market-reference',
    mode: 'informational-only',
    baseUrl: 'https://www.ebay.es/sch/i.html',
    categories: ['figure','comic','manga','card','game','funko','lego','plush','replica','movie','merch','other'],
    strengths: ['asking-price','availability']
  }
});

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeScale(value) {
  const raw = clean(value).toLowerCase().replace(/\s/g, '');
  if (!raw) return '';
  const fraction = raw.match(/^(?:1[:\/]?)(\d{1,2})$/);
  if (fraction) return '1:' + fraction[1];
  const inches = raw.match(/^(\d+(?:\.\d+)?)("|in|inch|inches)$/);
  if (inches) return inches[1] + 'in';
  return clean(value);
}

function buildCanonicalIdentity(item = {}) {
  const title = clean(item.title);
  const character = clean(item.character);
  const manufacturer = clean(item.manufacturer);
  const line = clean(item.line);
  const franchise = clean(item.franchise);
  const edition = clean(item.edition);
  const scale = normalizeScale(item.scale);
  const wave = clean(item.wave);
  const year = Number.isFinite(Number(item.year)) && Number(item.year) > 1900 ? Number(item.year) : null;
  const sku = clean(item.sku || item.modelNumber);
  const barcode = clean(item.barcode);
  const exclusive = clean(item.exclusive);

  const strongestId = barcode || sku;
  const descriptive = [
    manufacturer,
    line,
    character || title,
    franchise && !title.toLowerCase().includes(franchise.toLowerCase()) ? franchise : '',
    scale,
    edition,
    exclusive,
    wave,
    year || ''
  ].filter(Boolean);

  return {
    type: clean(item.type || 'other'),
    title,
    character,
    manufacturer,
    line,
    franchise,
    edition,
    scale,
    wave,
    year,
    sku,
    barcode,
    exclusive,
    strongestId,
    query: [...new Set(descriptive)].join(' ').replace(/\s+/g, ' ').trim()
  };
}

function googleSiteSearch(domain, query) {
  return 'https://www.google.com/search?q=' + encodeURIComponent('site:' + domain + ' ' + query);
}

function ebayReferenceUrl(query) {
  return 'https://www.ebay.es/sch/i.html?_nkw=' + encodeURIComponent(query);
}

function sourceSearchUrl(sourceId, query) {
  const source = Object.values(SOURCE_REGISTRY).find(x => x.id === sourceId);
  if (!source) return '';
  if (sourceId === 'ebay') return ebayReferenceUrl(query);
  const domains = {
    'figure-realm': 'figurerealm.com',
    'figure-stash': 'figurestash.com',
    'coleka': 'coleka.com',
    'legendsverse': 'legendsverse.com',
    'icollect': 'icollecteverything.com',
    'actionfigure411': 'actionfigure411.com'
  };
  return googleSiteSearch(domains[sourceId], query);
}

function routeCatalogSources(item = {}) {
  const identity = buildCanonicalIdentity(item);
  const category = identity.type || 'other';

  const orderedIds = category === 'figure'
    ? ['figure-realm','figure-stash','coleka','legendsverse','icollect','actionfigure411']
    : ['coleka','icollect'];

  const catalog = orderedIds
    .map(id => Object.values(SOURCE_REGISTRY).find(x => x.id === id))
    .filter(Boolean)
    .filter(source => source.categories.includes(category) || source.categories.includes('other'))
    .map((source, index) => ({
      ...source,
      priority: index + 1,
      query: identity.query || identity.strongestId || identity.title,
      url: sourceSearchUrl(source.id, identity.query || identity.strongestId || identity.title)
    }));

  const marketReference = {
    ...SOURCE_REGISTRY.ebay,
    query: identity.query || identity.strongestId || identity.title,
    url: ebayReferenceUrl(identity.query || identity.strongestId || identity.title),
    note: 'Solo referencia informativa de anuncios. No determina el valor principal.'
  };

  return {
    identity,
    catalog,
    marketReference,
    pricePolicy: {
      priceChartingUntouched: true,
      ebayInformationalOnly: true,
      noInventedPrice: true
    }
  };
}

export { SOURCE_REGISTRY, normalizeScale, buildCanonicalIdentity, routeCatalogSources };

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Método no permitido.' }));
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    res.statusCode = 200;
    return res.end(JSON.stringify({ status: 'completed', plan: routeCatalogSources(body.item || {}) }));
  } catch (error) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: String(error?.message || 'No se pudo crear el plan de catálogos.') }));
  }
}
