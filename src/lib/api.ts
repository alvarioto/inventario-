import { auth } from './firebase';
import { getPersonalKey, identifyDirect, inspectFunkoStickersDirect, keyReady, researchDirect } from './direct-ai';
import { detectAllFunkoStickers, FUNKO_STICKERS } from './funko-stickers';
import { lookupActionFigure411InBrowser, type ActionFigure411BrowserValue } from './actionfigure411-browser';
import type { AiIdentification, InventoryDraft, ResearchResult } from '../types';
export type ApiStatus={deepseek:boolean;model:string;webSearch:boolean;publicSearch:boolean;mode:string;session?:string};
const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
const legendsVerseValueUrl=(import.meta.env.VITE_LEGENDSVERSE_VALUE_URL||'https://frikivault-hobbydb-api.vercel.app/api/legendsverse-value').replace(/\/$/,'');
const ebayMarketValueUrl=(import.meta.env.VITE_EBAY_MARKET_VALUE_URL||'https://frikivault-hobbydb-api.vercel.app/api/ebay-market-value').replace(/\/$/,'');
const exchangeRatesUrl=(import.meta.env.VITE_EXCHANGE_RATES_URL||'https://frikivault-hobbydb-api.vercel.app/api/exchange-rates').replace(/\/$/,'');
export async function getApiStatus():Promise<ApiStatus>{await keyReady.catch(()=>{});if(getPersonalKey())return {deepseek:true,model:'deepseek-flash',webSearch:true,publicSearch:true,mode:'direct'};const r=await fetch(base+'/api/status');if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('Configura IA directa en Ajustes para analizar fotos con tu clave de DeepSeek.');return r.json()}
async function post<T>(route:string,payload:unknown):Promise<T>{
 const status=await getApiStatus();const token=await auth?.currentUser?.getIdToken();
 const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(status.session?{'X-FrikiVault-Session':status.session}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`Error HTTP ${r.status}`);return result;
}
async function legendsVersePost(payload:unknown){
 const r=await fetch(legendsVerseValueUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`LegendsVerse HTTP ${r.status}`);return result;
}
async function ebayMarketPost(payload:unknown){
 const r=await fetch(ebayMarketValueUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`eBay HTTP ${r.status}`);return result;
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
function validGtin(value:unknown){
 const raw=String(value||'').replace(/[^0-9]/g,'');
 if(![8,12,13,14].includes(raw.length))return'';
 let sum=0,weight=3;
 for(let i=raw.length-2;i>=0;i--){
  sum+=Number(raw[i])*weight;
  weight=weight===3?1:3;
 }
 const expected=String((10-(sum%10))%10);
 return raw.at(-1)===expected?raw:'';
}
async function readActionFigure411Value(item:Partial<InventoryDraft>){
 if(item.type!=='figure')return null;
 const result=await lookupActionFigure411InBrowser(item);
 if(result.status==='completed'&&result.value)return result.value;
 throw new Error('ActionFigure411 no devolvió una estimación verificable desde el navegador.');
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

type EbayExactListing={
 itemId:string;title:string;url:string;price:number;currency:string;shipping:number|null;
 condition:string;score:number;matchedBy:string[];
};
type EbayMarketValue={
 ok:boolean;found:boolean;source?:string;marketplace?:string;targetSample?:number;minimumSample?:number;
 average?:number;min?:number;max?:number;currency?:string;count?:number;listings?:EbayExactListing[];
 methodology?:string;reason?:string;singleReference?:boolean;
 resolvedIdentity?:{popNumber?:string;funkoCategory?:string;barcode?:string};
};
async function readEbayMarketValue(item:Partial<InventoryDraft>):Promise<EbayMarketValue|null>{
 if(!ebayMarketValueUrl)return null;
 const result=await ebayMarketPost({item:{
  type:item.type||'other',title:item.title||'',franchise:item.franchise||'',character:item.character||'',
  manufacturer:item.manufacturer||'',line:item.line||'',scale:item.scale||'',wave:item.wave||'',
  exclusive:item.exclusive||'',edition:item.edition||'',issueNumber:item.issueNumber||'',volume:item.volume||'',
  setName:item.setName||'',cardNumber:item.cardNumber||'',rarity:item.rarity||'',platform:item.platform||'',
  year:item.year||null,barcode:item.barcode||'',isbn:item.isbn||'',sku:item.sku||'',
  popNumber:item.popNumber||'',funkoCategory:item.funkoCategory||'',funkoVariant:item.funkoVariant||'',
  signed:Boolean(item.signed),signedBy:item.signedBy||''
 }});
 return result as EbayMarketValue;
}
function applyEbayMarketValue(research:ResearchResult,market:EbayMarketValue):ResearchResult{
 const listings=(market.listings||[]).filter(row=>Number.isFinite(row.price)&&row.price>0&&row.url);
 const currency=String(market.currency||listings[0]?.currency||'EUR').toUpperCase();
 const average=Number(market.average);
 const min=Number(market.min);
 const max=Number(market.max);
 const sources=listings.map((row,index)=>({
  id:`ebay-exact-${row.itemId||index}`,
  kind:'ebay-exact-market',
  title:row.title,
  url:row.url,
  snippet:`Coincidencia exacta verificada · ${row.price.toFixed(2)} ${row.currency}${row.condition?` · ${row.condition}`:''}`
 }));
 const comparables=listings.map((row,index)=>({
  id:`ebay-exact-${row.itemId||index}`,
  title:row.title,
  url:row.url,
  price:row.price,
  currency:row.currency,
  shipping:row.shipping,
  condition:row.condition||'Anuncio activo',
  sourceType:'market' as const,
  originalPrice:row.price,
  originalCurrency:row.currency
 }));
 const sourceId=sources[0]?.id||'ebay-exact-market';
 const eurRate=Number(research.exchangeRates?.EUR);
 const asUsd=(value:number)=>currency==='USD'?value:currency==='EUR'&&Number.isFinite(eurRate)&&eurRate>0?value/eurRate:null;
 const asEur=(value:number)=>currency==='EUR'?value:currency==='USD'&&Number.isFinite(eurRate)&&eurRate>0?value*eurRate:null;
 const dual=(value:number)=>{
  const eur=asEur(value),usd=asUsd(value);
  if(eur!=null&&usd!=null)return `${eur.toFixed(2)} EUR · ${usd.toFixed(2)} USD`;
  return `${value.toFixed(2)} ${currency}`;
 };
 const single=Boolean(market.singleReference||(market.count||listings.length)===1);
 const facts=[
  {label:'Anuncios exactos usados',value:String(market.count||listings.length),sourceId},
  {label:single?'Referencia eBay exacta':'Promedio eBay',value:dual(average),sourceId},
  ...(!single?[{label:'Rango eBay',value:`${dual(min)} – ${dual(max)}`,sourceId}]:[])
 ];
 return {
  ...research,
  summary:single
    ?`eBay: 1 anuncio activo verificado mediante identificador exacto para el mismo artículo: ${dual(average)}. Es una referencia orientativa, no un promedio ni una venta cerrada.`
    :`eBay: promedio de ${market.count||listings.length} anuncios activos verificados como exactamente el mismo artículo: ${dual(average)}. No se incluyen coincidencias parciales.`,
  facts:[...facts,...research.facts.filter(f=>!f.label.toLowerCase().includes('ebay'))],
  sources:[...sources,...research.sources.filter(x=>!x.url.includes('ebay.'))],
  listings:[...comparables,...research.listings.filter(x=>!x.url.includes('ebay.'))],
  comparables:[...comparables,...research.comparables.filter(x=>!x.url.includes('ebay.'))],
  asking:{kind:'market',currency,count:market.count||listings.length,min,max,median:average,label:single?'Referencia eBay · 1 anuncio exacto':`Promedio eBay · ${market.count||listings.length} anuncios exactos`,originalCurrency:currency,originalMedian:average},
  sold:{available:false,count:0,median:null,reason:'La Browse API de eBay aporta anuncios activos; este valor no representa ventas cerradas.'},
  resolvedIdentity:market.resolvedIdentity?{...(research.resolvedIdentity||{}),...market.resolvedIdentity}:research.resolvedIdentity,
  warnings:[...(research.warnings||[]),single?'eBay: referencia basada en 1 anuncio activo exacto; úsala como orientación, no como valor de venta confirmado.':'eBay: valoración basada en precios solicitados de anuncios activos exactos, no en ventas cerradas.'].filter((v,i,a)=>a.indexOf(v)===i)
 };
}
async function ensureUsdDisplayRates(research:ResearchResult):Promise<ResearchResult>{
 if(research.exchangeRates?.EUR)return research;
 try{
  const response=await fetch(exchangeRatesUrl,{signal:AbortSignal.timeout(15000)});
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
function applyActionFigure411Value(research:ResearchResult,item:Partial<InventoryDraft>,guide:ActionFigure411BrowserValue):ResearchResult{
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
}export async function identifyPhoto(images:string[],correction=''):Promise<AiIdentification>{
 await keyReady.catch(()=>{});
 const direct=Boolean(getPersonalKey());
 const result=direct?await identifyDirect(images,correction):await post<AiIdentification>('identify',{images,correction});
 let audit:{performed:boolean;stickerTexts:string[];confidence:number}|undefined;
 if(result.type==='funko'&&direct) audit=await inspectFunkoStickersDirect(images);
 const cleaned=cleanFunkoIdentification(result,audit);
 // Un EAN/UPC con checksum inválido nunca debe ganar a SKU, texto de caja o
 // una lectura posterior del mercado exacto.
 return {...cleaned,barcode:validGtin(cleaned.barcode)};
}
function freeResearchShell(item:Partial<InventoryDraft>):ResearchResult{
 const identity=[item.manufacturer,item.line,item.character||item.title,item.wave,item.edition,item.exclusive,item.year,item.popNumber,item.funkoVariant,item.signed?item.signedBy:'',item.signed?'Signed Autographed':''].filter(Boolean).join(' ').replace(/\s+/g,' ').trim()||String(item.title||'').trim();
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
function isLegacyPriceChartingSource(value:unknown){
 return /pricecharting/i.test(String(value||''));
}
export function researchUsesPriceCharting(research:ResearchResult|null|undefined){
 if(!research)return false;
 if(isLegacyPriceChartingSource(research.summary)||isLegacyPriceChartingSource(research.asking?.label))return true;
 if(Boolean(research.links?.priceCharting))return true;
 if((research.sources||[]).some(source=>isLegacyPriceChartingSource(`${source.title||''} ${source.url||''}`)))return true;
 if((research.listings||[]).some(row=>isLegacyPriceChartingSource(`${row.title||''} ${row.url||''}`)))return true;
 if((research.comparables||[]).some(row=>isLegacyPriceChartingSource(`${row.title||''} ${row.url||''}`)))return true;
 if((research.facts||[]).some(fact=>isLegacyPriceChartingSource(`${fact.label||''} ${fact.value||''}`)))return true;
 return (research.warnings||[]).some(warning=>isLegacyPriceChartingSource(warning));
}
export function primaryValueUsesPriceCharting(research:ResearchResult|null|undefined){
 if(!research)return false;
 if(isLegacyPriceChartingSource(research.asking?.label))return true;
 if(/^pricecharting\b/i.test(String(research.summary||'').trim()))return true;
 const primary=(research.comparables||[]).find(row=>row.sourceType==='guide'||row.sourceType==='sold');
 return Boolean(primary&&isLegacyPriceChartingSource(`${primary.title||''} ${primary.url||''}`));
}
export function stripPriceChartingResearch(research:ResearchResult|undefined):ResearchResult|undefined{
 if(!research||!researchUsesPriceCharting(research))return research;
 const primary=primaryValueUsesPriceCharting(research);
 const isPcRow=(row:{title?:string;url?:string})=>isLegacyPriceChartingSource(`${row.title||''} ${row.url||''}`);
 const sources=(research.sources||[]).filter(row=>!isPcRow(row));
 const listings=(research.listings||[]).filter(row=>!isPcRow(row));
 const comparables=(research.comparables||[]).filter(row=>!isPcRow(row));
 const links={...research.links};
 delete links.priceCharting;
 const facts=(research.facts||[]).filter(fact=>!isLegacyPriceChartingSource(`${fact.label||''} ${fact.value||''}`));
 const warnings=(research.warnings||[]).filter(warning=>!isLegacyPriceChartingSource(warning));
 return {
  ...research,
  summary:primary?'La valoración anterior se ha retirado. Vuelve a analizar para buscar fuentes alternativas.':research.summary.replace(/[^.]*pricecharting[^.]*\.?/ig,'').replace(/\s+/g,' ').trim(),
  sources,listings,comparables,facts,warnings,links,
  asking:primary?{...research.asking,kind:'none',count:0,min:null,max:null,median:null,label:'Sin valoración verificada',originalCurrency:null,originalMedian:null}:research.asking
 };
}
export function forbiddenPriceChartingForItem(item:Partial<InventoryDraft>&{research?:ResearchResult|null}){
 return primaryValueUsesPriceCharting(item.research);
}
export function preserveVerifiedResearch(previous:ResearchResult|undefined,next:ResearchResult,itemType?:InventoryDraft['type']):ResearchResult{
 if(researchUsesPriceCharting(previous))return next;
 if(hasVerifiedValue(next)||!hasVerifiedValue(previous))return next;
 const checked=previous?.checkedAt?new Date(previous.checkedAt):null;
 const when=checked&&!Number.isNaN(checked.getTime())?checked.toLocaleString('es-ES'):'anteriormente';
 const warning=`No se ha podido actualizar el precio ahora. Se mantiene la última valoración verificada (${when}).`;
 return {
  ...previous!,
  warnings:[warning,...(next.warnings||[]),...(previous?.warnings||[])].filter((v,i,a)=>v&&a.indexOf(v)===i)
 };
}
export async function investigate(item:Partial<InventoryDraft>):Promise<ResearchResult>{
 const baseResearch=freeResearchShell(item);
 const warnings:string[]=[];
 const tryEbayExact=async(previous:ResearchResult|null)=>{
  try{
   const market=await readEbayMarketValue(item);
   if(market?.found&&market.average!=null&&market.min!=null&&market.max!=null){
    const seed=previous?mergeResearchWarnings(previous,warnings):{...baseResearch,warnings:[...warnings]};
    const withRates=await ensureUsdDisplayRates(seed);
    return applyEbayMarketValue(withRates,market);
   }
   if(market?.reason)warnings.push(`eBay: ${market.reason}`);
  }catch(error){
   warnings.push(`eBay: ${error instanceof Error?error.message:'no se pudo consultar el mercado exacto.'}`);
  }
  return null;
 };

 // Firmados: únicamente comparables que acrediten la firma.
 if(item.signed===true){
  if(!String(item.signedBy||'').trim()){
   warnings.push('Firmado: indica “Firmado por” para evitar mezclar firmas distintas.');
  }
  const ebay=await tryEbayExact(null);
  if(ebay)return ebay;
  let general:ResearchResult|null=null;
  try{
   general=mergeResearchWarnings(await runGeneralResearch(item),warnings);
   if(hasVerifiedValue(general))return general;
  }catch(error){
   warnings.push(`Fuentes firmadas: ${error instanceof Error?error.message:'no se pudo completar la búsqueda pública.'}`);
  }
  warnings.push('No se encontró una valoración firmada verificable. No se usa el precio de una unidad normal como sustituto.');
  return general?mergeResearchWarnings(general,warnings):{...baseResearch,warnings};
 }

 // Figuras: ActionFigure411 primero; Marvel Legends añade LegendsVerse.
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
  if(isMarvelLegendsFigure(item)){
   try{
    const guide=await readLegendsVerseValue(item);
    if(guide){
     const withRates=await ensureUsdDisplayRates(baseResearch);
     return applyLegendsVerseValue(withRates,item,guide);
    }
   }catch(error){
    warnings.push(`LegendsVerse: ${error instanceof Error?error.message:'no se pudo consultar la guía pública.'}`);
   }
  }
  let general:ResearchResult|null=null;
  try{
   general=mergeResearchWarnings(await runGeneralResearch(item),warnings);
   if(hasVerifiedValue(general))return general;
  }catch(error){
   warnings.push(`Fuentes generales: ${error instanceof Error?error.message:'no se pudo completar la búsqueda pública.'}`);
  }
  const ebay=await tryEbayExact(general);
  if(ebay)return ebay;
  return general?mergeResearchWarnings(general,warnings):{...baseResearch,warnings};
 }

 // Funkos: eBay exacto resuelve identidad y valor; otras fuentes públicas sirven de respaldo.
 if(item.type==='funko'){
  let ebayMarket:EbayMarketValue|null=null;
  try{
   ebayMarket=await readEbayMarketValue(item);
   if(ebayMarket?.resolvedIdentity){
    item={...item,...ebayMarket.resolvedIdentity,barcode:ebayMarket.resolvedIdentity.barcode||item.barcode};
   }
   if(ebayMarket?.reason)warnings.push(`eBay: ${ebayMarket.reason}`);
  }catch(error){
   warnings.push(`eBay: ${error instanceof Error?error.message:'no se pudo consultar el mercado exacto.'}`);
  }

  let general:ResearchResult|null=null;
  try{
   general=mergeResearchWarnings(await runGeneralResearch(item),warnings);
   if(hasVerifiedValue(general)&&['sold','guide'].includes(general.asking.kind))return general;
  }catch(error){
   warnings.push(`Fuentes generales: ${error instanceof Error?error.message:'no se pudo completar la búsqueda pública.'}`);
  }

  if(ebayMarket?.found&&ebayMarket.average!=null&&ebayMarket.min!=null&&ebayMarket.max!=null){
   const seed=general?mergeResearchWarnings(general,warnings):{...baseResearch,warnings:[...warnings]};
   const withRates=await ensureUsdDisplayRates(seed);
   return applyEbayMarketValue(withRates,ebayMarket);
  }
  if(hasVerifiedValue(general))return general!;
  return general?mergeResearchWarnings(general,warnings):{...baseResearch,warnings};
 }

 // Cómics y manga usan exactamente las mismas fuentes públicas + eBay,
 // pero dejamos la rama explícita para mantener su política separada.
 if(item.type==='comic'||item.type==='manga'){
  // Sin fuente de guía retirada: continúa con fuentes públicas exactas.
 }

 // Cómics, manga y resto: fuentes públicas exactas + eBay.
 let general:ResearchResult|null=null;
 try{
  general=mergeResearchWarnings(await runGeneralResearch(item),warnings);
  if(hasVerifiedValue(general))return general;
 }catch(error){
  warnings.push(`${item.type==='comic'||item.type==='manga'?'Fuentes de cómic':'Fuentes generales'}: ${error instanceof Error?error.message:'no se pudo completar la búsqueda pública.'}`);
 }
 const ebay=await tryEbayExact(general);
 if(ebay)return ebay;
 return general?mergeResearchWarnings(general,warnings):{...baseResearch,warnings};
}
