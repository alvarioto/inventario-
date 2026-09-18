from pathlib import Path
import re

def sub(text, pattern, replacement, label, count=1):
    new, n = re.subn(pattern, lambda m: replacement, text, count=count, flags=re.S)
    if n != count:
        raise SystemExit(f'{label}: expected {count}, got {n}')
    return new

core=Path('src/lib/ai-core.mjs')
text=core.read_text(encoding='utf-8')

# Remove PriceCharting API implementation.
text=sub(text,r"\nfunction centsValue\(value\)\{.*?\n\}\n\nexport async function fetchPriceChartingGuide\(.*?\n\}\n\nexport function parsePublicListings","\nexport function parsePublicListings",'remove PriceCharting API')

# Physical-object-first classifier for every collectible family.
classifier=r'''function correctCollectibleType(row){
 if(!row)return row;
 if(row.type==='funko'||/\bfunko\b|\bpop!?\b/i.test(`${row.manufacturer||''} ${row.line||''}`))return row;
 const manufacturer=normalizeComparableText(row.manufacturer),line=normalizeComparableText(row.line);
 const evidence=normalizeComparableText(`${row.title||''} ${row.edition||''} ${row.explanation||''} ${Array.isArray(row.tags)?row.tags.join(' '):''}`);
 const scores={figure:0,comic:0,manga:0,card:0,game:0,lego:0,plush:0,replica:0,movie:0,merch:0};
 const add=(type,re,weight)=>{if(re.test(evidence)||re.test(line)||re.test(manufacturer))scores[type]+=weight;};
 add('figure',/\baction figure\b|\bfigura articulada\b|\barticulated figure\b|\bblister\b|\bcarded figure\b|\bfigurine\b|\bstatue\b|\bmaquette\b|\binterchangeable accessories\b|\baccesorios intercambiables\b/,6);
 if(/^(hasbro|mattel|mcfarlane toys|neca|mezco|bandai|super7|jazwares|spin master)$/.test(manufacturer))scores.figure+=5;
 if(/\bmarvel legends\b|\bblack series\b|\bdc multiverse\b|\bmasters of the universe\b|\bgi joe classified\b|\bmafex\b|\bsh figuarts\b/.test(line))scores.figure+=7;
 add('comic',/\bcomic book\b|\bgrapas?\b|\bsingle issue\b|\bissue #?\d+\b|\bpages?\b|\bpaginas?\b/,5);
 add('manga',/\bmanga\b|\btankobon\b|\btomo\s*\d+\b|\bvolume?\s*\d+\b/,5);
 if(String(row.isbn||'').trim()){scores.comic+=1;scores.manga+=2;}
 add('card',/\btrading card\b|\btcg\b|\bcollectible card\b|\bcarta coleccionable\b|\bslab\b|\bpsa\b|\bbgs\b|\bcgc card\b/,6);
 if(String(row.cardNumber||'').trim()||String(row.setName||'').trim()||row.graded)scores.card+=5;
 add('game',/\bvideo game\b|\bvideojuego\b|\bgame cartridge\b|\bcartucho\b|\bgame disc\b|\bnintendo switch\b|\bplaystation\b|\bxbox\b|\bgame boy\b/,6);
 if(String(row.platform||'').trim())scores.game+=5;
 add('lego',/\blego\b|\bminifigure\b|\bminifig\b|\bbrick set\b|\bconstruction set\b/,7);if(manufacturer==='lego')scores.lego+=9;
 add('plush',/\bplush\b|\bstuffed toy\b|\bstuffed animal\b|\bpeluche\b|\bsoft toy\b/,7);
 add('replica',/\breplica\b|\bprop replica\b|\bhelmet replica\b|\bcasco replica\b|\blightsaber\b|\bespada replica\b|\b1:?1 scale replica\b/,7);
 add('movie',/\bdvd\b|\bblu ray\b|\b4k uhd\b|\bsteelbook\b|\bvhs\b/,6);
 add('merch',/\bt shirt\b|\bcamiseta\b|\bhoodie\b|\bsudadera\b|\bmug\b|\btaza\b|\bpin badge\b|\bposter\b|\bllavero\b|\bkeychain\b/,5);
 const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]),[bestType,bestScore]=ranked[0],second=ranked[1]?.[1]||0;
 return bestScore>=5&&bestScore>=second+2&&bestType!==row.type?{...row,type:bestType}:row;
}'''
text=sub(text,r"function correctCollectibleType\(row\)\{.*?\n\}\n\nfunction finalizeIdentification",classifier+"\n\nfunction finalizeIdentification",'physical classifier')

# Identity differs by physical product family.
identity=r'''export function buildResearchIdentity(item){
 const title=!isGenericProductTitle(item?.title)?String(item.title).trim():'';
 const isFunko=item?.type==='funko'||/\bfunko\b|\bpop!?\b/i.test(`${title} ${item?.manufacturer||''} ${item?.line||''}`);
 if(isFunko){
  const {row,name,popNumber,variant}=funkoMatchParts({...item,type:'funko'}),special=/^(normal|standard|regular|classic)$/i.test(variant)?'':variant,category=String(row.funkoCategory||'').trim();
  const hint=/kinder|promotional/i.test(category)?'Kinder':/bitty/i.test(category)?'Bitty':/pocket/i.test(category)?'Pocket':/mystery minis?/i.test(category)?'Mystery Minis':/soda/i.test(category)?'Funko Soda':(!category||/pop!? regular/i.test(category)?'':category);
  const concise=[name,popNumber,hint,special].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();if(concise)return concise;
  const sku=String(item?.sku||'').trim(),barcode=String(item?.barcode||'').replace(/\s/g,'');return sku?`Funko ${sku}`:barcode?`Funko ${barcode}`:'Funko';
 }
 const sku=String(item?.sku||'').trim(),barcode=String(item?.barcode||'').replace(/\s/g,''),manufacturer=String(item?.manufacturer||'').trim(),line=String(item?.line||'').trim();
 if(item?.type==='figure'){const cleaned=title.replace(/\bmarvel\s+comics\b/gi,' ').replace(/\bdc\s+comics\b/gi,' ').replace(/\s+/g,' ').trim();return [manufacturer,line,cleaned||item?.character,sku||barcode].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();}
 if(item?.type==='comic'||item?.type==='manga')return [title||item?.character,item?.issueNumber?`#${item.issueNumber}`:'',item?.volume?`Vol ${item.volume}`:'',item?.edition,item?.isbn].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 if(item?.type==='card')return [item?.franchise||line||title,item?.setName,item?.cardNumber,item?.rarity,item?.gradingCompany,item?.grade].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 if(item?.type==='game')return [title,item?.platform,item?.edition,sku||barcode].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 if(item?.type==='lego')return ['LEGO',sku||barcode,title,line].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 if(['plush','replica','merch','movie'].includes(item?.type))return [manufacturer,title||item?.character,line,item?.edition,sku||barcode].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 return (title||String(item?.character||'').trim()||manufacturer||line).replace(/\s+/g,' ').trim();
}'''
text=sub(text,r"export function buildResearchIdentity\(item\)\{.*?\n\}\n\nfunction specificTitleScore",identity+"\n\nfunction specificTitleScore",'identity builder')

# Source classification/policy with no provider lock-in.
source_type=r'''function sourceTypeFor(source){
 const host=hostOf(source?.url),searchable=`${source?.title||''} ${source?.snippet||''}`.toLowerCase();
 if((host.startsWith('ebay.')||host.includes('.ebay.'))&&(/\bsold\b|vendid[oa]s?|completed|final price|precio final/.test(searchable)||String(source?.kind||'').includes('sold')))return 'sold';
 if(host==='hobbydb.com'||host.endsWith('.hobbydb.com'))return 'guide';
 if(host.includes('stockx.com')||host.includes('cardmarket.com')||host.includes('bricklink.com'))return 'market';
 return marketplaceName(source?.url)?'market':'shop';
}'''
text=sub(text,r"function sourceTypeFor\(source\)\{.*?\n\}",source_type,'source type')
allowed=r'''function allowedPricingSource(source){const host=hostOf(source?.url);if(!host)return false;if(/(^|\.)(google|bing|youtube|facebook|instagram|pinterest|wikipedia)\./.test(host))return false;return true;}'''
text=sub(text,r"function allowedPricingSource\(source\)\{.*?\n\}",allowed,'allowed sources')
score=r'''function pricingSourceScore(item,source){
 const host=hostOf(source?.url),raw=`${source?.title||''} ${source?.snippet||''}`,hay=normalizeComparableText(raw);let score=extractMoneyPrices(raw).length?100:0;
 const ids=[item?.sku,item?.barcode,item?.isbn,item?.cardNumber,item?.issueNumber].filter(Boolean).map(x=>normalizeComparableText(x));if(ids.some(id=>id&&hay.includes(id)))score+=90;if(item?.type==='funko'&&funkoTextMatches(item,raw))score+=80;
 let path='';try{path=new URL(source.url).pathname.toLowerCase()}catch{}if(host.includes('hobbydb.com')&&/\/catalog_items\/[^/?]+/.test(path))score+=50;if(host.includes('ebay.')&&/\/itm\//.test(path))score+=25;if(/idealo|cardmarket|bricklink|todocoleccion|catawiki|cex|webuy/.test(host))score+=20;return score;
}'''
text=sub(text,r"function pricingSourceScore\(item,source\)\{.*?\n\}",score,'source score')
limit=r'''function limitPricingSources(rows,item=null){const ordered=item?prioritizePricingSources(item,rows):rows,seen=new Map();return ordered.filter(allowedPricingSource).filter(source=>{const host=hostOf(source.url)||'other',n=seen.get(host)||0,max=host.includes('ebay.')?3:2;if(n>=max)return false;seen.set(host,n+1);return true;}).slice(0,8);}'''
text=sub(text,r"function limitPricingSources\(rows,item=null\)\{.*?\n\}",limit,'source limiter')
text=re.sub(r"\n\s*if\(String\(listing\.id\|\|''\)\.startsWith\('pricecharting-api-'\)\)return true;",'',text)
text=re.sub(r"\n\s*if\(hostOf\(listing\.url\)\.includes\('pricecharting\.com'\).*?return true;",'',text)
text=text.replace("(PriceCharting|hobbyDB|eBay|StockX|Amazon|Wallapop)","(hobbyDB|eBay|StockX|Amazon|Wallapop|Cardmarket|BrickLink|Idealo)")

# Per-category search strategy.
web=r'''export async function deepseekWebSearch(query,{key,model='deepseek-flash',fetcher=fetch,searchMode='general'}){
 if(!key)throw new Error('Falta configurar DEEPSEEK_API_KEY en el servidor.');const exact=String(query||'').replace(/\s+/g,' ').trim();
 const instruction={identity:'Localiza el PRODUCTO EXACTO por SKU/EAN/UPC/ISBN, fabricante y nombre. No tasar todavía.',funko:'FUNKO: hobbyDB/PPG principal; personaje+número+variante exactos; eBay/StockX solo contraste.',figure:'FIGURA/ESTATUA: SKU/EAN + fabricante + línea + personaje. Prioriza eBay, Idealo y tiendas exactas. Descarta cómics/libros/accesorios.',card:'CARTA: set+número+rareza+grading. Prioriza Cardmarket y eBay.',comic:'CÓMIC: título+issue+edición/ISBN. Prioriza eBay, TodoColeccion y Catawiki.',manga:'MANGA: título+tomo+edición/ISBN. Prioriza eBay, TodoColeccion y librerías con esa edición.',game:'VIDEOJUEGO: título+plataforma+edición+SKU/EAN. Prioriza eBay, CeX y tiendas exactas.',lego:'LEGO: número de set/SKU primero. Prioriza BrickLink y eBay.',plush:'PELUCHE: fabricante+personaje+línea+SKU/EAN. Prioriza eBay/Idealo.',replica:'RÉPLICA: fabricante+objeto+escala/edición+SKU/EAN. Prioriza eBay/Idealo.',movie:'AUDIOVISUAL: título+formato+edición+EAN. Prioriza eBay y tiendas exactas.',merch:'MERCH: fabricante+producto+franquicia+SKU/EAN. Prioriza eBay/Idealo.',general:'COLECCIONABLE: usa naturaleza física, códigos, fabricante y línea; no mezcles tipos de objeto.'}[searchMode]||'Busca el producto físico exacto.';
 const request=`${instruction}\n\nProducto: ${exact}. Usa máximo 4 búsquedas. Devuelve solo el mismo objeto físico, con importe, moneda, título y URL. Los identificadores fuertes deben coincidir. No inventes precios.`;
 const response=await fetcher('https://api.deepseek.com/anthropic/v1/messages',{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify({model,max_tokens:1400,messages:[{role:'user',content:request}],tools:[{type:'web_search_20250305',name:'web_search',max_uses:4,user_location:{type:'approximate',country:'ES',timezone:'Europe/Madrid'}}],tool_choice:{type:'auto'},stream:false}),signal:AbortSignal.timeout(28000)});
 if(!response.ok){const body=await response.text().catch(()=> '');throw new Error(`Búsqueda pública HTTP ${response.status}${body?`: ${body.slice(0,220)}`:''}`);}return webSearchSources(await response.json());
}'''
text=sub(text,r"export async function deepseekWebSearch\(query,\{.*?\n\}\n\nfunction parseDeepSeekJson",web+"\n\nfunction parseDeepSeekJson",'web search')

# Prompt corrections: physical nature beats packaging art.
text=re.sub(r"TIPO DE OBJETO CRÍTICO: clasifica por el OBJETO FÍSICO visible,.*?Usa type=comic solo cuando el objeto físico sea realmente una publicación con páginas, grapas o lomo\.","TIPO DE OBJETO CRÍTICO: clasifica primero la NATURALEZA FÍSICA visible: figura/estatua, publicación, carta, videojuego, LEGO, peluche, réplica, audiovisual o merchandising. Logos y arte del packaging son secundarios. Una figura en blister sigue siendo figure aunque el cartón diga MARVEL COMICS. type=comic exige una publicación física con páginas/grapas/lomo.",text,flags=re.S)
text=re.sub(r"TIPO DE OBJETO CRÍTICO: decide type por el objeto físico real,.*?type=comic exige que el objeto físico sea una publicación con páginas/grapas/lomo\.","TIPO DE OBJETO CRÍTICO: decide type por la NATURALEZA FÍSICA antes de leer logos o franquicias. El texto del packaging nunca decide por sí solo el tipo. type=comic exige una publicación real con páginas/grapas/lomo.",text,flags=re.S)

# Research flow: no PriceCharting anywhere.
research=r'''export async function research(input,config){
 let {item}=researchSchema.parse(input);const isFunko=item.type==='funko'||/\bfunko\b|\bpop!?\b/i.test(`${item.title||''} ${item.manufacturer||''} ${item.line||''}`);if(isFunko)item=deriveFunkoFields({...item,type:'funko'});
 let identity=buildResearchIdentity(item)||String(item.title||'').trim();const fetcher=config.fetcher||fetch,warnings=[];let webSources=[],usdEurRate=null;
 if(config.key){try{const query=(isFunko?identity.normalize('NFD').replace(/[\u0300-\u036f]/g,''):identity).trim(),mode=isFunko?'funko':(['figure','card','comic','manga','game','lego','plush','replica','movie','merch'].includes(item.type)?item.type:'general');const found=normalizeSources(await deepseekWebSearch(query,{...config,searchMode:mode}),'price-search');webSources=limitPricingSources(uniqueSources(prioritizePricingSources(item,relevantSourcesForItem(item,keepUsableSources(found).filter(allowedPricingSource)))),item);}catch(error){warnings.push(error instanceof Error?`Búsqueda de precios: ${error.message}`:'No se pudo completar la búsqueda de precios.');}}else warnings.push('No hay proveedor de búsqueda pública configurado.');
 if(isFunko&&config.hobbyDbReader){webSources=webSources.filter(source=>!['hobbydb.com','www.hobbydb.com'].includes(hostOf(source.url)));try{webSources.unshift(...normalizeSources([await config.hobbyDbReader(item)],'hobbydb-browser'));}catch(error){warnings.push(error instanceof Error?error.message:'No se pudo abrir Price Guide en hobbyDB.');}}
 const canonical=canonicalTitleFromSources(item,webSources);let resolvedIdentity;if(canonical&&canonical!==item.title){item={...item,title:canonical};identity=buildResearchIdentity(item)||canonical;resolvedIdentity={title:canonical,manufacturer:item.manufacturer||'',line:item.line||'',character:item.character||'',franchise:item.franchise||'',sku:item.sku||'',barcode:item.barcode||''};}
 let fallback=false;if(webSources.some(source=>/\$|\bUSD\b/i.test(`${source.title} ${source.snippet}`))){usdEurRate=await fetchUsdEurRate(fetcher);if(usdEurRate==null){usdEurRate=.87;fallback=true;warnings.push('No se pudo obtener el cambio USD/EUR en directo; se usa una conversión orientativa.');}}
 const listings=parsePublicListings(webSources,{USD_EUR:usdEurRate}),comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,8),hobbyDbEstimated=isFunko?comparables.filter(row=>{const source=webSources.find(x=>x.url===row.url||x.id===row.id),raw=`${source?.title||''} ${source?.snippet||''} ${row.title||''} ${row.condition||''}`;return hostOf(row.url).includes('hobbydb.com')&&/\bestimated\s+value\b/i.test(raw);}):[],asking=summarizeListings(isFunko?hobbyDbEstimated:comparables),sources=limitPricingSources(uniqueSources(webSources),item),exchangeRates=isFunko?await fetchDisplayCurrencyRates(fetcher,usdEurRate):{};
 if(isFunko&&!asking.count)warnings.push('hobbyDB no devolvió un “Estimated Value” verificable. El resto de precios es orientativo.');if(!listings.length)warnings.push('No se encontró un precio visible para el producto exacto.');else if(!comparables.length)warnings.push('Se detectaron precios, pero ninguno coincide con suficiente precisión.');
 let summary,facts=[];if(asking.count){const range=asking.min===asking.max?euro(asking.min):`${euro(asking.min)} – ${euro(asking.max)}`,baremo=`${range}; mediana ${euro(asking.median)} con ${asking.count} comparable${asking.count===1?'':'s'} exacto${asking.count===1?'':'s'}.`;summary=isFunko?`Valor principal tomado del “Estimated Value” de hobbyDB Price Guide.${fallback?' Conversión USD/EUR orientativa.':''}`:`Valoración calculada a partir de precios públicos del producto físico exacto.${fallback?' Conversión USD/EUR orientativa.':''} ${baremo}`;facts=[{label:isFunko?'hobbyDB Estimated Value':'Baremo de mercado',value:baremo,sourceId:sources[0]?.id||comparables[0].id},...comparables.map(row=>({label:row.sourceType==='guide'?'Valor principal':'Referencia orientativa',value:`${euro(row.price)} · ${row.condition}`,sourceId:sources[0]?.id||row.id}))];}else summary=`Se buscaron precios usando una única identidad: “${identity}”. ${sources.length} página${sources.length===1?'':'s'} útil${sources.length===1?'':'es'} y ${listings.length} precio${listings.length===1?'':'s'} detectado${listings.length===1?'':'s'}; ninguno permite todavía un baremo suficientemente exacto.`;
 const soldRows=comparables.filter(x=>x.sourceType==='sold'&&x.currency==='EUR'),sold=summarizeListings(soldRows);return {checkedAt:new Date().toISOString(),searchIdentity:identity,resolvedIdentity,summary,facts,sources,listings,comparables,asking,exchangeRates,sold:{available:soldRows.length>0,count:soldRows.length,median:sold.median,reason:soldRows.length?'Ventas cerradas detectadas entre los comparables exactos.':'No se detectó una venta cerrada verificable entre los comparables exactos.'},warnings,links:{ebay:'https://www.ebay.es/sch/i.html?_nkw='+encodeURIComponent(identity),sold:'https://www.ebay.es/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw='+encodeURIComponent(identity),web:'https://www.google.com/search?q='+encodeURIComponent(identity+' precio'),...(isFunko?{ppg:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?q='+encodeURIComponent(identity),stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)}:{})}};
}'''
text=sub(text,r"export async function research\(input,config\)\{.*\Z",research+"\n",'research')
for banned in ['PriceCharting','pricecharting.com','priceChartingToken']:
    if banned in text: raise SystemExit(f'ai-core still contains {banned}')
core.write_text(text,encoding='utf-8')

# Direct AI: remove all PriceCharting state/config.
direct=Path('src/lib/direct-ai.ts');d=direct.read_text(encoding='utf-8')
d=re.sub(r"\nconst priceChartingStorageKey.*?\nfunction scopedPriceChartingKey\(\).*?\n",'\n',d,count=1)
d=re.sub(r"\nexport function getPriceChartingToken\(\): string \{.*?\n\}\n\n// One-time private activation",'\n// One-time private activation',d,flags=re.S,count=1)
d=re.sub(r"\n\s*const priceSaved = await getDoc\(doc\(db, 'users', user.uid, 'settings', 'pricecharting'\)\);\n\s*const priceToken = priceSaved\.data\(\)\?\.token;\n\s*if \(typeof priceToken === 'string'.*?\n",'\n',d,count=1)
d=re.sub(r"const directFetch: typeof fetch = async \(input, init\) => \{.*?\n\};\nfunction config\(\) \{","const directFetch: typeof fetch = async (input, init) => { try { return await fetch(input, init); } catch (error) { if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new Error('DeepSeek ha tardado demasiado. Vuelve a intentarlo.'); throw new Error('No se pudo conectar directamente con DeepSeek.'); } };\nfunction config() {",d,flags=re.S,count=1)
d=re.sub(r"\s*// PriceCharting documenta CORS.*?\n\s*// el token privado.*?\n",'\n',d,count=1)
d=d.replace("return { key, model: 'deepseek-flash', fetcher: directFetch, priceChartingToken: getPriceChartingToken(),","return { key, model: 'deepseek-flash', fetcher: directFetch,")
if re.search('pricecharting',d,re.I):raise SystemExit('direct-ai still contains pricecharting')
direct.write_text(d,encoding='utf-8')

# Settings UI: only DeepSeek.
Path('src/components/DirectAiSettings.tsx').write_text("""import { useState, useEffect } from 'react';\nimport { getPersonalKey, savePersonalKey, removePersonalKey, testDirect, syncPersonalKey } from '../lib/direct-ai';\nexport function DirectAiSettings(){const[key,setKey]=useState('');const[configured,setConfigured]=useState(()=>Boolean(getPersonalKey()));const[remember,setRemember]=useState(false);const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');useEffect(()=>{const refresh=()=>setConfigured(Boolean(getPersonalKey()));window.addEventListener('frikivault-ai-ready',refresh);return()=>window.removeEventListener('frikivault-ai-ready',refresh)},[]);async function connect(){setBusy(true);setMessage('Comprobando DeepSeek…');try{if(key.trim()){savePersonalKey(key,remember);setKey('')}else if(remember&&getPersonalKey())savePersonalKey(getPersonalKey(),true);setConfigured(Boolean(getPersonalKey()));await testDirect();await syncPersonalKey();setMessage('Conexión comprobada y clave sincronizada con tu cuenta.')}catch(e){setMessage(e instanceof Error?e.message:'No se pudo comprobar la conexión.')}finally{setBusy(false)}}return <div className=\"panel provider-settings\"><section className=\"settings-integration\"><h3>IA directa · DeepSeek</h3><p className=\"muted\">Identifica el objeto físico e investiga fuentes públicas según el tipo de coleccionable.</p><label className=\"field\"><span>Clave personal</span><input type=\"password\" autoComplete=\"off\" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} placeholder={configured?'Clave guardada; escribe aquí para cambiarla':'sk-…'}/></label><p className=\"muted\"><label><input type=\"checkbox\" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Recordar en este dispositivo privado</label></p><div className=\"button-stack\"><button className=\"primary\" disabled={busy||(!configured&&!key.trim())} onClick={connect}>{busy?'Comprobando…':key.trim()?'Guardar y comprobar':'Comprobar conexión'}</button>{configured&&<button className=\"secondary\" disabled={busy} onClick={async()=>{try{await removePersonalKey();setConfigured(false);setKey('');setMessage('Clave eliminada.')}catch{setMessage('No se pudo eliminar la clave.')}}}>Borrar clave</button>}</div>{message&&<p className=\"muted\" role=\"status\">{message}</p>}</section></div>}\n""",encoding='utf-8')

server=Path('server/index.mjs');s=server.read_text(encoding='utf-8').replace(",priceChartingToken:env.PRICECHARTING_API_TOKEN",'');server.write_text(s,encoding='utf-8')
env=Path('.env.server.example');e=re.sub(r"# Opcional: API oficial PriceCharting.*?PRICECHARTING_API_TOKEN=\n",'',env.read_text(encoding='utf-8'));env.write_text(e,encoding='utf-8')
types=Path('src/types.ts');ty=types.read_text(encoding='utf-8').replace(';priceCharting?:string','');types.write_text(ty,encoding='utf-8')

# Tests: delete provider-specific tests and assert general engine behavior.
tests=Path('tests/core.mjs');q=tests.read_text(encoding='utf-8').replace(', fetchPriceChartingGuide','')
q=re.sub(r"\n// PriceCharting realista:.*?(?=\n// También aprovechamos precios públicos)",'\n',q,flags=re.S)
q=re.sub(r"\n// PriceCharting/hobbyDB pueden publicar USD:.*?(?=\n// Con varias fotos)",'\n',q,flags=re.S)
q=q.replace(",priceChartingToken:'a'.repeat(40)",'')
q=q.replace("assert.match(directAiSource,/priceChartingToken/);\nassert.match(directAiSource,/settings', 'pricecharting'/);\nconst coreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');\nassert.match(coreSource,/PriceCharting/);","const coreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');\nassert.doesNotMatch(directAiSource,/pricecharting/i);\nassert.doesNotMatch(coreSource,/pricecharting/i);")
q=q.replace('// Regresión: PriceCharting es prioritario y los botones del formulario conservan su estilo original.','// Regresión: las fuentes de mercado y los botones conservan su estilo original.')
marker="assert.equal(weaponXIdentification.sku,'G0644');"
extra="""\n\n// La naturaleza física manda para todas las familias.\nconst physicalCases=[\n {input:{title:'Charizard promo art',type:'comic',manufacturer:'The Pokémon Company',setName:'Scarlet & Violet',cardNumber:'199/165',explanation:'Trading card inside a PSA slab',graded:true},expected:'card'},\n {input:{title:'Batman artwork',type:'comic',manufacturer:'McFarlane Toys',line:'DC Multiverse',explanation:'Articulated action figure in blister packaging'},expected:'figure'},\n {input:{title:'The Last of Us cover art',type:'comic',platform:'PlayStation 5',explanation:'PS5 video game disc in plastic case'},expected:'game'},\n {input:{title:'Grogu',type:'figure',manufacturer:'LEGO',sku:'75318',explanation:'LEGO brick construction set'},expected:'lego'},\n {input:{title:'Pikachu',type:'figure',explanation:'Soft stuffed plush toy made of fabric'},expected:'plush'},\n {input:{title:'Iron Man helmet',type:'figure',explanation:'1:1 scale wearable prop replica helmet'},expected:'replica'}\n];\nfor(const row of physicalCases){const fetcher=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...row.input,confidence:.95})}}]}),{status:200,headers:{'content-type':'application/json'}});const identified=await identify('data:image/jpeg;base64,PHYSICAL',{key:'test',fetcher});assert.equal(identified.type,row.expected);}\n"""
if 'const physicalCases=[' not in q:q=q.replace(marker,marker+extra)
q += "\nassert.doesNotMatch(readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8'),/pricecharting/i);\nassert.doesNotMatch(readFileSync(new URL('../src/lib/direct-ai.ts',import.meta.url),'utf8'),/pricecharting/i);\nassert.doesNotMatch(readFileSync(new URL('../src/components/DirectAiSettings.tsx',import.meta.url),'utf8'),/pricecharting/i);\n"
tests.write_text(q,encoding='utf-8')
print('Applied general collector engine v2')
