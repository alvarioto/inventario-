from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing pattern: {label}')
    return text.replace(old, new, 1)

# 1) Restaurar EXACTAMENTE el aspecto anterior de Guardar/Cancelar/Eliminar.
p = Path('src/styles.css')
s = p.read_text()
for line in [
    ".sheet-foot .primary,.sheet-foot .secondary,.sheet-foot .danger{min-height:54px;padding:0 22px;border-radius:14px;font-size:15px;font-weight:800;letter-spacing:.01em}",
    ".sheet-foot .primary{min-width:164px;background:linear-gradient(135deg,#8978ff,#714ff0);box-shadow:0 12px 30px rgba(124,108,242,.34),inset 0 1px 0 rgba(255,255,255,.14)}",
    ".sheet-foot .primary:hover{transform:translateY(-1px);box-shadow:0 15px 34px rgba(124,108,242,.4)}",
    ".sheet-foot .secondary{background:#172238;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}",
    ".sheet-foot .danger{padding-inline:20px}",
    ".result-modal .primary{min-height:52px;border-radius:14px;font-size:15px;font-weight:800}",
]:
    s = s.replace(line + '\n', '')
old_mobile = "@media(max-width:680px){.sheet-foot{gap:10px}.sheet-foot>div{display:flex;gap:9px}.sheet-foot .primary{min-width:146px;min-height:56px;font-size:16px}.sheet-foot .secondary,.sheet-foot .danger{min-height:52px}.valuation-highlight>strong{font-size:29px}.comparable-price{align-items:flex-start}.comparable-price>strong{font-size:13px}}"
new_mobile = "@media(max-width:680px){.valuation-highlight>strong{font-size:29px}.comparable-price{align-items:flex-start}.comparable-price>strong{font-size:13px}}"
s = replace_once(s, old_mobile, new_mobile, 'restore mobile buttons')
p.write_text(s)

# 2) PriceCharting primero + descarte de fuentes rotas.
p = Path('src/lib/ai-core.mjs')
s = p.read_text()

old_unique_end = ''' return [...byUrl.values()];
}

function webSearchSources(response){'''
new_unique_end = ''' return [...byUrl.values()];
}

function sourceLooksBroken(source){
 const text=`${source?.title||''} ${source?.snippet||''}`.toLowerCase();
 return /captcha|verify you are human|verification required|access denied|forbidden|error\\s*(?:403|404|500|502|503)|\\b403\\b|\\b404\\b|page not found|not found|site can.t be reached|server error|temporarily unavailable/.test(text);
}

function keepUsableSources(rows){
 return rows.filter(source=>source?.url&&!sourceLooksBroken(source));
}

function webSearchSources(response){'''
s = replace_once(s, old_unique_end, new_unique_end, 'broken source filter helper')
s = replace_once(s, " return [...byUrl.values()];\n}\n\nexport async function deepseekWebSearch", " return keepUsableSources([...byUrl.values()]);\n}\n\nexport async function deepseekWebSearch", 'filter web search sources')

old_special = " const specialistInstruction=searchMode==='funko'?'\\n\\nMODO FUNKO: busca primero el producto EXACTO (personaje + número/ref + variante) en PriceCharting, StockX y, solo si está públicamente accesible sin verificación, hobbyDB/Pop Price Guide. Si hobbyDB muestra CAPTCHA o verificación humana, NO intentes resolverla ni automatizarla: abandona esa fuente y continúa con PriceCharting, StockX, eBay y otras fuentes públicas. En las guías identifica el valor y, si aparecen varias condiciones, distingue OOB/loose, con caja/CIB y nuevo. En StockX distingue Lowest Ask de cualquier venta histórica explícita. Después busca eBay vendidos/completados; solo llames venta cerrada a una página que indique de forma explícita que se vendió/completó. Evita páginas genéricas si existe una ficha individual. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.': '';"
new_special = " const specialistInstruction=searchMode==='pricecharting'?'\\n\\nMODO PRICECHARTING: busca primero y de forma prioritaria una ficha INDIVIDUAL del producto exacto en pricecharting.com. Devuelve cualquier precio público visible (Loose/OOB, CIB/In Box, New) con su importe explícito y cita esa ficha. No uses hobbyDB ni páginas con CAPTCHA, acceso denegado o error. Si no hay una coincidencia exacta en PriceCharting, indícalo buscando otra ficha del mismo sitio antes de abandonar.':searchMode==='funko'?'\\n\\nMODO FUNKO: PriceCharting es la primera fuente especializada. Después contrasta con StockX, eBay vendidos/completados y tiendas públicas. No uses hobbyDB si requiere CAPTCHA o verificación humana. Distingue OOB/loose, con caja/CIB y nuevo. Solo llames venta cerrada a una página que lo indique explícitamente. Evita lotes, accesorios y variantes distintas. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.': '';"
s = replace_once(s, old_special, new_special, 'PriceCharting search mode')

old_start = ''' const webQuery=`${identity} precio mercado PVP lanzamiento eBay Wallapop España`.trim();
 const sources=[],warnings=[],listings=[];
 const fetcher=config.fetcher||fetch;
 let webSources=[];

 if(config.braveKey){'''
new_start = ''' const webQuery=`${identity} precio mercado PVP lanzamiento eBay Wallapop España`.trim();
 const sources=[],warnings=[],listings=[];
 const fetcher=config.fetcher||fetch;
 const priceChartingSupported=isFunko||['game','card','comic','lego'].includes(item.type);
 let webSources=[];
 let usdEurRate=null;
 let priceChartingListings=[];

 // PRIMERA FUENTE: API oficial de PriceCharting cuando hay token. Se consulta antes
 // que cualquier búsqueda web y su coincidencia exacta siempre entra en el baremo.
 if(config.priceChartingToken&&priceChartingSupported){
  usdEurRate=await fetchUsdEurRate(fetcher);
  try{
   const pc=await fetchPriceChartingGuide(item,config.priceChartingToken,fetcher,usdEurRate);
   webSources=keepUsableSources(uniqueSources([...webSources,...pc.sources]));
   priceChartingListings=pc.listings;
  }catch{
   // Una API sin coincidencia o temporalmente no disponible no debe ensuciar la ficha:
   // seguimos con la búsqueda pública y omitimos el error técnico como pidió el usuario.
  }
 }

 // Sin token, intentamos primero localizar la ficha pública de PriceCharting mediante
 // la búsqueda web. No sustituye a la API, pero mantiene PriceCharting como prioridad.
 if(!config.priceChartingToken&&priceChartingSupported&&config.key){
  try{
   const pcPublic=normalizeSources(await deepseekWebSearch(`${identity} site:pricecharting.com price value loose cib new`,{...config,searchMode:'pricecharting'}),'pricecharting-public');
   webSources=keepUsableSources(uniqueSources([...webSources,...pcPublic]));
  }catch{}
 }

 if(config.braveKey){'''
s = replace_once(s, old_start, new_start, 'PriceCharting first')

s = replace_once(s,
"   webSources=normalizeSources((await response.json()).web?.results||[]);",
"   webSources=keepUsableSources(uniqueSources([...webSources,...normalizeSources((await response.json()).web?.results||[])]));",
'Brave merge')

old_general = ''' if(!webSources.length&&config.key){
  try{
   webSources=normalizeSources(await deepseekWebSearch(webQuery,config),'web');
  }catch(error){
   warnings.push(error instanceof Error?`Búsqueda pública: ${error.message}`:'La búsqueda pública de Internet no está disponible en este momento.');
  }
 }
 if(!webSources.length&&!config.key&&!config.braveKey){
  warnings.push('Búsqueda pública pendiente: falta DEEPSEEK_API_KEY en el servidor.');
 }'''
new_general = ''' if(config.key){
  try{
   const general=normalizeSources(await deepseekWebSearch(webQuery,config),'web');
   webSources=keepUsableSources(uniqueSources([...webSources,...general]));
  }catch{}
 }
 if(!webSources.length&&!priceChartingListings.length&&!config.key&&!config.braveKey){
  warnings.push('No hay ningún proveedor de investigación configurado.');
 }'''
s = replace_once(s, old_general, new_general, 'general web merge and silent broken pages')

old_funko = ''' // Para Funko añadimos una pasada especializada. No sustituye a eBay/tiendas: aporta
 // referencias de PPG/hobbyDB, PriceCharting y StockX cuando exista una ficha exacta.
 if(isFunko&&config.key){
  try{
   const specialistQuery=`${identity} Funko hobbyDB Pop Price Guide PPG PriceCharting StockX value price sold`.trim();
   const specialist=normalizeSources(await deepseekWebSearch(specialistQuery,{...config,searchMode:'funko'}),'funko-specialist');
   webSources=uniqueSources([...webSources,...specialist]);
  }catch(error){
   warnings.push(error instanceof Error?`Fuentes Funko especializadas: ${error.message}`:'No se pudieron consultar las fuentes Funko especializadas.');
  }
 }

 let usdEurRate=null;
 if(config.priceChartingToken||webSources.some(source=>/\\$|\\bUSD\\b/i.test(`${source.title} ${source.snippet}`))){
  usdEurRate=await fetchUsdEurRate(fetcher);
  if(!usdEurRate)warnings.push('Hay referencias en USD pero no se pudo obtener la referencia USD/EUR del ECB; esos importes se conservan, pero no entran en el baremo EUR.');
 }
 const exchangeRates={USD_EUR:usdEurRate};

 let priceChartingListings=[];
 if(config.priceChartingToken&&isFunko){
  try{
   const pc=await fetchPriceChartingGuide(item,config.priceChartingToken,fetcher,usdEurRate);
   webSources=uniqueSources([...webSources,...pc.sources]);
   priceChartingListings=pc.listings;
  }catch(error){
   warnings.push(error instanceof Error?`PriceCharting API: ${error.message}`:'No se pudo consultar PriceCharting API.');
  }
 }'''
new_funko = ''' // Después de PriceCharting, para Funko contrastamos con otras fuentes. hobbyDB
 // queda fuera del flujo automático si necesita CAPTCHA/verificación.
 if(isFunko&&config.key){
  try{
   const specialistQuery=`${identity} Funko PriceCharting StockX eBay sold completed value price`.trim();
   const specialist=normalizeSources(await deepseekWebSearch(specialistQuery,{...config,searchMode:'funko'}),'funko-specialist');
   webSources=keepUsableSources(uniqueSources([...webSources,...specialist]));
  }catch{}
 }

 if(usdEurRate==null&&(config.priceChartingToken||webSources.some(source=>/\\$|\\bUSD\\b/i.test(`${source.title} ${source.snippet}`)))){
  usdEurRate=await fetchUsdEurRate(fetcher);
 }
 const exchangeRates={USD_EUR:usdEurRate};'''
s = replace_once(s, old_funko, new_funko, 'remove hobbyDB dependency and duplicate API call')

s = replace_once(s,
" let initialListings=[...parsePublicListings(webSources,exchangeRates),...priceChartingListings];",
" let initialListings=[...parsePublicListings(webSources.filter(source=>source.kind!=='pricecharting-api'),exchangeRates),...priceChartingListings];",
'avoid duplicate PriceCharting prices')

s = replace_once(s,
"   webSources=uniqueSources([...webSources,...extra]);\n   initialListings=[...parsePublicListings(webSources,exchangeRates),...priceChartingListings];",
"   webSources=keepUsableSources(uniqueSources([...webSources,...extra]));\n   initialListings=[...parsePublicListings(webSources.filter(source=>source.kind!=='pricecharting-api'),exchangeRates),...priceChartingListings];",
'filter extra price sources')

old_none = ''' if(!listings.length){
  warnings.push(`Se localizaron ${webSources.length} páginas coincidentes, pero ninguna expuso un precio en EUR legible en el resultado público. Se mantienen las páginas encontradas para revisión manual.`);
 }'''
new_none = ''' if(!listings.length){
  warnings.push('No se encontró todavía un precio utilizable para el artículo exacto; las páginas bloqueadas, con CAPTCHA o error se han omitido.');
 }'''
s = replace_once(s, old_none, new_none, 'clean no-price warning')

# PriceCharting pública: al ser una guía especializada, permitimos una coincidencia nominal
# algo más flexible que para anuncios genéricos, sin aceptar productos claramente distintos.
old_fallback_piece = '''  const idHits=identifiers.filter(id=>hay.includes(id)).length;
  const tokenHits=tokens.filter(token=>hay.includes(token)).length;
  const ratio=tokens.length?tokenHits/tokens.length:0;
  // Un número/SKU exacto es una señal muy fuerte.'''
new_fallback_piece = '''  const idHits=identifiers.filter(id=>hay.includes(id)).length;
  const tokenHits=tokens.filter(token=>hay.includes(token)).length;
  const ratio=tokens.length?tokenHits/tokens.length:0;
  if(hostOf(listing.url).includes('pricecharting.com')&&(idHits>0||(tokenHits>=2&&ratio>=.34)))return true;
  // Un número/SKU exacto es una señal muy fuerte.'''
s = replace_once(s, old_fallback_piece, new_fallback_piece, 'PriceCharting public comparable priority')

old_links = '''   ...(isFunko?{
    ppg:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?filters%5Bq%5D%5B0%5D='+encodeURIComponent(identity)+'&subvariants=true',
    priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity),
    stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)
   }:{})'''
new_links = '''   ...(priceChartingSupported?{
    priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity)
   }:{}),
   ...(isFunko?{
    stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)
   }:{})'''
s = replace_once(s, old_links, new_links, 'remove hobbyDB link and expose PriceCharting')

p.write_text(s)

# 3) UI: no mostrar hobbyDB ni páginas sin precio como fuentes útiles.
p = Path('src/App.tsx')
s = p.read_text()
s = s.replace(
'''<strong>Sin baremo fiable todavía</strong><small>Hay fuentes, pero ninguna coincidencia de precio ha superado los filtros del artículo exacto.</small>''',
'''<strong>Sin precio automático todavía</strong><small>PriceCharting y las fuentes públicas no han devuelto aún una coincidencia valorable; las páginas rotas o ambiguas se omiten.</small>'''
)
old_sources = '''<div className="source-list"><a href={research.links.ebay} target="_blank" rel="noreferrer">Buscar artículo en eBay</a><a href={research.links.sold} target="_blank" rel="noreferrer">Revisar ventas cerradas</a>{research.links.ppg && <a href={research.links.ppg} target="_blank" rel="noreferrer">PPG / hobbyDB</a>}{research.links.priceCharting && <a href={research.links.priceCharting} target="_blank" rel="noreferrer">PriceCharting</a>}{research.links.stockx && <a href={research.links.stockx} target="_blank" rel="noreferrer">StockX</a>}{research.sources.slice(0, 8).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.kind.includes('pricecharting-api') ? 'PriceCharting API' : source.kind.startsWith('ebay') ? 'eBay público' : 'Fuente'} · {source.title}</a>)}</div>'''
new_sources = '''<div className="source-list"><a href={research.links.ebay} target="_blank" rel="noreferrer">Buscar artículo en eBay</a><a href={research.links.sold} target="_blank" rel="noreferrer">Revisar ventas cerradas</a>{research.links.priceCharting && <a href={research.links.priceCharting} target="_blank" rel="noreferrer">PriceCharting</a>}{research.links.stockx && <a href={research.links.stockx} target="_blank" rel="noreferrer">StockX</a>}{research.sources.filter((source) => !source.url.includes('hobbydb.com') && (source.kind.includes('pricecharting') || research.listings.some((listing) => listing.url === source.url))).slice(0, 8).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.kind.includes('pricecharting-api') ? 'PriceCharting API' : source.kind.startsWith('ebay') ? 'eBay público' : 'Fuente con precio'} · {source.title}</a>)}</div>'''
s = replace_once(s, old_sources, new_sources, 'only useful source links')
p.write_text(s)

# 4) Texto de ajustes: PriceCharting no solo Funko.
p = Path('src/components/DirectAiSettings.tsx')
s = p.read_text()
s = s.replace('La investigación de Funko usará su guía oficial cuando encuentre el producto exacto.', 'La investigación usará PriceCharting como primera guía cuando encuentre el producto exacto.')
s = s.replace('Para Funko, FrikiVault consultará un solo producto por investigación y usará el valor correspondiente a su estado (con caja, sin caja o nuevo) como referencia especializada.', 'FrikiVault consulta PriceCharting antes que la búsqueda web en categorías compatibles (Funko, videojuegos, cartas, cómics y LEGO) y usa el valor correspondiente a su estado como referencia principal.')
p.write_text(s)

# 5) Regresiones mínimas.
p = Path('tests/core.mjs')
s = p.read_text()
append = r'''

// Regresión: PriceCharting es prioritario y los botones del formulario conservan su estilo original.
const currentCoreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');
const currentStylesSource=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
assert.match(currentCoreSource,/PRIMERA FUENTE: API oficial de PriceCharting/);
assert.match(currentCoreSource,/sourceLooksBroken/);
assert.doesNotMatch(currentCoreSource,/ppg:'https:\/\/www\.hobbydb\.com/);
assert.doesNotMatch(currentStylesSource,/\.sheet-foot \.primary,.sheet-foot \.secondary,.sheet-foot \.danger\{min-height:54px/);
'''
if 'Regresión: PriceCharting es prioritario' not in s:
    s = s.replace("\nconsole.log('core tests ok');", append + "\nconsole.log('core tests ok');")
p.write_text(s)
