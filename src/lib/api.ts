import { auth } from './firebase';
import { getPersonalKey, identifyDirect, inspectFunkoStickersDirect, researchDirect, keyReady } from './direct-ai';
import { detectAllFunkoStickers, FUNKO_STICKERS } from './funko-stickers';
import type { AiIdentification, InventoryDraft, ResearchResult } from '../types';
export type ApiStatus={deepseek:boolean;model:string;webSearch:boolean;publicSearch:boolean;mode:string;session?:string};
const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
const hobbyDbValueUrl=(import.meta.env.VITE_HOBBYDB_VALUE_URL||'https://frikivault-hobbydb-api-aldipo7292-6258.vercel.app/api/hobbydb-value').replace(/\/$/,'');
export async function getApiStatus():Promise<ApiStatus>{await keyReady.catch(()=>{});if(getPersonalKey())return {deepseek:true,model:'deepseek-flash',webSearch:true,publicSearch:true,mode:'direct'};const r=await fetch(base+'/api/status');if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('Configura IA directa en Ajustes para analizar fotos con tu clave de DeepSeek.');return r.json()}
async function post<T>(route:string,payload:unknown):Promise<T>{
 const status=await getApiStatus();const token=await auth?.currentUser?.getIdToken();
 const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(status.session?{'X-FrikiVault-Session':status.session}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`Error HTTP ${r.status}`);return result;
}
async function hobbyDbPost(payload:unknown){
 const r=await fetch(hobbyDbValueUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`hobbyDB HTTP ${r.status}`);return result;
}
function hobbyDbSourceUrl(research?:ResearchResult){
 const candidates=[research?.links?.ppg,...(research?.sources||[]).map(source=>source.url)].filter(Boolean) as string[];
 for(const raw of candidates){
  try{
   const url=new URL(raw);
   const host=url.hostname.toLowerCase().replace(/^www\./,'');
   if(host==='hobbydb.com'&&/\/marketplaces\/hobbydb\/catalog_items(?:\/|$)/i.test(url.pathname))return url.href;
  }catch{}
 }
 return '';
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
 const clean=cleanKnownStickerWords(title);
 return variant?`${clean} ${variant}`.replace(/\s+/g,' ').trim():clean;
}
function cleanFunkoIdentification(row:AiIdentification,audit?:{performed:boolean;stickerTexts:string[];confidence:number}):AiIdentification{
 if(row.type!=='funko')return row;

 // Si la segunda pasada especializada se ejecutó, SOLO su transcripción literal decide stickers.
 // Si no pudo leerlos, no se conserva una variante inventada por el primer análisis.
 const fallbackEvidence=`${row.edition||''} ${(row.tags||[]).join(' ')} ${row.explanation||''}`.trim();
 const evidence=audit?.performed?(audit.stickerTexts||[]).join(' | '):fallbackEvidence;
 const hits=detectAllFunkoStickers(evidence);
 const variantHits=hits.filter(hit=>hit.definition.kind==='variant');
 const primaryVariant=variantHits.find(hit=>hit.definition.id==='chase')||variantHits[0]||null;
 const finalVariant=primaryVariant?.definition.variant||'';

 const identityStickers=hits.filter(hit=>hit.definition.kind!=='variant').map(hit=>hit.definition.label);
 const variantLabels=variantHits.map(hit=>hit.definition.label);
 const stickerLabels=[...new Set([...variantLabels,...identityStickers])];

 // Quitamos de título/edición las variantes que el primer análisis pudo inventar y reconstruimos
 // únicamente a partir de stickers realmente leídos. Los stickers de tienda/convenio se guardan
 // como edición/tags, pero NO se convierten en variante.
 const title=cleanFunkoTitle(String(row.title||''),finalVariant);
 const baseEdition=cleanKnownStickerWords(String(row.edition||''));
 const edition=[baseEdition,...identityStickers].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');
 const tags=[...new Set([...(row.tags||[]).filter(tag=>!FUNKO_STICKERS.some(s=>[...s.exactTexts,...s.aliases].some(x=>tag.toLowerCase().includes(x.toLowerCase())))),...stickerLabels])];

 return {...row,title,funkoVariant:finalVariant,edition,tags};
}
async function readHobbyDbValue(item:Partial<InventoryDraft>,research?:ResearchResult){
 if(!hobbyDbValueUrl||item.type!=='funko'||!item.character||!item.popNumber)return null;
 const identity={character:item.character,popNumber:item.popNumber,funkoVariant:item.funkoVariant||'Classic',hobbydbUrl:hobbyDbSourceUrl(research)||undefined};
 const result=await hobbyDbPost({item:identity});
 if(result.status==='completed'&&result.value)return result.value as {amount:number;currency:'USD';url:string;evidence:string;variant:string};
 throw new Error('hobbyDB no devolvió un Estimated Value verificable.');
}
function applyHobbyDbValue(research:ResearchResult,guide:{amount:number;currency:'USD';url:string;evidence:string;variant:string}):ResearchResult{
 const sourceId='hobbydb-estimated-value';
 const source={id:sourceId,kind:'price-guide',title:'hobbyDB Estimated Value',url:guide.url,snippet:guide.evidence};
 const comparable={id:sourceId,title:`hobbyDB · ${guide.variant}`,url:guide.url,price:guide.amount,currency:'USD',shipping:null,condition:'Price Guide',sourceType:'guide' as const,originalPrice:guide.amount,originalCurrency:'USD'};
 return {...research,
  summary:`hobbyDB publica un Estimated Value de $${guide.amount.toFixed(2)} USD. El resto de precios se mantiene como referencia orientativa de mercado.`,
  sources:[source,...research.sources.filter(x=>x.id!==sourceId)],
  comparables:[comparable,...research.comparables.filter(x=>x.id!==sourceId)],
  asking:{kind:'guide',currency:'USD',count:1,min:guide.amount,max:guide.amount,median:guide.amount,label:'Valor hobbyDB',originalCurrency:'USD',originalMedian:guide.amount},
  links:{...research.links,ppg:guide.url}
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
export async function investigate(item:Partial<InventoryDraft>):Promise<ResearchResult>{
 await keyReady.catch(()=>{});
 const research=await (getPersonalKey()?researchDirect(item):post<ResearchResult>('research',{confirmed:true,item}));
 try{const guide=await readHobbyDbValue(item,research);return guide?applyHobbyDbValue(research,guide):research;}
 catch(error){return {...research,warnings:[`hobbyDB: ${error instanceof Error?error.message:'no se pudo leer el Estimated Value.'}`,...research.warnings]};}
}
