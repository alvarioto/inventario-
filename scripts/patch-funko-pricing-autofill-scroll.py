from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing pattern: {label}')
    return text.replace(old, new, 1)


def replace_block(text, start, end, new_block, label):
    a = text.find(start)
    if a < 0:
        raise SystemExit(f'Missing block start: {label}')
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f'Missing block end: {label}')
    b += len(end)
    return text[:a] + new_block + text[b:]

# --- types.ts ---
p = Path('src/types.ts')
s = p.read_text()
s = replace_once(s,
"export interface MarketListing {id:string;title:string;url:string;price:number;currency:string;shipping:number|null;condition:string}",
"export interface MarketListing {id:string;title:string;url:string;price:number;currency:string;shipping:number|null;condition:string;sourceType?:'sold'|'guide'|'market'|'shop';originalPrice?:number;originalCurrency?:string}",
'market listing source metadata')
s = replace_once(s,
"  sku: string;\n  confidence: number;",
"  sku: string;\n  country: string;\n  language: string;\n  condition: ItemCondition | null;\n  hasBox: boolean | null;\n  sealed: boolean | null;\n  signed: boolean | null;\n  graded: boolean | null;\n  gradingCompany: string;\n  grade: string;\n  confidence: number;",
'identification extra fields')
s = replace_once(s,
"  sold:{available:boolean;reason:string};warnings:string[];links:{ebay:string;sold:string;web:string};",
"  sold:{available:boolean;reason:string;count?:number;median?:number|null};warnings:string[];links:{ebay:string;sold:string;web:string;ppg?:string;priceCharting?:string;stockx?:string};",
'research links and sold stats')
p.write_text(s)

# --- ai-core.mjs ---
p = Path('src/lib/ai-core.mjs')
s = p.read_text()
s = replace_once(s,
" sku:text,\n confidence:z.number().min(0).max(1),",
" sku:text,\n country:text,\n language:text,\n condition:z.enum(['new','like-new','very-good','good','fair','poor']).nullable().default(null),\n hasBox:z.boolean().nullable().default(null),\n sealed:z.boolean().nullable().default(null),\n signed:z.boolean().nullable().default(null),\n graded:z.boolean().nullable().default(null),\n gradingCompany:text,\n grade:text,\n confidence:z.number().min(0).max(1),",
'identification schema extras')
s = replace_once(s,
"  platform:text,\n  language:text,\n  isbn:text,",
"  platform:text,\n  language:text,\n  country:text,\n  gradingCompany:text,\n  grade:text,\n  signed:z.boolean().optional(),\n  graded:z.boolean().optional(),\n  isbn:text,",
'research schema extras')

# Replace field lists in all identification prompts.
s = s.replace(
"barcode,isbn,sku,confidence,explanation,tags",
"barcode,isbn,sku,country,language,condition,hasBox,sealed,signed,graded,gradingCompany,grade,confidence,explanation,tags"
)
s = s.replace(
"confidence entre 0 y 1. year número o null.",
"confidence entre 0 y 1. year número o null. condition debe ser new, like-new, very-good, good, fair, poor o null. hasBox, sealed, signed y graded solo pueden ser true/false cuando la foto lo respalde claramente; si no se sabe, usa null. country y language describen la edición o el empaque, no la ubicación del propietario. Nunca inventes precio pagado, tienda o fecha de compra, habitación, mueble, balda, caja de almacenaje ni notas personales."
)

old_extract = """function extractEuroPrices(input){
 const values=[];
 const source=String(input||'');
 const patterns=[
  /(?:€|EUR)\\s*([0-9]{1,3}(?:[.][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)/gi,
  /([0-9]{1,3}(?:[.][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)\\s*(?:€|EUR)/gi
 ];
 for(const pattern of patterns){
  for(const match of source.matchAll(pattern)){
   const value=money(match[1]);
   if(value!==null&&!values.includes(value))values.push(value);
  }
 }
 return values;
}"""
new_extract = """function parseCurrencyNumber(value,currency){
 let raw=String(value||'').replace(/\\s/g,'');
 if(!raw)return null;
 if(currency==='USD'){
  if(raw.includes('.')&&raw.includes(','))raw=raw.replace(/,/g,'');
  else if(raw.includes(',')){
   raw=/^\\d{1,3}(?:,\\d{3})+$/.test(raw)?raw.replace(/,/g,''):raw.replace(',','.');
  }
 }else{
  raw=raw.includes(',')&&raw.includes('.')?raw.replace(/\\./g,'').replace(',','.'):raw.replace(',','.');
 }
 const n=Number(raw);
 return Number.isFinite(n)&&n>=0&&n<=100000?n:null;
}

function extractMoneyPrices(input){
 const values=[];
 const source=String(input||'');
 const patterns=[
  {currency:'EUR',re:/(?:€|EUR)\\s*([0-9]{1,3}(?:[.][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)/gi},
  {currency:'EUR',re:/([0-9]{1,3}(?:[.][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)\\s*(?:€|EUR)/gi},
  {currency:'USD',re:/\\$\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)/g},
  {currency:'USD',re:/([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)\\s*USD/gi}
 ];
 for(const {currency,re} of patterns){
  for(const match of source.matchAll(re)){
   const value=parseCurrencyNumber(match[1],currency);
   if(value!==null&&!values.some(x=>x.currency===currency&&x.value===value))values.push({value,currency});
  }
 }
 return values;
}"""
if old_extract not in s:
    raise SystemExit('Missing extractEuroPrices block')
s = s.replace(old_extract, new_extract, 1)

old_marketplace = """function marketplaceName(url){
 const host=hostOf(url);
 if(!host)return '';
 if(host==='ebay.es'||host.endsWith('.ebay.es')||host.startsWith('ebay.'))return 'eBay';
 if(host==='wallapop.com'||host.endsWith('.wallapop.com'))return 'Wallapop';
 if(host==='todocoleccion.net'||host.endsWith('.todocoleccion.net'))return 'TodoColeccion';
 if(host==='catawiki.com'||host.endsWith('.catawiki.com'))return 'Catawiki';
 if(host.startsWith('vinted.')||host.endsWith('.vinted.es'))return 'Vinted';
 if(host==='cardmarket.com'||host.endsWith('.cardmarket.com'))return 'Cardmarket';
 return '';
}"""
new_marketplace = old_marketplace + """

function sourceTypeFor(source){
 const host=hostOf(source?.url);
 const searchable=`${source?.title||''} ${source?.snippet||''}`.toLowerCase();
 if((host.startsWith('ebay.')||host.includes('.ebay.'))&&(/\\bsold\\b|vendid[oa]s?|completed|final price|precio final/.test(searchable)||String(source?.kind||'').includes('sold')))return 'sold';
 if(host==='hobbydb.com'||host.endsWith('.hobbydb.com')||host==='pricecharting.com'||host.endsWith('.pricecharting.com'))return 'guide';
 if(host==='stockx.com'||host.endsWith('.stockx.com'))return 'market';
 return marketplaceName(source?.url)?'market':'shop';
}

async function fetchUsdEurRate(fetcher){
 try{
  const r=await fetcher('https://api.frankfurter.dev/v2/providers/ecb/rate/usd/eur',{signal:AbortSignal.timeout(10000)});
  if(!r.ok)return null;
  const data=await r.json();
  const rate=Number(data?.rate);
  return Number.isFinite(rate)&&rate>0?rate:null;
 }catch{return null}
}"""
if old_marketplace not in s:
    raise SystemExit('Missing marketplaceName block')
s = s.replace(old_marketplace, new_marketplace, 1)

old_parse = """export function parsePublicListings(sources){
 const listings=[];
 const seen=new Set();
 for(const source of sources){
  const prices=extractEuroPrices(`${source.title} ${source.snippet}`);
  if(!prices.length)continue;
  const marketplace=marketplaceName(source.url);
  const host=hostOf(source.url);
  for(const price of prices.slice(0,2)){
   const key=`${source.url}|${price}`;
   if(seen.has(key))continue;
   seen.add(key);
   listings.push({
    id:`market-${listings.length}`,
    title:source.title,
    url:source.url,
    price,
    currency:'EUR',
    shipping:null,
    condition:marketplace?`Precio anunciado · ${marketplace}`:`Precio público detectado · ${host||'web'}`
   });
  }
 }
 return listings;
}"""
new_parse = """export function parsePublicListings(sources,exchangeRates={}){
 const listings=[];
 const seen=new Set();
 for(const source of sources){
  const prices=extractMoneyPrices(`${source.title} ${source.snippet}`);
  if(!prices.length)continue;
  const marketplace=marketplaceName(source.url);
  const host=hostOf(source.url);
  const sourceType=sourceTypeFor(source);
  for(const found of prices.slice(0,3)){
   let price=found.value,currency=found.currency;
   let conversion='';
   if(currency==='USD'&&Number.isFinite(exchangeRates.USD_EUR)){
    price=Number((price*exchangeRates.USD_EUR).toFixed(2));
    currency='EUR';
    conversion=` · ${found.value.toFixed(2)} USD convertidos con referencia ECB`;
   }
   const key=`${source.url}|${found.currency}|${found.value}`;
   if(seen.has(key))continue;
   seen.add(key);
   const label=sourceType==='sold'?'Venta cerrada detectada':sourceType==='guide'?'Guía de valoración':sourceType==='market'?(marketplace?`Precio de mercado · ${marketplace}`:`Mercado en vivo · ${host}`):`Precio de tienda · ${host||'web'}`;
   listings.push({
    id:`market-${listings.length}`,
    title:source.title,
    url:source.url,
    price,
    currency,
    shipping:null,
    condition:`${label}${conversion}`,
    sourceType,
    originalPrice:found.value,
    originalCurrency:found.currency
   });
  }
 }
 return listings;
}"""
if old_parse not in s:
    raise SystemExit('Missing parsePublicListings block')
s = s.replace(old_parse, new_parse, 1)

old_summary = """export function summarizeListings(listings){
 let totals=listings
  .filter(x=>x.currency==='EUR'&&Number.isFinite(x.price)&&x.price>=0)
  .map(x=>x.price+(Number.isFinite(x.shipping)&&x.shipping>=0?x.shipping:0))
  .sort((a,b)=>a-b);

 // Con cinco o más comparables quitamos un extremo por cada lado para que un lote,
 // una errata o un anuncio disparado no destruya el baremo visual.
 if(totals.length>=5)totals=totals.slice(1,-1);
 const n=totals.length;
 return {
  kind:'asking',
  currency:'EUR',
  count:n,
  min:n?totals[0]:null,
  max:n?totals[n-1]:null,
  median:n?(totals[Math.floor((n-1)/2)]+totals[Math.ceil((n-1)/2)])/2:null,
  label:'Baremo de precios públicos comparables encontrados en Internet. Son precios anunciados, no ventas cerradas.'
 };
}"""
new_summary = """export function summarizeListings(listings){
 const eur=listings.filter(x=>x.currency==='EUR'&&Number.isFinite(x.price)&&x.price>=0);
 const sold=eur.filter(x=>x.sourceType==='sold');
 const guides=eur.filter(x=>x.sourceType==='guide');
 // Prioridad: ventas cerradas verificables; si no hay suficientes, guías especializadas
 // (PPG/hobbyDB o PriceCharting); por último mercado/tiendas/anuncios actuales.
 let selected=sold.length>=2?sold:(guides.length?[...sold,...guides]:eur);
 let totals=selected
  .map(x=>x.price+(Number.isFinite(x.shipping)&&x.shipping>=0?x.shipping:0))
  .sort((a,b)=>a-b);
 if(totals.length>=5)totals=totals.slice(1,-1);
 const n=totals.length;
 const kind=sold.length>=2?'sold':guides.length?'guide':'asking';
 const label=kind==='sold'
  ?'Estimación basada prioritariamente en ventas cerradas comparables detectadas.'
  :kind==='guide'
   ?'Estimación basada prioritariamente en guías especializadas de coleccionismo, contrastada con el mercado público.'
   :'Baremo de precios públicos comparables encontrados en Internet; no implica ventas cerradas.';
 return {
  kind,
  currency:'EUR',
  count:n,
  min:n?totals[0]:null,
  max:n?totals[n-1]:null,
  median:n?(totals[Math.floor((n-1)/2)]+totals[Math.ceil((n-1)/2)])/2:null,
  label
 };
}"""
if old_summary not in s:
    raise SystemExit('Missing summarizeListings block')
s = s.replace(old_summary, new_summary, 1)

# Add a search mode to the public web search prompt.
s = replace_once(s,
"export async function deepseekWebSearch(query,{key,model='deepseek-flash',fetcher=fetch}){",
"export async function deepseekWebSearch(query,{key,model='deepseek-flash',fetcher=fetch,searchMode='general'}){",
'deepseek web search signature')
s = replace_once(s,
" const response=await fetcher('https://api.deepseek.com/anthropic/v1/messages',{",
" const specialistInstruction=searchMode==='funko'?'\\n\\nMODO FUNKO: busca primero el producto EXACTO (personaje + número/ref + variante) en hobbyDB/Pop Price Guide, PriceCharting y StockX. En hobbyDB/PPG y PriceCharting identifica el valor/guía y, si aparecen varias condiciones, distingue OOB/loose, con caja/CIB y nuevo. En StockX distingue Lowest Ask de cualquier venta histórica que esté explícitamente indicada. Después busca eBay vendidos/completados; solo llames venta cerrada a una página que indique de forma explícita que se vendió/completó. Evita páginas de categoría genéricas si existe una ficha individual del producto. Si el precio está en USD, conserva USD de forma explícita; la aplicación lo convertirá a EUR con referencia ECB.': '';\n const response=await fetcher('https://api.deepseek.com/anthropic/v1/messages',{",
'specialist instruction variable')
s = replace_once(s,
"No inventes precios, no conviertas un precio sin fuente y no llames \"vendido\" a un anuncio activo.`",
"No inventes precios, no conviertas un precio sin fuente y no llames \"vendido\" a un anuncio activo.${specialistInstruction}`",
'web search prompt specialist append')

# Research: identify Funko and include country/grade in identity.
s = replace_once(s,
" const identity=[\n  item.title,item.manufacturer,item.line,item.edition,item.character,item.setName,item.cardNumber,\n  item.issueNumber,item.volume,item.platform,item.year,item.language,item.barcode,item.isbn,item.sku\n ].filter(Boolean).join(' ');",
" const identity=[\n  item.title,item.manufacturer,item.line,item.edition,item.character,item.setName,item.cardNumber,\n  item.issueNumber,item.volume,item.platform,item.year,item.language,item.country,item.barcode,item.isbn,item.sku,item.gradingCompany,item.grade\n ].filter(Boolean).join(' ');\n const isFunko=item.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(`${item.title||''} ${item.manufacturer||''} ${item.line||''}`);",
'research identity')

anchor = """ if(!webSources.length&&!config.key&&!config.braveKey){
  warnings.push('Búsqueda pública pendiente: falta DEEPSEEK_API_KEY en el servidor.');
 }

 // Si encontramos el artículo pero los resultados no exponen precios, hacemos una"""
insert = """ if(!webSources.length&&!config.key&&!config.braveKey){
  warnings.push('Búsqueda pública pendiente: falta DEEPSEEK_API_KEY en el servidor.');
 }

 // Para Funko añadimos una pasada especializada. No sustituye a eBay/tiendas: aporta
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
 if(webSources.some(source=>/\\$|\\bUSD\\b/i.test(`${source.title} ${source.snippet}`))){
  usdEurRate=await fetchUsdEurRate(fetcher);
  if(!usdEurRate)warnings.push('Se encontraron precios en USD pero no se pudo obtener la referencia USD/EUR del ECB; esos importes se muestran como fuente, pero no entran en el baremo EUR.');
 }
 const exchangeRates={USD_EUR:usdEurRate};

 // Si encontramos el artículo pero los resultados no exponen precios, hacemos una"""
if anchor not in s:
    raise SystemExit('Missing specialist insertion anchor')
s = s.replace(anchor, insert, 1)
s = s.replace("let initialListings=parsePublicListings(webSources);", "let initialListings=parsePublicListings(webSources,exchangeRates);", 1)
s = s.replace("initialListings=parsePublicListings(webSources);", "initialListings=parsePublicListings(webSources,exchangeRates);", 1)

# Candidate source rows carry the actual extracted price so the summarizer can select IDs correctly.
s = replace_once(s,
"  if(source)sources.push({...source,id:listing.id,kind:'market-public'});",
"  if(source)sources.push({...source,id:listing.id,kind:`market-${listing.sourceType||'public'}`,snippet:`Precio candidato: ${listing.currency==='EUR'?euro(listing.price):`${listing.price.toFixed(2)} ${listing.currency}`} · ${listing.condition}. ${source.snippet}`.slice(0,2200)});",
'candidate source evidence')

# Make AI summary aware of source hierarchy.
s = replace_once(s,
"Los precios de anuncios activos NO son ventas cerradas. No atribuyas un precio de compra al propietario.",
"Prioridad para Funko: ventas cerradas explícitas > guías PPG/hobbyDB o PriceCharting > mercado StockX > anuncios/tiendas actuales. Los precios de anuncios activos NO son ventas cerradas. No atribuyas un precio de compra al propietario.",
'summary hierarchy')

# Sold stats and links.
old_return_sold = """  sold:{available:false,reason:'La búsqueda pública no garantiza un histórico fiable de ventas cerradas. El enlace de eBay abre vendidos y completados para contrastarlo.'},
  warnings,
  links:{
   ebay:'https://www.ebay.es/sch/i.html?_nkw='+encodeURIComponent(identity),
   sold:'https://www.ebay.es/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw='+encodeURIComponent(identity),
   web:'https://www.google.com/search?q='+encodeURIComponent(identity+' precio')
  }"""
new_return_sold = """  sold:(()=>{const rows=comparables.filter(x=>x.sourceType==='sold'&&x.currency==='EUR');const summary=summarizeListings(rows);return {available:rows.length>0,count:rows.length,median:summary.median,reason:rows.length?'Se detectaron páginas que indican explícitamente venta cerrada/completada; revisa las fuentes para confirmar variante y estado.':'No se detectó una venta cerrada verificable en las fuentes públicas. El enlace de eBay abre vendidos y completados para contrastarlo.'};})(),
  warnings,
  links:{
   ebay:'https://www.ebay.es/sch/i.html?_nkw='+encodeURIComponent(identity),
   sold:'https://www.ebay.es/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw='+encodeURIComponent(identity),
   web:'https://www.google.com/search?q='+encodeURIComponent(identity+' precio'),
   ...(isFunko?{
    ppg:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?filters%5Bq%5D%5B0%5D='+encodeURIComponent(identity)+'&subvariants=true',
    priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity),
    stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)
   }:{})
  }"""
if old_return_sold not in s:
    raise SystemExit('Missing return sold block')
s = s.replace(old_return_sold, new_return_sold, 1)
p.write_text(s)

# --- App.tsx ---
p = Path('src/App.tsx')
s = p.read_text()
s = replace_once(s,
"    condition: 'like-new',\n    franchise: result.franchise,",
"    condition: result.condition || 'like-new',\n    franchise: result.franchise,",
'use detected condition')
s = replace_once(s,
"    sku: result.sku,\n    tags: result.tags,",
"    sku: result.sku,\n    country: result.country,\n    language: result.language,\n    hasBox: result.hasBox ?? false,\n    sealed: result.sealed ?? false,\n    signed: result.signed ?? false,\n    graded: result.graded ?? false,\n    gradingCompany: result.gradingCompany,\n    grade: result.grade,\n    tags: result.tags,",
'use detected metadata')

form_anchor = """            <Field label=\"Código EAN / UPC\"><input value={draft.barcode || ''} onChange={(e)=>set('barcode',e.target.value)}/></Field>
            <Field label=\"Estado físico\"><select value={draft.condition || 'like-new'}"""
form_new = """            <Field label=\"Código EAN / UPC\"><input value={draft.barcode || ''} onChange={(e)=>set('barcode',e.target.value)}/></Field>
            <Field label=\"SKU / referencia\"><input value={draft.sku || ''} onChange={(e)=>set('sku',e.target.value)} placeholder=\"Referencia del fabricante\"/></Field>
            <Field label=\"País / mercado de la edición\"><input value={draft.country || ''} onChange={(e)=>set('country',e.target.value)} placeholder=\"España, Japón, USA…\"/></Field>
            <Field label=\"Idioma de la edición\"><input value={draft.language || ''} onChange={(e)=>set('language',e.target.value)} placeholder=\"Español, inglés, japonés…\"/></Field>
            {draft.graded && <Field label=\"Empresa de graduación\"><input value={draft.gradingCompany || ''} onChange={(e)=>set('gradingCompany',e.target.value)} placeholder=\"PSA, CGC…\"/></Field>}
            {draft.graded && draft.type !== 'card' && <Field label=\"Grado\"><input value={draft.grade || ''} onChange={(e)=>set('grade',e.target.value)} placeholder=\"9.8, 9.5…\"/></Field>}
            <Field label=\"Estado físico\"><select value={draft.condition || 'like-new'}"""
if form_anchor not in s:
    raise SystemExit('Missing advanced form anchor')
s = s.replace(form_anchor, form_new, 1)

# Add Graded toggle if it isn't already in visible toggles.
s = replace_once(s,
"<Toggle label=\"Firmado\" checked={!!draft.signed} onChange={(v)=>set('signed',v)}/><Toggle label=\"Favorito\"",
"<Toggle label=\"Firmado\" checked={!!draft.signed} onChange={(v)=>set('signed',v)}/><Toggle label=\"Graduado\" checked={!!draft.graded} onChange={(v)=>set('graded',v)}/><Toggle label=\"Favorito\"",
'graded toggle')

s = replace_once(s,
"<div><span>Mediana solicitada</span><b>{research.asking.median == null ? '—' : money(research.asking.median)}</b></div><div><span>Ventas cerradas</span><b>{research.sold.available ? 'Disponible' : 'No verificadas'}</b></div>",
"<div><span>Valor estimado</span><b>{research.asking.median == null ? '—' : money(research.asking.median)}</b></div><div><span>Fuentes especializadas</span><b>{research.sources.filter((source) => source.kind.includes('funko-specialist')).length || '—'}</b></div><div><span>Ventas cerradas</span><b>{research.sold.available ? `${research.sold.count || 1}${research.sold.median != null ? ` · ${money(research.sold.median)}` : ''}` : 'No verificadas'}</b></div>",
'research metric labels')

s = replace_once(s,
"<div className=\"source-list\"><a href={research.links.ebay} target=\"_blank\" rel=\"noreferrer\">Buscar artículo en eBay</a><a href={research.links.sold} target=\"_blank\" rel=\"noreferrer\">Revisar ventas cerradas</a>",
"<div className=\"source-list\"><a href={research.links.ebay} target=\"_blank\" rel=\"noreferrer\">Buscar artículo en eBay</a><a href={research.links.sold} target=\"_blank\" rel=\"noreferrer\">Revisar ventas cerradas</a>{research.links.ppg && <a href={research.links.ppg} target=\"_blank\" rel=\"noreferrer\">PPG / hobbyDB</a>}{research.links.priceCharting && <a href={research.links.priceCharting} target=\"_blank\" rel=\"noreferrer\">PriceCharting</a>}{research.links.stockx && <a href={research.links.stockx} target=\"_blank\" rel=\"noreferrer\">StockX</a>}",
'specialist links UI')
p.write_text(s)

# --- styles.css: stop the whole page/sheet from drifting horizontally on iOS ---
p = Path('src/styles.css')
s = p.read_text()
fix = """

/* iOS/mobile: el cuerpo y la ficha solo deben desplazarse en vertical. */
html,body,#root,.app-shell,.main-shell{max-width:100vw;overflow-x:hidden}
body{overscroll-behavior-x:none}
.modal-backdrop,.item-sheet,.sheet-scroll{max-width:100vw;overflow-x:hidden;overscroll-behavior-x:none;touch-action:pan-y}
.item-sheet,.sheet-scroll,.form-grid,.photo-section,.research-panel,.qr-panel{min-width:0}
.field,.field input,.field select,.field textarea{min-width:0;max-width:100%}
@media(max-width:760px){.item-sheet{width:100vw!important;max-width:100vw!important}.sheet-scroll{width:100%;max-width:100vw}.sheet-foot{max-width:100vw;overflow-x:hidden}}
"""
if 'iOS/mobile: el cuerpo y la ficha solo deben desplazarse' not in s:
    s += fix
p.write_text(s)

# --- tests/core.mjs ---
p = Path('tests/core.mjs')
s = p.read_text()
s = replace_once(s,
"assert.equal(identification.franchise,'');",
"assert.equal(identification.franchise,'');\nassert.equal(identification.condition,null);\nassert.equal(identification.hasBox,null);",
'test identification nullable metadata')
insert_after = """assert.match(shopListings[0].condition,/Precio público detectado/i);"""
# The condition wording changed; update existing assertion and add USD guide regression.
s = s.replace("assert.match(shopListings[0].condition,/Precio público detectado/i);", "assert.match(shopListings[0].condition,/Precio de tienda/i);", 1)
marker = "assert.match(shopListings[0].condition,/Precio de tienda/i);"
addition = """

// PriceCharting/hobbyDB pueden publicar USD: se convierten a EUR solo con una tasa explícita.
const guideListings=parsePublicListings([{id:'guide-1',kind:'funko-specialist',title:'Éomer #1982 Funko POP Movies $20.00',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982',snippet:'CIB Price $20.00'}],{USD_EUR:0.85});
assert.equal(guideListings.length,1);
assert.equal(guideListings[0].price,17);
assert.equal(guideListings[0].currency,'EUR');
assert.equal(guideListings[0].sourceType,'guide');
assert.match(guideListings[0].condition,/Guía de valoración/i);"""
if marker not in s:
    raise SystemExit('Missing shop listing test marker')
s = s.replace(marker, marker+addition, 1)

# Add source/UI regression checks near appSource assertions.
marker2 = "assert.doesNotMatch(inventorySource,/getDocFromServer/);"
addition2 = """
assert.match(appSource,/PPG \/ hobbyDB/);
assert.match(appSource,/País \/ mercado de la edición/);
assert.match(appSource,/Idioma de la edición/);
const coreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');
assert.match(coreSource,/PriceCharting/);
assert.match(coreSource,/funko-specialist/);
assert.match(coreSource,/frankfurter\.dev\/v2\/providers\/ecb\/rate\/usd\/eur/);"""
if marker2 not in s:
    raise SystemExit('Missing tests end marker')
s = s.replace(marker2, marker2+'\n'+addition2, 1)
p.write_text(s)

print('patch applied')
