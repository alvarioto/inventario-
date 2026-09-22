import { auth } from './firebase';
import { getPersonalKey, identifyDirect, inspectFunkoStickersDirect, keyReady } from './direct-ai';
import { detectAllFunkoStickers, FUNKO_STICKERS } from './funko-stickers';
import type { AiIdentification, InventoryDraft, ResearchResult } from '../types';
export type ApiStatus={deepseek:boolean;model:string;webSearch:boolean;publicSearch:boolean;mode:string;session?:string};
const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
const priceChartingValueUrl=(import.meta.env.VITE_PRICECHARTING_VALUE_URL||'https://frikivault-hobbydb-api.vercel.app/api/pricecharting-value').replace(/\/$/,'');
const actionFigure411ValueUrl=(import.meta.env.VITE_ACTIONFIGURE411_VALUE_URL||'https://frikivault-hobbydb-api.vercel.app/api/actionfigure411-value').replace(/\/$/,'');
const legendsVerseValueUrl=(import.meta.env.VITE_LEGENDSVERSE_VALUE_URL||'https://frikivault-hobbydb-api.vercel.app/api/legendsverse-value').replace(/\/$/,'');
export async function getApiStatus():Promise<ApiStatus>{await keyReady.catch(()=>{});if(getPersonalKey())return {deepseek:true,model:'deepseek-flash',webSearch:true,publicSearch:true,mode:'direct'};const r=await fetch(base+'/api/status');if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('Configura IA directa en Ajustes para analizar fotos con tu clave de DeepSeek.');return r.json()}
async function post<T>(route:string,payload:unknown):Promise<T>{
 const status=await getApiStatus();const token=await auth?.currentUser?.getIdToken();
 const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(status.session?{'X-FrikiVault-Session':status.session}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`Error HTTP ${r.status}`);return result;
}
async function priceChartingPost(payload:unknown){
 const r=await fetch(priceChartingValueUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`PriceCharting HTTP ${r.status}`);return result;
}
async function actionFigure411Post(payload:unknown){
 const r=await fetch(actionFigure411ValueUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`ActionFigure411 HTTP ${r.status}`);return result;
}
async function legendsVersePost(payload:unknown){
 const r=await fetch(legendsVerseValueUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`LegendsVerse HTTP ${r.status}`);return result;
}
function isMarvelLegendsFigure(item:Partial<InventoryDraft>){
 if(item.type!=='figure')return false;
 const line=String(item.line||'').toLowerCase();
 const title=String(item.title||'').toLowerCase();
 const manufacturer=String(item.manufacturer||'').toLowerCase();
 const franchise=String(item.franchise||'').toLowerCase();
 return line.includes('marvel legends')||title.includes('marvel legends')||(manufacturer.includes('hasbro')&&franchise.includes('marvel'));
}
function cleanKnownStickerWords(value:string){
 let clean=String(value||'');
 for(const sticker of FUNKO_STICKERS){
  for(const token of [...sticker.exactTexts,...sticker.aliases]){
   const escaped=token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   clean=clean.replace(new RegExp(`\\b${escaped.replace(/\\ /g,'\\s+')}\\b`,'gi'),' ');
  }
 }
 return clean.replace(/\s+/g,' ').trim();
}
function cleanFunkoTitle(title:string,variant:string){
 let clean=cleanKnownStickerWords(title)
  .replace(/\bupside down\b|\bclear\b|\btranslucent\b|\bwood deco\b|\bdo it yourself\b|\bdiy\b/gi,' ')
  .replace(/\s+/g,' ').trim();
 return variant?`${clean} ${variant}`.replace(/\s+/g,' ').trim():clean;
}
function visualFunkoVariant(row:AiIdentification){
 const claimed=String(row.funkoVariant||'').trim();
 const evidence=`${row.title||''} ${row.edition||''} ${(row.tags||[]).join(' ')} ${row.explanation||''}`;
 if(/\bupside down\b/i.test(claimed)&&/\bupside down\b/i.test(evidence))return'Upside Down';
 if(/\bclear\b|\btranslucent\b/i.test(claimed)&&/\bclear\b|\btranslucent\b/i.test(evidence))return'Clear / Translucent';
 if(/\bwood deco\b|\bwood(?:en)?\b/i.test(claimed)&&/\bwood deco\b|\bwood(?:en)?\b/i.test(evidence))return'Wood Deco';
 if(/^(?:DIY|Do It Yourself)$/i.test(claimed)&&/\bDIY\b|do it yourself|sin pintar|unpainted/i.test(evidence))return'DIY';
 return'';
}
function cleanFunkoIdentification(row:AiIdentification,audit?:{performed:boolean;stickerTexts:string[];confidence:number}):AiIdentification{
 if(row.type!=='funko')return row;

 // Las variantes de sticker se deciden SOLO con texto realmente leído en pegatinas.
 const fallbackEvidence=`${row.edition||''} ${(row.tags||[]).join(' ')} ${row.explanation||''}`.trim();
 const stickerEvidence=audit?.performed?(audit.stickerTexts||[]).join(' | '):fallbackEvidence;
 const hits=detectAllFunkoStickers(stickerEvidence);
 const variantHits=hits.filter(hit=>hit.definition.kind==='variant');
 const primaryStickerVariant=variantHits.find(hit=>hit.definition.id==='chase')||variantHits[0]||null;

 // Otras variantes no dependen de pegatina y sí pueden distinguirse visualmente.
 // Ej.: las minis promocionales de Stranger Things tienen versión base y "Upside Down".
 const visualVariant=visualFunkoVariant(row);
 const finalVariant=primaryStickerVariant?.definition.variant||visualVariant||'';

 const identityStickers=hits.filter(hit=>hit.definition.kind!=='variant').map(hit=>hit.definition.label);
 const variantLabels=variantHits.map(hit=>hit.definition.label);
 const stickerLabels=[...new Set([...variantLabels,...identityStickers])];
 const title=cleanFunkoTitle(String(row.title||''),finalVariant);
 const baseEdition=cleanKnownStickerWords(String(row.edition||''));
 const edition=[baseEdition,...identityStickers].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');
 const tags=[...new Set([...(row.tags||[]).filter(tag=>!FUNKO_STICKERS.some(s=>[...s.exactTexts,...s.aliases].some(x=>tag.toLowerCase().includes(x.toLowerCase())))),...stickerLabels])];

 return {...row,title,funkoVariant:finalVariant,edition,tags};
}
async function readPriceChartingValue(item:Partial<InventoryDraft>){
 if(!priceChartingValueUrl)return null;
 const name=String(item.character||item.title||'').trim();
 if(!name&&!item.sku&&!item.barcode)return null;
 const identity={type:item.type||'other',title:item.title||'',character:item.character||name,manufacturer:item.manufacturer||'',line:item.line||'',edition:item.edition||'',popNumber:item.popNumber||'',funkoCategory:item.funkoCategory||item.line||'',funkoVariant:item.funkoVariant||'',sku:item.sku||'',barcode:item.barcode||'',hasBox:item.hasBox,sealed:item.sealed};
 const result=await priceChartingPost({item:identity});
 if(result.status==='completed'&&result.value)return result.value as {amount:number;currency:'USD';url:string;evidence:string;variant:string;title:string;condition:string;prices?:{outOfBox:number|null;inBox:number|null;new:number|null}};
 throw new Error('PriceCharting no devolvió un precio público verificable para el artículo exacto.');
}
async function readLegendsVerseValue(item:Partial<InventoryDraft>){
 if(!legendsVerseValueUrl||!isMarvelLegendsFigure(item))return null;
 const result=await legendsVersePost({item:{
  type:item.type,title:item.title||'',character:item.character||'',manufacturer:item.manufacturer||'',
  line:item.line||'',franchise:item.franchise||'',edition:item.edition||'',wave:item.wave||'',
  exclusive:item.exclusive||'',year:item.year||null,sku:item.sku||'',barcode:item.barcode||''
 }});
 if(result.status==='completed'&&result.value)return result.value as {
  source:'LegendsVerse';amount:number;currency:'USD';url:string;title:string;wave:string;exclusive:string;
  year:number|null;retail:number|null;updated:string;evidence:string;methodology:string
 };
 throw new Error('LegendsVerse no devolvió una valoración verificable para la figura exacta.');
}
async function readActionFigure411Value(item:Partial<InventoryDraft>){
 if(!actionFigure411ValueUrl||item.type!=='figure')return null;
 const result=await actionFigure411Post({item:{
  type:item.type,title:item.title||'',character:item.character||'',manufacturer:item.manufacturer||'',
  line:item.line||'',franchise:item.franchise||'',edition:item.edition||'',wave:item.wave||'',
  exclusive:item.exclusive||'',year:item.year||null,sku:item.sku||'',barcode:item.barcode||'',
  hasBox:item.hasBox,sealed:item.sealed
 }});
 if(result.status==='completed'&&result.value)return result.value as {
  source:'ActionFigure411';amount:number;currency:'USD';url:string;title:string;group:string;year:number|null;
  retail:number|null;upc:string;asin:string;soldCount:number|null;low:number|null;high:number|null;
  activeAverage:number|null;activeCount:number|null;evidence:string;methodology:string
 };
 throw new Error('ActionFigure411 no devolvió una valoración verificable para la figura exacta.');
}
async function ensureUsdDisplayRates(research:ResearchResult):Promise<ResearchResult>{
 if(research.exchangeRates?.EUR)return research;
 try{
  const response=await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CAD,AUD,CHF,CNY,MXN,KRW',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)return research;
  const data=await response.json();
  const rates:Record<string,number>={...(research.exchangeRates||{}),USD:1};
  for(const code of ['EUR','GBP','JPY','CAD','AUD','CHF','CNY','MXN','KRW']){
   const value=Number(data?.rates?.[code]);
   if(Number.isFinite(value)&&value>0)rates[code]=value;
  }
  return {...research,exchangeRates:rates};
 }catch{return research;}
}
function applyPriceChartingValue(research:ResearchResult,guide:{amount:number;currency:'USD';url:string;evidence:string;variant:string;title:string;condition:string;prices?:{outOfBox:number|null;inBox:number|null;new:number|null}}):ResearchResult{
 const sourceId='pricecharting-public-value';
 const source={id:sourceId,kind:'price-guide',title:'PriceCharting',url:guide.url,snippet:guide.evidence};
 const condition=guide.condition||'Price Guide';
 const comparable={id:sourceId,title:`PriceCharting · ${guide.title||guide.variant||'artículo exacto'}`,url:guide.url,price:guide.amount,currency:'USD',shipping:null,condition,sourceType:'guide' as const,originalPrice:guide.amount,originalCurrency:'USD'};
 const detail=guide.prices?[`Out of Box ${guide.prices.outOfBox==null?'—':`${guide.prices.outOfBox.toFixed(2)}`}`,`In Box ${guide.prices.inBox==null?'—':`${guide.prices.inBox.toFixed(2)}`}`,`New ${guide.prices.new==null?'—':`${guide.prices.new.toFixed(2)}`}`].join(' · '):guide.evidence;
 return {...research,summary:`PriceCharting publica ${detail}. Para esta unidad se usa ${condition}: ${guide.amount.toFixed(2)} USD. El resto de precios se mantiene como referencia orientativa.`,sources:[source,...research.sources.filter(x=>x.id!==sourceId&&!(x.url||'').includes('pricecharting.com'))],comparables:[comparable,...research.comparables.filter(x=>x.id!==sourceId&&!(x.url||'').includes('pricecharting.com'))],asking:{kind:'guide',currency:'USD',count:1,min:guide.amount,max:guide.amount,median:guide.amount,label:`Valor PriceCharting · ${condition}`,originalCurrency:'USD',originalMedian:guide.amount},links:{...research.links,priceCharting:guide.url}};
}
function applyLegendsVerseValue(research:ResearchResult,item:Partial<InventoryDraft>,guide:{
 amount:number;currency:'USD';url:string;title:string;wave:string;exclusive:string;year:number|null;retail:number|null;updated:string;evidence:string;methodology:string
}):ResearchResult{
 const sourceId='legendsverse-market-value';
 const source={id:sourceId,kind:'sold-market',title:'LegendsVerse',url:guide.url,snippet:guide.evidence};
 const comparable={id:sourceId,title:`LegendsVerse · ${guide.title}`,url:guide.url,price:guide.amount,currency:'USD',shipping:null,condition:'Market Value · ventas completadas',sourceType:'guide' as const,originalPrice:guide.amount,originalCurrency:'USD'};
 const facts=[
  guide.wave?{label:'Wave',value:guide.wave,sourceId}:null,
  guide.exclusive?{label:'Exclusiva',value:guide.exclusive,sourceId}:null,
  guide.year?{label:'Año',value:String(guide.year),sourceId}:null,
  guide.retail!=null?{label:'PVP original',value:`${guide.retail.toFixed(2)} USD`,sourceId}:null,
  guide.updated?{label:'Actualización',value:guide.updated.replace(/^Market value updated on\s*/i,''),sourceId}:null
 ].filter(Boolean) as Array<{label:string;value:string;sourceId:string}>;
 return {...research,
  resolvedIdentity:{title:guide.title,manufacturer:item.manufacturer||'Hasbro',line:item.line||'Marvel Legends',character:item.character||guide.title,franchise:item.franchise||'Marvel',sku:item.sku||'',barcode:item.barcode||''},
  summary:`LegendsVerse publica ${guide.amount.toFixed(2)} USD de Market Value para ${guide.title}${guide.wave?` · ${guide.wave}`:''}. Su guía usa ventas completadas de eBay y se actualiza periódicamente.`,
  facts:[...facts,...research.facts],
  sources:[source,...research.sources.filter(x=>x.id!==sourceId)],
  comparables:[comparable,...research.comparables.filter(x=>x.id!==sourceId)],
  asking:{kind:'guide',currency:'USD',count:1,min:guide.amount,max:guide.amount,median:guide.amount,label:'LegendsVerse · Market Value',originalCurrency:'USD',originalMedian:guide.amount},
  sold:{available:true,reason:guide.methodology,median:guide.amount},
  links:{...research.links,legendsVerse:guide.url}
 };
}
function applyActionFigure411Value(research:ResearchResult,item:Partial<InventoryDraft>,guide:{
 amount:number;currency:'USD';url:string;title:string;group:string;year:number|null;retail:number|null;upc:string;asin:string;
 soldCount:number|null;low:number|null;high:number|null;activeAverage:number|null;activeCount:number|null;evidence:string;methodology:string
}):ResearchResult{
 const sourceId='actionfigure411-sold-value';
 const source={id:sourceId,kind:'sold-market',title:'ActionFigure411',url:guide.url,snippet:guide.evidence};
 const comparable={id:sourceId,title:`ActionFigure411 · ${guide.title}`,url:guide.url,price:guide.amount,currency:'USD',shipping:null,condition:'Media de ventas cerradas',sourceType:'sold' as const,originalPrice:guide.amount,originalCurrency:'USD'};
 const facts=[
  guide.group?{label:'Serie / grupo',value:guide.group,sourceId}:null,
  guide.year?{label:'Año',value:String(guide.year),sourceId}:null,
  guide.retail!=null?{label:'PVP original',value:`${guide.retail.toFixed(2)} USD`,sourceId}:null,
  guide.upc?{label:'UPC',value:guide.upc,sourceId}:null,
  guide.soldCount?{label:'Ventas cerradas usadas',value:String(guide.soldCount),sourceId}:null,
  guide.low!=null&&guide.high!=null?{label:'Rango de ventas',value:`${guide.low.toFixed(2)} – ${guide.high.toFixed(2)} USD`,sourceId}:null,
  guide.activeAverage!=null?{label:'Anuncios activos',value:`Media ${guide.activeAverage.toFixed(2)} USD${guide.activeCount?` · ${guide.activeCount} anuncios`:''}`,sourceId}:null
 ].filter(Boolean) as Array<{label:string;value:string;sourceId:string}>;
 const warnings=[...research.warnings];
 if(item.hasBox===false)warnings.push('ActionFigure411 calcula principalmente figuras modernas completas en caja; para una figura suelta este valor es solo una referencia y puede ser superior a su valor real.');
 const n=guide.soldCount||1;
 const range=guide.low!=null&&guide.high!=null?` Rango observado: ${guide.low.toFixed(2)}–${guide.high.toFixed(2)}.`:'';
 const sample=guide.soldCount?` basada en ${guide.soldCount} ventas cerradas`:' publicada en su guía';
 return {...research,
  resolvedIdentity:{title:guide.title,manufacturer:item.manufacturer||'',line:item.line||'',character:item.character||guide.title,franchise:item.franchise||'',sku:item.sku||'',barcode:guide.upc||item.barcode||''},
  summary:`ActionFigure411 identifica ${guide.title}${guide.group?` · ${guide.group}`:''} y publica una media de ${guide.amount.toFixed(2)} USD${sample}.${range}`,
  facts:[...facts,...research.facts],sources:[source,...research.sources.filter(x=>x.id!==sourceId)],
  comparables:[comparable,...research.comparables.filter(x=>x.id!==sourceId)],
  asking:{kind:'sold',currency:'USD',count:n,min:guide.low??guide.amount,max:guide.high??guide.amount,median:guide.amount,label:'ActionFigure411 · media de ventas cerradas',originalCurrency:'USD',originalMedian:guide.amount},
  sold:{available:true,reason:guide.methodology,count:guide.soldCount||undefined,median:guide.amount},
  warnings,
  links:{...research.links,actionFigure411:guide.url}
 };
}
export async function identifyPhoto(images:string[]):Promise<AiIdentification>{
 await keyReady.catch(()=>{});
 const direct=Boolean(getPersonalKey());
 const result=direct?await identifyDirect(images):await post<AiIdentification>('identify',{images});
 let audit:{performed:boolean;stickerTexts:string[];confidence:number}|undefined;
 if(result.type==='funko'&&direct) audit=await inspectFunkoStickersDirect(images);
 return cleanFunkoIdentification(result,audit);
}
function freeResearchShell(item:Partial<InventoryDraft>):ResearchResult{
 const identity=[item.manufacturer,item.line,item.character||item.title,item.wave,item.edition,item.exclusive,item.year,item.popNumber,item.funkoVariant].filter(Boolean).join(' ').replace(/\s+/g,' ').trim()||String(item.title||'').trim();
 return {
  checkedAt:new Date().toISOString(),
  searchIdentity:identity,
  summary:'Buscando una valoración gratuita y verificable para este artículo.',
  facts:[],sources:[],listings:[],comparables:[],
  asking:{kind:'none',currency:'USD',count:0,min:null,max:null,median:null,label:'Sin valoración verificada',originalCurrency:null,originalMedian:null},
  exchangeRates:{USD:1},
  sold:{available:false,count:0,median:null,reason:'No hay ventas cerradas verificadas para esta pieza.'},
  warnings:[],
  links:{
   ebay:'https://www.ebay.es/sch/i.html?_nkw='+encodeURIComponent(identity),
   sold:'https://www.ebay.es/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw='+encodeURIComponent(identity),
   priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity),
   web:'',
   ...(item.type==='figure'?{
    coleka:'https://www.coleka.com/en/collector-action-figures_r2093',
    figureRealm:'https://www.figurerealm.com/actionfigure?action=search',
    ...(isMarvelLegendsFigure(item)?{legendsVerse:'https://legendsverse.com/price-guide'}:{})
   }:{}),
   ...(item.type==='funko'?{stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)}:{})
  }
 };
}
export async function investigate(item:Partial<InventoryDraft>):Promise<ResearchResult>{
 const baseResearch=freeResearchShell(item);
 const warnings:string[]=[];
 const tryPriceCharting=async()=>{
  const guide=await readPriceChartingValue(item);
  if(!guide)throw new Error('PriceCharting no devolvió un precio verificable.');
  const withRates=await ensureUsdDisplayRates({...baseResearch,warnings});
  return applyPriceChartingValue(withRates,guide);
 };
 const tryActionFigure411=async()=>{
  const guide=await readActionFigure411Value(item);
  if(!guide)throw new Error('ActionFigure411 no devolvió un precio verificable.');
  const withRates=await ensureUsdDisplayRates({...baseResearch,warnings});
  return applyActionFigure411Value(withRates,item,guide);
 };

 if(item.type==='figure'&&isMarvelLegendsFigure(item)){
  try{
   const guide=await readLegendsVerseValue(item);
   if(guide){
    const withRates=await ensureUsdDisplayRates(baseResearch);
    return applyLegendsVerseValue(withRates,item,guide);
   }
  }catch(error){
   warnings.push(`LegendsVerse: ${error instanceof Error?error.message:'no se pudo consultar la guía pública.'}`);
  }
  try{return await tryActionFigure411();}
  catch(error){
   const message=error instanceof Error?error.message:'no se pudo consultar la fuente.';
   if(!/no tiene un catálogo compatible claramente identificado/i.test(message))warnings.push(`ActionFigure411: ${message}`);
  }
  try{return await tryPriceCharting();}
  catch(error){
   warnings.push(`PriceCharting: ${error instanceof Error?error.message:'no se pudo leer el precio público.'}`);
  }
  return {...baseResearch,warnings};
 }

 if(item.type==='figure'){
  try{return await tryPriceCharting();}
  catch(error){warnings.push(`PriceCharting: ${error instanceof Error?error.message:'no se pudo leer el precio público.'}`);}
  try{return await tryActionFigure411();}
  catch(error){
   const message=error instanceof Error?error.message:'no se pudo consultar la fuente.';
   if(!/no tiene un catálogo compatible claramente identificado/i.test(message))warnings.push(`ActionFigure411: ${message}`);
  }
  return {...baseResearch,warnings};
 }

 try{return await tryPriceCharting();}
 catch(error){
  return {...baseResearch,warnings:[...warnings,`PriceCharting: ${error instanceof Error?error.message:'no se pudo leer el precio público.'}`]};
 }
}
