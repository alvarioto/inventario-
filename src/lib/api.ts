import { auth } from './firebase';
import { getPersonalKey, identifyDirect, inspectFunkoStickersDirect, keyReady, researchDirect } from './direct-ai';
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
}async function actionFigure411Post(payload:unknown){
 const r=await fetch(actionFigure411ValueUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`ActionFigure411 HTTP ${r.status}`);return result;
}async function legendsVersePost(payload:unknown){
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
async function readActionFigure411Value(item:Partial<InventoryDraft>){
 if(!actionFigure411ValueUrl||item.type!=='figure')return null;
 const result=await actionFigure411Post({item:{
  type:item.type,title:item.title||'',character:item.character||'',manufacturer:item.manufacturer||'',
  line:item.line||'',franchise:item.franchise||'',edition:item.edition||'',wave:item.wave||'',
  exclusive:item.exclusive||'',year:item.year||null,sku:item.sku||'',barcode:item.barcode||''
 }});
 if(result.status==='completed'&&result.value)return result.value as {
  source:'ActionFigure411';amount:number;currency:'USD'|'EUR'|'GBP';url:string;searchUrl:string;title:string;
  genre:string;group:string;wave:string;year:number|null;retail:number|null;upc:string;soldCount:number;
  soldAverage:number;soldHigh:number|null;soldLow:number|null;buyItNowAverage:number|null;
  activeFilteredCount:number;activeTotalCount:number;evidence:string;methodology:string
 };
 throw new Error('ActionFigure411 no devolvió una estimación verificable para la figura exacta.');
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
}async function ensureUsdDisplayRates(research:ResearchResult):Promise<ResearchResult>{
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
function applyActionFigure411Value(research:ResearchResult,item:Partial<InventoryDraft>,guide:{
 source:'ActionFigure411';amount:number;currency:'USD'|'EUR'|'GBP';url:string;searchUrl:string;title:string;
 genre:string;group:string;wave:string;year:number|null;retail:number|null;upc:string;soldCount:number;
 soldAverage:number;soldHigh:number|null;soldLow:number|null;buyItNowAverage:number|null;
 activeFilteredCount:number;activeTotalCount:number;evidence:string;methodology:string
}):ResearchResult{
 const sourceId='actionfigure411-market-value';
 const source={id:sourceId,kind:'sold-market',title:'ActionFigure411',url:guide.url,snippet:guide.evidence};
 const comparable={id:sourceId,title:`ActionFigure411 · ${guide.title}`,url:guide.url,price:guide.soldAverage,currency:guide.currency,shipping:null,condition:'Media de ventas cerradas',sourceType:'sold' as const,originalPrice:guide.soldAverage,originalCurrency:guide.currency};
 const facts=[
  {label:'Ventas usadas',value:String(guide.soldCount),sourceId},
  guide.soldLow!=null&&guide.soldHigh!=null?{label:'Rango reciente',value:`${guide.soldLow.toFixed(2)}–${guide.soldHigh.toFixed(2)} ${guide.currency}`,sourceId}:null,
  guide.buyItNowAverage!=null?{label:'Buy It Now medio',value:`${guide.buyItNowAverage.toFixed(2)} ${guide.currency}`,sourceId}:null,
  guide.activeTotalCount>0?{label:'Anuncios activos',value:`${guide.activeFilteredCount} filtrados de ${guide.activeTotalCount}`,sourceId}:null,
  guide.group?{label:'Grupo',value:guide.group,sourceId}:null,
  guide.wave?{label:'Wave',value:guide.wave,sourceId}:null,
  guide.year?{label:'Año',value:String(guide.year),sourceId}:null,
  guide.retail!=null?{label:'PVP original',value:`${guide.retail.toFixed(2)} ${guide.currency}`,sourceId}:null,
  guide.upc?{label:'UPC',value:guide.upc,sourceId}:null
 ].filter(Boolean) as Array<{label:string;value:string;sourceId:string}>;
 const range=guide.soldLow!=null&&guide.soldHigh!=null?` El rango reciente es ${guide.soldLow.toFixed(2)}–${guide.soldHigh.toFixed(2)} ${guide.currency}.`:'';
 const bin=guide.buyItNowAverage!=null?` Los anuncios Buy It Now activos promedian ${guide.buyItNowAverage.toFixed(2)} ${guide.currency}, como dato orientativo.`:'';
 return {...research,
  resolvedIdentity:{title:guide.title,manufacturer:item.manufacturer||'',line:item.line||'',character:item.character||guide.title,franchise:item.franchise||guide.genre,sku:item.sku||'',barcode:guide.upc||item.barcode||''},
  summary:`ActionFigure411 estima ${guide.soldAverage.toFixed(2)} ${guide.currency} para ${guide.title} usando las últimas ${guide.soldCount} ventas cerradas.${range}${bin} Es una estimación de mercado, no un precio fijo ni el precio que pagaste.`,
  facts:[...facts,...research.facts],
  sources:[source,...research.sources.filter(x=>x.id!==sourceId)],
  comparables:[comparable,...research.comparables.filter(x=>x.id!==sourceId)],
  asking:{kind:'sold',currency:guide.currency,count:guide.soldCount,min:guide.soldLow,max:guide.soldHigh,median:guide.soldAverage,label:`ActionFigure411 · media de ${guide.soldCount} ventas cerradas`,originalCurrency:guide.currency,originalMedian:guide.soldAverage},
  sold:{available:true,count:guide.soldCount,reason:guide.methodology,median:guide.soldAverage},
  links:{...research.links,actionFigure411:guide.url}
 };
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
}export async function identifyPhoto(images:string[]):Promise<AiIdentification>{
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
   ...(item.type==='figure'?{actionFigure411:'https://www.actionfigure411.com/'}:{}),
   ...(item.type==='figure'&&isMarvelLegendsFigure(item)?{legendsVerse:'https://legendsverse.com/price-guide'}:{}),
   ...(item.type==='funko'?{stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)}:{})
  }
 };
}
async function runGeneralResearch(item:Partial<InventoryDraft>):Promise<ResearchResult>{
 await keyReady.catch(()=>{});
 if(getPersonalKey())return researchDirect(item);
 return post<ResearchResult>('research',{confirmed:true,item});
}
function mergeResearchWarnings(research:ResearchResult,warnings:string[]):ResearchResult{
 const merged=[...warnings,...(research.warnings||[])].filter((v,i,a)=>v&&a.indexOf(v)===i);
 return {...research,warnings:merged};
}
function hasVerifiedValue(research:ResearchResult|null|undefined){
 return research?.asking?.median!=null&&Number.isFinite(research.asking.median);
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

 // Figuras no Funko: ActionFigure411 es la fuente principal de estimación.
 // Solo si no identifica con seguridad la pieza o no tiene ventas cerradas,
 // se continúa con las fuentes especializadas/generalistas de respaldo.
 if(item.type==='figure'){
  try{
   const guide=await readActionFigure411Value(item);
   if(guide){
    const withRates=await ensureUsdDisplayRates(baseResearch);
    return applyActionFigure411Value(withRates,item,guide);
   }
  }catch(error){
   warnings.push(`ActionFigure411: ${error instanceof Error?error.message:'no se pudo consultar la guía pública.'}`);
  }
 }

 // Marvel Legends: specialist fallback after ActionFigure411. If the exact piece
 // is not found there either, continue through the general public-source engine.
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

  let general:ResearchResult|null=null;
  try{
   general=mergeResearchWarnings(await runGeneralResearch(item),warnings);
   if(hasVerifiedValue(general))return general;
  }catch(error){
   warnings.push(`Fuentes generales: ${error instanceof Error?error.message:'no se pudo completar la búsqueda pública.'}`);
  }

  try{return await tryPriceCharting();}
  catch(error){warnings.push(`PriceCharting: ${error instanceof Error?error.message:'no se pudo leer el precio público.'}`);}

  return general?mergeResearchWarnings(general,warnings):{...baseResearch,warnings};
 }

 // Generic figures: search broad public figure sources first (Coleka/item pages,
 // exact shop/market evidence, FigureRealm for identity), then PriceCharting only
 // as an exact fallback.
 if(item.type==='figure'){
  let general:ResearchResult|null=null;
  try{
   general=mergeResearchWarnings(await runGeneralResearch(item),warnings);
   if(hasVerifiedValue(general))return general;
  }catch(error){
   warnings.push(`Fuentes generales: ${error instanceof Error?error.message:'no se pudo completar la búsqueda pública.'}`);
  }
  try{return await tryPriceCharting();}
  catch(error){warnings.push(`PriceCharting: ${error instanceof Error?error.message:'no se pudo leer el precio público.'}`);}
  return general?mergeResearchWarnings(general,warnings):{...baseResearch,warnings};
 }

 // Funkos keep PriceCharting first because that exact-guide behaviour already
 // works well; every other collectible uses the general engine first.
 if(item.type==='funko'){
  try{return await tryPriceCharting();}
  catch(error){warnings.push(`PriceCharting: ${error instanceof Error?error.message:'no se pudo leer el precio público.'}`);}
  try{return mergeResearchWarnings(await runGeneralResearch(item),warnings);}
  catch(error){return {...baseResearch,warnings:[...warnings,`Fuentes generales: ${error instanceof Error?error.message:'no se pudo completar la búsqueda pública.'}`]};}
 }

 let general:ResearchResult|null=null;
 try{
  general=mergeResearchWarnings(await runGeneralResearch(item),warnings);
  if(hasVerifiedValue(general))return general;
 }catch(error){
  warnings.push(`Fuentes generales: ${error instanceof Error?error.message:'no se pudo completar la búsqueda pública.'}`);
 }
 try{return await tryPriceCharting();}
 catch(error){warnings.push(`PriceCharting: ${error instanceof Error?error.message:'no se pudo leer el precio público.'}`);}
 return general?mergeResearchWarnings(general,warnings):{...baseResearch,warnings};
}
