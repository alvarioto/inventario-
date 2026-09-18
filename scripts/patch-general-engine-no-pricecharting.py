from pathlib import Path
import re

core_path=Path('src/lib/ai-core.mjs')
text=core_path.read_text(encoding='utf-8')

# ---- 1. Remove PriceCharting API implementation entirely ----
text=re.sub(r"\nfunction centsValue\(value\)\{.*?\n\}\n\nexport async function fetchPriceChartingGuide\(.*?\n\}\n\nexport function parsePublicListings",
            "\nexport function parsePublicListings",text,flags=re.S)

# ---- 2. Generic physical-object-first classifier ----
generic_classifier=r'''function correctCollectibleType(row){
 if(!row)return row;
 if(row.type==='funko'||/\bfunko\b|\bpop!?\b/i.test(`${row.manufacturer||''} ${row.line||''}`))return row;
 const manufacturer=normalizeComparableText(row.manufacturer);
 const line=normalizeComparableText(row.line);
 const evidence=normalizeComparableText(`${row.title||''} ${row.edition||''} ${row.explanation||''} ${Array.isArray(row.tags)?row.tags.join(' '):''}`);
 const scores={figure:0,comic:0,manga:0,card:0,game:0,lego:0,plush:0,replica:0,movie:0,merch:0};
 const add=(type,re,weight=3)=>{if(re.test(evidence)||re.test(line)||re.test(manufacturer))scores[type]+=weight;};

 add('figure',/\baction figure\b|\bfigura articulada\b|\barticulated figure\b|\bblister\b|\bblister card\b|\bcarded figure\b|\bmuneco articulado\b|\binterchangeable accessories\b|\baccesorios intercambiables\b|\bfigurine\b|\bstatue\b|\bmaquette\b/,6);
 if(/^(hasbro|mattel|mcfarlane toys|neca|mezco|bandai|super7|jazwares|spin master)$/.test(manufacturer))scores.figure+=5;
 if(/\bmarvel legends\b|\bblack series\b|\bmasters of the universe\b|\bgi joe classified\b|\bclassified series\b|\bmafex\b|\bsh figuarts\b/.test(line))scores.figure+=7;

 add('comic',/\bcomic book\b|\bgrapas?\b|\bsingle issue\b|\bissue #?\d+\b|\bcomic de grapa\b|\bpaginas?\b|\bpages?\b/,5);
 add('manga',/\bmanga\b|\btankobon\b|\btomo\s*\d+\b|\bvolume?\s*\d+\b/,5);
 if(String(row.isbn||'').trim()){scores.comic+=1;scores.manga+=2;}

 add('card',/\btrading card\b|\btcg\b|\bcollectible card\b|\bcarta coleccionable\b|\bslab\b|\bpsa\b|\bbgs\b|\bcgc card\b/,6);
 if(String(row.cardNumber||'').trim()||String(row.setName||'').trim()||row.graded)scores.card+=5;

 add('game',/\bvideo game\b|\bvideojuego\b|\bgame cartridge\b|\bcartucho\b|\bgame disc\b|\bnintendo switch\b|\bplaystation\b|\bxbox\b|\bgame boy\b/,6);
 if(String(row.platform||'').trim())scores.game+=5;

 add('lego',/\blego\b|\bminifigure\b|\bminifig\b|\bbrick set\b|\bconstruction set\b|\bset number\b/,7);
 if(manufacturer==='lego')scores.lego+=9;
 add('plush',/\bplush\b|\bstuffed toy\b|\bstuffed animal\b|\bpeluche\b|\bsoft toy\b/,7);
 add('replica',/\breplica\b|\bprop replica\b|\bhelmet replica\b|\bcasco replica\b|\blightsaber\b|\bespada replica\b|\bprop weapon\b|\b1:?1 scale replica\b/,7);
 add('movie',/\bdvd\b|\bblu ray\b|\b4k uhd\b|\bsteelbook\b|\bvhs\b|\bvideo cassette\b/,6);
 add('merch',/\bt shirt\b|\bcamiseta\b|\bhoodie\b|\bsudadera\b|\bmug\b|\btaza\b|\bpin badge\b|\bposter\b|\bllavero\b|\bkeychain\b/,5);

 const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
 const [bestType,bestScore]=ranked[0];
 const secondScore=ranked[1]?.[1]||0;
 if(bestScore>=5&&bestScore>=secondScore+2&&bestType!==row.type)return {...row,type:bestType};
 return row;
}'''
text,n=re.subn(r"function correctCollectibleType\(row\)\{.*?\n\}\n\nfunction finalizeIdentification",generic_classifier+"\n\nfunction finalizeIdentification",text,flags=re.S,count=1)
if n!=1: raise SystemExit('Could not replace physical classifier')

# ---- 3. Research identity by actual object family ----
identity_fn=r'''export function buildResearchIdentity(item){
 const title=!isGenericProductTitle(item?.title)?String(item.title).trim():'';
 const isFunko=item?.type==='funko'||/\bfunko\b|\bpop!?\b/i.test(`${title} ${item?.manufacturer||''} ${item?.line||''}`);
 if(isFunko){
  const {row,name,popNumber,variant}=funkoMatchParts({...item,type:'funko'});
  const special=/^(normal|standard|regular|classic)$/i.test(variant)?'':variant;
  const category=String(row.funkoCategory||'').trim();
  const categoryHint=/kinder|promotional/i.test(category)?'Kinder':/bitty/i.test(category)?'Bitty':/pocket/i.test(category)?'Pocket':/mystery minis?/i.test(category)?'Mystery Minis':/soda/i.test(category)?'Funko Soda':(!category||/pop!? regular/i.test(category)?'':category);
  const concise=[name,popNumber,categoryHint,special].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  if(concise)return concise;
  const sku=String(item?.sku||'').trim(),barcode=String(item?.barcode||'').replace(/\s/g,'');
  return sku?`Funko ${sku}`:barcode?`Funko ${barcode}`:'Funko';
 }
 const sku=String(item?.sku||'').trim(),barcode=String(item?.barcode||'').replace(/\s/g,'');
 const manufacturer=String(item?.manufacturer||'').trim(),line=String(item?.line||'').trim();
 if(item?.type==='figure'){
  const cleaned=title.replace(/\bmarvel\s+comics\b/gi,' ').replace(/\bdc\s+comics\b/gi,' ').replace(/\s+/g,' ').trim();
  return [manufacturer,line,cleaned||item?.character,sku||barcode].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 }
 if(item?.type==='comic'||item?.type==='manga')return [title||item?.character,item?.issueNumber?`#${item.issueNumber}`:'',item?.volume?`Vol ${item.volume}`:'',item?.edition,item?.isbn].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 if(item?.type==='card')return [item?.franchise||line||title,item?.setName,item?.cardNumber,item?.rarity,item?.gradingCompany,item?.grade].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 if(item?.type==='game')return [title,item?.platform,item?.edition,sku||barcode].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 if(item?.type==='lego')return ['LEGO',sku||barcode,title,line].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 if(['plush','replica','merch','movie'].includes(item?.type))return [manufacturer,title||item?.character,line,item?.edition,sku||barcode].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 return (title||String(item?.character||'').trim()||manufacturer||line).replace(/\s+/g,' ').trim();
}'''
text,n=re.subn(r"export function buildResearchIdentity\(item\)\{.*?\n\}\n\nfunction specificTitleScore",identity_fn+"\n\nfunction specificTitleScore",text,flags=re.S,count=1)
if n!=1: raise SystemExit('Could not replace buildResearchIdentity')

# ---- 4. Source policy: broad collector sources, no PriceCharting ----
source_type=r'''function sourceTypeFor(source){
 const host=hostOf(source?.url);
 const searchable=`${source?.title||''} ${source?.snippet||''}`.toLowerCase();
 if((host.startsWith('ebay.')||host.includes('.ebay.'))&&(/\bsold\b|vendid[oa]s?|completed|final price|precio final/.test(searchable)||String(source?.kind||'').includes('sold')))return 'sold';
 if(host==='hobbydb.com'||host.endsWith('.hobbydb.com'))return 'guide';
 if(host==='stockx.com'||host.endsWith('.stockx.com')||host==='cardmarket.com'||host.endsWith('.cardmarket.com')||host==='bricklink.com'||host.endsWith('.bricklink.com'))return 'market';
 return marketplaceName(source?.url)?'market':'shop';
}'''
text,n=re.subn(r"function sourceTypeFor\(source\)\{.*?\n\}",source_type,text,flags=re.S,count=1)
if n!=1: raise SystemExit('Could not replace sourceTypeFor')

allowed=r'''function allowedPricingSource(source){
 const host=hostOf(source?.url);
 if(!host)return false;
 if(/(^|\.)(google|bing|youtube|facebook|instagram|pinterest|wikipedia)\./.test(host))return false;
 return true;
}'''
text,n=re.subn(r"function allowedPricingSource\(source\)\{.*?\n\}",allowed,text,flags=re.S,count=1)
if n!=1: raise SystemExit('Could not replace allowedPricingSource')

score=r'''function pricingSourceScore(item,source){
 const host=hostOf(source?.url),raw=`${source?.title||''} ${source?.snippet||''}`;
 let score=extractMoneyPrices(raw).length?100:0;
 const ids=[item?.sku,item?.barcode,item?.isbn,item?.cardNumber,item?.issueNumber].filter(Boolean).map(x=>normalizeComparableText(x));
 const hay=normalizeComparableText(raw);
 if(ids.some(id=>id&&hay.includes(id)))score+=90;
 if(item?.type==='funko'&&funkoTextMatches(item,raw))score+=80;
 let path='';try{path=new URL(source.url).pathname.toLowerCase()}catch{}
 if(host.includes('hobbydb.com')&&/\/catalog_items\/[^/?]+/.test(path))score+=50;
 if(host.includes('ebay.')&&/\/itm\//.test(path))score+=25;
 if(host.includes('idealo.')||host.includes('cardmarket.')||host.includes('bricklink.')||host.includes('todocoleccion.')||host.includes('catawiki.')||host.includes('cex.')||host.includes('webuy.'))score+=20;
 return score;
}'''
text,n=re.subn(r"function pricingSourceScore\(item,source\)\{.*?\n\}",score,text,flags=re.S,count=1)
if n!=1: raise SystemExit('Could not replace pricingSourceScore')

limit=r'''function limitPricingSources(rows,item=null){
 const ordered=item?prioritizePricingSources(item,rows):rows;
 const seen=new Map();
 return ordered.filter(allowedPricingSource).filter(source=>{
  const host=hostOf(source.url)||'other';
  const n=seen.get(host)||0,max=host.includes('ebay.')?3:2;
  if(n>=max)return false;seen.set(host,n+1);return true;
 }).slice(0,8);
}'''
text,n=re.subn(r"function limitPricingSources\(rows,item=null\)\{.*?\n\}",limit,text,flags=re.S,count=1)
if n!=1: raise SystemExit('Could not replace limitPricingSources')

# Remove obsolete PriceCharting-specific fallback shortcuts.
text=re.sub(r"\n\s*if\(String\(listing\.id\|\|''\)\.startsWith\('pricecharting-api-'\)\)return true;",'',text)
text=re.sub(r"\n\s*if\(hostOf\(listing\.url\)\.includes\('pricecharting\.com'\).*?return true;",'',text)
text=text.replace("(PriceCharting|hobbyDB|eBay|StockX|Amazon|Wallapop)","(hobbyDB|eBay|StockX|Amazon|Wallapop|Cardmarket|BrickLink|Idealo)")

# ---- 5. Replace web search engine with per-category collector strategies ----
web_fn=r'''export async function deepseekWebSearch(query,{key,model='deepseek-flash',fetcher=fetch,searchMode='general'}){
 if(!key)throw new Error('Falta configurar DEEPSEEK_API_KEY en el servidor.');
 const exactQuery=String(query||'').replace(/\s+/g,' ').trim();
 const modeText={
  identity:'IDENTIDAD: localiza el PRODUCTO EXACTO usando referencia/SKU/EAN/UPC, fabricante y nombre comercial. No tasar todavía.',
  funko:'FUNKO: hobbyDB/Pop Price Guide es la referencia principal. Encuentra exactamente personaje, número Pop y variante. Contrasta después con eBay y StockX. Nunca mezcles Chase/Classic, stickers o acabados.',
  figure:'FIGURA/ESTATUA: busca la figura física exacta. Prioriza SKU/EAN, fabricante, línea y personaje. Busca eBay, Idealo y tiendas con la referencia exacta. Descarta cómics, libros, pósteres, accesorios y variantes distintas.',
  card:'CARTA: busca set + número de carta + rareza + grading si existe. Prioriza Cardmarket y eBay. Descarta otras cartas con el mismo personaje.',
  comic:'CÓMIC: busca título + número de issue + edición/ISBN. Prioriza eBay, TodoColeccion y Catawiki. Descarta figuras y merchandising.',
  manga:'MANGA: busca título + tomo/volumen + edición/ISBN. Prioriza eBay, TodoColeccion y tiendas de libros con la edición exacta.',
  game:'VIDEOJUEGO: busca título + plataforma + edición + SKU/EAN. Prioriza eBay, CeX y tiendas con esa referencia. Distingue juego, steelbook y accesorios.',
  lego:'LEGO: busca número de set/SKU antes que el nombre. Prioriza BrickLink y eBay; descarta minifiguras sueltas si se busca el set completo.',
  plush:'PELUCHE: busca fabricante + personaje + línea + SKU/EAN. Prioriza eBay, Idealo y tiendas con coincidencia exacta.',
  replica:'RÉPLICA/PROP: busca fabricante + objeto + escala/edición + SKU/EAN. Prioriza eBay, Idealo y tiendas especializadas.',
  movie:'EDICIÓN AUDIOVISUAL: busca título + formato (Blu-ray/4K/DVD/Steelbook) + edición + EAN. Prioriza eBay y tiendas con esa edición exacta.',
  merch:'MERCHANDISING: busca fabricante + producto + franquicia + SKU/EAN. Prioriza eBay, Idealo y tiendas con referencia exacta.',
  general:'COLECCIONABLE: identifica y tasa el objeto físico exacto usando códigos, fabricante, línea y nombre. Evita resultados de otro tipo de objeto aunque compartan franquicia.'
 }[searchMode]||'COLECCIONABLE: busca el producto físico exacto.';
 const requestText=`${modeText}\n\nProducto: ${exactQuery}. Usa como máximo 4 búsquedas web. Devuelve solo resultados del mismo objeto físico y, para cada precio útil, conserva importe, moneda, título y URL. Si hay SKU/EAN/ISBN/número de set/carta/issue, trátalo como identificador fuerte. No inventes precios ni uses resultados ambiguos.`;
 const response=await fetcher('https://api.deepseek.com/anthropic/v1/messages',{
  method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'},
  body:JSON.stringify({model,max_tokens:1400,messages:[{role:'user',content:requestText}],tools:[{type:'web_search_20250305',name:'web_search',max_uses:4,user_location:{type:'approximate',country:'ES',timezone:'Europe/Madrid'}}],tool_choice:{type:'auto'},stream:false}),
  signal:AbortSignal.timeout(28000)
 });
 if(!response.ok){const body=await response.text().catch(()=> '');throw new Error(`Búsqueda pública HTTP ${response.status}${body?`: ${body.slice(0,220)}`:''}`);}
 return webSearchSources(await response.json());
}'''
text,n=re.subn(r"export async function deepseekWebSearch\(query,\{.*?\n\}\n\nfunction parseDeepSeekJson",web_fn+"\n\nfunction parseDeepSeekJson",text,flags=re.S,count=1)
if n!=1: raise SystemExit('Could not replace deepseekWebSearch')

# ---- 6. Strengthen multimodal physical-object instruction globally ----
text=re.sub(r"TIPO DE OBJETO CRÍTICO: clasifica por el OBJETO FÍSICO visible,.*?Usa type=comic solo cuando el objeto físico sea realmente una publicación con páginas, grapas o lomo\.",
 "TIPO DE OBJETO CRÍTICO: clasifica primero la NATURALEZA FÍSICA visible: figura/estatua, publicación con páginas, carta, videojuego físico, LEGO/construcción, peluche, réplica/prop, soporte audiovisual o merchandising. Logos, franquicias y arte del embalaje son evidencia secundaria. Una figura en blister sigue siendo figure aunque el cartón diga MARVEL COMICS; una carta con arte de videojuego sigue siendo card; un steelbook ilustrado no es comic. type=comic exige una publicación física con páginas/grapas/lomo.",text,flags=re.S)
text=re.sub(r"TIPO DE OBJETO CRÍTICO: decide type por el objeto físico real,.*?type=comic exige que el objeto físico sea una publicación con páginas/grapas/lomo\.",
 "TIPO DE OBJETO CRÍTICO: decide type por la NATURALEZA FÍSICA del objeto antes de leer logos o franquicias. Distingue figura/estatua, cómic/manga físico, carta, videojuego, LEGO, peluche, réplica, soporte audiovisual y merchandising. El texto del packaging nunca decide por sí solo el tipo. type=comic exige una publicación real con páginas/grapas/lomo.",text,flags=re.S)

# ---- 7. Rewrite research without any PriceCharting path ----
research_fn=r'''export async function research(input,config){
 let {item}=researchSchema.parse(input);
 const isFunko=item.type==='funko'||/\bfunko\b|\bpop!?\b/i.test(`${item.title||''} ${item.manufacturer||''} ${item.line||''}`);
 if(isFunko)item=deriveFunkoFields({...item,type:'funko'});
 let identity=buildResearchIdentity(item)||String(item.title||'').trim();
 const fetcher=config.fetcher||fetch,warnings=[];
 let webSources=[],usdEurRate=null;
 if(config.key){
  try{
   const exactQuery=(isFunko?identity.normalize('NFD').replace(/[\u0300-\u036f]/g,''):identity).trim();
   const mode=isFunko?'funko':(['figure','card','comic','manga','game','lego','plush','replica','movie','merch'].includes(item.type)?item.type:'general');
   const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:mode}),'price-search');
   const relevant=prioritizePricingSources(item,relevantSourcesForItem(item,keepUsableSources(found).filter(allowedPricingSource)));
   webSources=limitPricingSources(uniqueSources(relevant),item);
  }catch(error){warnings.push(error instanceof Error?`Búsqueda de precios: ${error.message}`:'No se pudo completar la búsqueda de precios.');}
 }else warnings.push('No hay proveedor de búsqueda pública configurado.');

 if(isFunko&&config.hobbyDbReader){
  webSources=webSources.filter(source=>!['hobbydb.com','www.hobbydb.com'].includes(hostOf(source.url)));
  try{webSources.unshift(...normalizeSources([await config.hobbyDbReader(item)],'hobbydb-browser'));}
  catch(error){warnings.push(error instanceof Error?error.message:'No se pudo abrir Price Guide en hobbyDB.');}
 }
 const canonical=canonicalTitleFromSources(item,webSources);
 let resolvedIdentity;
 if(canonical&&canonical!==item.title){item={...item,title:canonical};identity=buildResearchIdentity(item)||canonical;resolvedIdentity={title:canonical,manufacturer:item.manufacturer||'',line:item.line||'',character:item.character||'',franchise:item.franchise||'',sku:item.sku||'',barcode:item.barcode||''};}
 let usedFallbackRate=false;
 if(webSources.some(source=>/\$|\bUSD\b/i.test(`${source.title} ${source.snippet}`))){
  usdEurRate=await fetchUsdEurRate(fetcher);
  if(usdEurRate==null){usdEurRate=.87;usedFallbackRate=true;warnings.push('No se pudo obtener el cambio USD/EUR en directo; se usa una conversión orientativa para conservar el precio público encontrado.');}
 }
 const listings=parsePublicListings(webSources,{USD_EUR:usdEurRate});
 const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,8);
 const hobbyDbEstimated=isFunko?comparables.filter(row=>{const source=webSources.find(current=>current.url===row.url||current.id===row.id);const raw=`${source?.title||''} ${source?.snippet||''} ${row.title||''} ${row.condition||''}`;return hostOf(row.url).includes('hobbydb.com')&&/\bestimated\s+value\b/i.test(raw);}):[];
 const asking=summarizeListings(isFunko?hobbyDbEstimated:comparables);
 if(isFunko&&!asking.count)warnings.push('hobbyDB no devolvió un “Estimated Value” verificable. El resto de precios se mantiene como referencia orientativa.');
 const sources=limitPricingSources(uniqueSources(webSources),item);
 const exchangeRates=isFunko?await fetchDisplayCurrencyRates(fetcher,usdEurRate):{};
 if(!listings.length)warnings.push('No se encontró un precio visible para el producto exacto; se han descartado páginas bloqueadas, ambiguas o sin importe.');
 else if(!comparables.length)warnings.push('Se detectaron precios, pero ninguno coincide con suficiente precisión con esta referencia/edición.');
 let summary,facts=[];
 if(asking.count){
  const range=asking.min===asking.max?euro(asking.min):`${euro(asking.min)} – ${euro(asking.max)}`;
  const baremo=`${range}; mediana ${euro(asking.median)} con ${asking.count} comparable${asking.count===1?'':'s'} exacto${asking.count===1?'':'s'}.`;
  summary=isFunko?`Valor principal tomado del “Estimated Value” de hobbyDB Price Guide.${usedFallbackRate?' Conversión USD/EUR orientativa.':''}`:`Valoración calculada localmente a partir de precios públicos del producto físico exacto.${usedFallbackRate?' Conversión USD/EUR orientativa.':''} ${baremo}`;
  facts=[{label:isFunko?'hobbyDB Estimated Value':'Baremo de mercado',value:baremo,sourceId:sources[0]?.id||comparables[0].id},...comparables.slice(0,8).map(row=>({label:row.sourceType==='guide'?'Valor principal':'Referencia orientativa',value:`${euro(row.price)} · ${row.condition}`,sourceId:sources[0]?.id||row.id}))];
 }else summary=`Se buscaron precios usando una única identidad: “${identity}”. ${sources.length} página${sources.length===1?'':'s'} útil${sources.length===1?'':'es'} y ${listings.length} precio${listings.length===1?'':'s'} detectado${listings.length===1?'':'s'}; ninguno permite todavía un baremo suficientemente exacto.`;
 const soldRows=comparables.filter(x=>x.sourceType==='sold'&&x.currency==='EUR'),soldSummary=summarizeListings(soldRows);
 return {checkedAt:new Date().toISOString(),searchIdentity:identity,resolvedIdentity,summary,facts,sources,listings,comparables,asking,exchangeRates,sold:{available:soldRows.length>0,count:soldRows.length,median:soldSummary.median,reason:soldRows.length?'Ventas cerradas detectadas entre los comparables exactos.':'No se detectó una venta cerrada verificable entre los comparables exactos.'},warnings,links:{ebay:'https://www.ebay.es/sch/i.html?_nkw='+encodeURIComponent(identity),sold:'https://www.ebay.es/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw='+encodeURIComponent(identity),web:'https://www.google.com/search?q='+encodeURIComponent(identity+' precio'),...(isFunko?{ppg:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?q='+encodeURIComponent(identity),stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)}:{})}};
}'''
text,n=re.subn(r"export async function research\(input,config\)\{.*\Z",research_fn+"\n",text,flags=re.S,count=1)
if n!=1: raise SystemExit('Could not replace research')

# No PriceCharting token/string should remain in runtime core.
for banned in ['PriceCharting','pricecharting.com','priceChartingToken']:
 if banned in text: raise SystemExit(f'Banned runtime reference remains in ai-core: {banned}')
core_path.write_text(text,encoding='utf-8')

# ---- Direct browser config: remove token storage/sync and provider-specific errors ----
direct=Path('src/lib/direct-ai.ts')
d=direct.read_text(encoding='utf-8')
d=re.sub(r"\nconst priceChartingStorageKey.*?\nfunction scopedPriceChartingKey\(\).*?\n",'\n',d,count=1)
d=re.sub(r"\nexport function getPriceChartingToken\(\): string \{.*?\n\}\n\n// One-time private activation",'\n// One-time private activation',d,flags=re.S,count=1)
d=re.sub(r"\n\s*const priceSaved = await getDoc\(doc\(db, 'users', user.uid, 'settings', 'pricecharting'\)\);\n\s*const priceToken = priceSaved\.data\(\)\?\.token;\n\s*if \(typeof priceToken === 'string'.*?\n",'\n',d,count=1)
d=re.sub(r"const directFetch: typeof fetch = async \(input, init\) => \{.*?\n\};\nfunction config\(\) \{",'''const directFetch: typeof fetch = async (input, init) => {
  try { return await fetch(input, init); }
  catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new Error('DeepSeek ha tardado demasiado. Vuelve a intentarlo.');
    throw new Error('No se pudo conectar directamente con DeepSeek. Comprueba la conexión; si persiste, el proveedor puede estar bloqueando las peticiones del navegador.');
  }
};
function config() {''',d,flags=re.S,count=1)
d=d.replace("  // PriceCharting documenta CORS para peticiones desde navegador, así que usamos\n  // el token privado que ya guarda FrikiVault en este dispositivo/cuenta.\n",'')
d=d.replace("return { key, model: 'deepseek-flash', fetcher: directFetch, priceChartingToken: getPriceChartingToken(),","return { key, model: 'deepseek-flash', fetcher: directFetch,")
for banned in ['PriceCharting','pricecharting','priceCharting']:
 if banned in d: raise SystemExit(f'Banned reference remains in direct-ai: {banned}')
direct.write_text(d,encoding='utf-8')

# ---- Settings UI: DeepSeek only ----
settings=Path('src/components/DirectAiSettings.tsx')
settings.write_text("""import { useState, useEffect } from 'react';
import { getPersonalKey, savePersonalKey, removePersonalKey, testDirect, syncPersonalKey } from '../lib/direct-ai';

export function DirectAiSettings() {
  const [key, setKey] = useState('');
  const [configured, setConfigured] = useState(() => Boolean(getPersonalKey()));
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { const refresh=()=>setConfigured(Boolean(getPersonalKey())); window.addEventListener('frikivault-ai-ready',refresh); return()=>window.removeEventListener('frikivault-ai-ready',refresh); }, []);
  async function connect(){setBusy(true);setMessage('Comprobando DeepSeek…');try{if(key.trim()){savePersonalKey(key,remember);setKey('');}else if(remember&&getPersonalKey())savePersonalKey(getPersonalKey(),true);setConfigured(Boolean(getPersonalKey()));await testDirect();await syncPersonalKey();setMessage('Conexión comprobada y clave sincronizada con tu cuenta.');}catch(e){setMessage(e instanceof Error?e.message:'No se pudo comprobar la conexión.');}finally{setBusy(false);}}
  return <div className=\"panel provider-settings\"><section className=\"settings-integration\"><h3>IA directa · DeepSeek</h3><p className=\"muted\">Analiza fotos, identifica el objeto físico e investiga fuentes públicas según el tipo de coleccionable. {configured?'Clave configurada; pulsa Comprobar conexión para verificarla.':'Añade tu clave personal para conectar.'}</p><label className=\"field\"><span>Clave personal</span><input type=\"password\" autoComplete=\"off\" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} placeholder={configured?'Clave guardada; escribe aquí para cambiarla':'sk-…'}/></label><p className=\"muted\"><label><input type=\"checkbox\" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Recordar en este dispositivo privado</label></p><div className=\"button-stack\"><button className=\"primary\" disabled={busy||(!configured&&!key.trim())} onClick={connect}>{busy?'Comprobando…':key.trim()?'Guardar y comprobar':'Comprobar conexión'}</button>{configured&&<button className=\"secondary\" disabled={busy} onClick={async()=>{try{await removePersonalKey();setConfigured(false);setKey('');setMessage('Clave eliminada de esta sesión y de los ajustes de tu cuenta.');}catch{setMessage('No se pudo eliminar la clave de tu cuenta.');}}}>Borrar clave</button>}</div>{message&&<p className=\"muted\" role=\"status\">{message}</p>}</section></div>;
}
""",encoding='utf-8')

# ---- Server config and env examples ----
server=Path('server/index.mjs');s=server.read_text(encoding='utf-8');s=s.replace(",priceChartingToken:env.PRICECHARTING_API_TOKEN",'');server.write_text(s,encoding='utf-8')
env=Path('.env.server.example');e=env.read_text(encoding='utf-8');e=re.sub(r"# Opcional: API oficial PriceCharting.*?PRICECHARTING_API_TOKEN=\n",'',e);env.write_text(e,encoding='utf-8')

types=Path('src/types.ts');t=types.read_text(encoding='utf-8');t=t.replace(';priceCharting?:string','');types.write_text(t,encoding='utf-8')

# ---- Tests: remove obsolete provider tests and add no-PriceCharting + physical taxonomy regressions ----
tests=Path('tests/core.mjs');q=tests.read_text(encoding='utf-8')
q=q.replace(', fetchPriceChartingGuide','')
q=re.sub(r"\n// PriceCharting realista:.*?(?=\n// También aprovechamos precios públicos)",'\n',q,flags=re.S)
q=re.sub(r"\n// PriceCharting/hobbyDB pueden publicar USD:.*?(?=\n// Con varias fotos)",'\n',q,flags=re.S)
q=q.replace(",priceChartingToken:'a'.repeat(40)",'')
q=q.replace("assert.match(directAiSource,/priceChartingToken/);\nassert.match(directAiSource,/settings', 'pricecharting'/);\nconst coreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');\nassert.match(coreSource,/PriceCharting/);","const coreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');\nassert.doesNotMatch(directAiSource,/pricecharting/i);\nassert.doesNotMatch(coreSource,/pricecharting/i);")
q=q.replace('// Regresión: PriceCharting es prioritario y los botones del formulario conservan su estilo original.','// Regresión: las fuentes de mercado y los botones del formulario conservan su estilo original.')

# Add generic physical regressions once.
marker="assert.equal(weaponXIdentification.sku,'G0644');"
extra=r'''

// La clasificación física es global, no una excepción de Funko/Wolverine.
const physicalCases=[
 {input:{title:'Charizard promo art',type:'comic',manufacturer:'The Pokémon Company',setName:'Scarlet & Violet',cardNumber:'199/165',explanation:'Trading card inside a PSA slab',graded:true},expected:'card'},
 {input:{title:'Batman artwork',type:'comic',manufacturer:'McFarlane Toys',line:'DC Multiverse',explanation:'Articulated action figure in blister packaging'},expected:'figure'},
 {input:{title:'The Last of Us cover art',type:'comic',platform:'PlayStation 5',explanation:'PS5 video game disc in plastic case'},expected:'game'},
 {input:{title:'Grogu',type:'figure',manufacturer:'LEGO',sku:'75318',explanation:'LEGO brick construction set'},expected:'lego'},
 {input:{title:'Pikachu',type:'figure',explanation:'Soft stuffed plush toy made of fabric'},expected:'plush'},
 {input:{title:'Iron Man helmet',type:'figure',explanation:'1:1 scale wearable prop replica helmet'},expected:'replica'}
];
for(const row of physicalCases){const fetcher=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...row.input,confidence:.95})}}]}),{status:200,headers:{'content-type':'application/json'}});const identified=await identify('data:image/jpeg;base64,PHYSICAL',{key:'test',fetcher});assert.equal(identified.type,row.expected);}
'''
if extra.strip() not in q:q=q.replace(marker,marker+extra)
# Ensure no runtime provider reference survives.
q += "\nassert.doesNotMatch(readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8'),/pricecharting/i);\nassert.doesNotMatch(readFileSync(new URL('../src/lib/direct-ai.ts',import.meta.url),'utf8'),/pricecharting/i);\nassert.doesNotMatch(readFileSync(new URL('../src/components/DirectAiSettings.tsx',import.meta.url),'utf8'),/pricecharting/i);\n"
tests.write_text(q,encoding='utf-8')

print('General collector engine applied; PriceCharting removed')
