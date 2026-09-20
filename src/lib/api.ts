import { auth } from './firebase';
import { getPersonalKey, identifyDirect, inspectFunkoStickersDirect, researchDirect, keyReady } from './direct-ai';
import { detectAllFunkoStickers, FUNKO_STICKERS } from './funko-stickers';
import type { AiIdentification, InventoryDraft, ResearchResult } from '../types';
export type ApiStatus={deepseek:boolean;model:string;webSearch:boolean;publicSearch:boolean;mode:string;session?:string};
const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
const priceChartingValueUrl=(import.meta.env.VITE_PRICECHARTING_VALUE_URL||'https://frikivault-hobbydb-api.vercel.app/api/pricecharting-value').replace(/\/$/,'');
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
export async function identifyPhoto(images:string[]):Promise<AiIdentification>{
 await keyReady.catch(()=>{});
 const direct=Boolean(getPersonalKey());
 const result=direct?await identifyDirect(images):await post<AiIdentification>('identify',{images});
 let audit:{performed:boolean;stickerTexts:string[];confidence:number}|undefined;
 if(result.type==='funko'&&direct) audit=await inspectFunkoStickersDirect(images);
 return cleanFunkoIdentification(result,audit);
}
export async function investigate(item:Partial<InventoryDraft>):Promise<ResearchResult>{
 await keyReady.catch(()=>{});
 const research=await (getPersonalKey()?researchDirect(item):post<ResearchResult>('research',{confirmed:true,item}));
 try{const guide=await readPriceChartingValue(item);if(!guide)return research;const withRates=await ensureUsdDisplayRates(research);return applyPriceChartingValue(withRates,guide);}
 catch(error){return {...research,warnings:[`PriceCharting: ${error instanceof Error?error.message:'no se pudo leer el precio público.'}`,...research.warnings]};}
}
