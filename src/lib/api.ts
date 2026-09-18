import { auth } from './firebase';
import { getPersonalKey, identifyDirect, researchDirect, keyReady } from './direct-ai';
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

type KnownFunkoVariant='Chase'|'Flocked'|'Glow in the Dark'|'Metallic'|'Diamond Collection'|'Black Light'|'Chrome';
const funkoVariantRules:{label:KnownFunkoVariant;re:RegExp}[]=[
 {label:'Chase',re:/\bchase\b/i},
 {label:'Flocked',re:/\bflocked\b/i},
 {label:'Glow in the Dark',re:/\bglow in the dark\b|\bgitd\b/i},
 {label:'Metallic',re:/\bmetallic\b/i},
 {label:'Diamond Collection',re:/\bdiamond(?: collection)?\b/i},
 {label:'Black Light',re:/\bblack light\b/i},
 {label:'Chrome',re:/\bchrome\b/i}
];
function canonicalFunkoVariant(value:string):KnownFunkoVariant|''{
 const raw=String(value||'').trim();
 return funkoVariantRules.find(rule=>rule.re.test(raw))?.label||'';
}
function negativeVariantEvidence(text:string,rule:RegExp){
 const source=rule.source.replace(/^\\b|\\b$/g,'');
 return new RegExp(`(?:\\bno\\b|\\bnot\\b|\\bwithout\\b|\\bsin\\b|\\bno se ve\\b|\\bno visible\\b).{0,36}(?:${source})`,'i').test(text);
}
function stickerVariantEvidence(text:string,rule:RegExp){
 const cue='(?:sticker|pegatina|sello|etiqueta)';
 const source=rule.source.replace(/^\\b|\\b$/g,'');
 return new RegExp(`${cue}.{0,42}(?:${source})|(?:${source}).{0,42}${cue}`,'i').test(text)&&!negativeVariantEvidence(text,rule);
}
function cleanFunkoTitle(title:string,variant:KnownFunkoVariant|''){
 let clean=String(title||'').replace(/\bchase\b|\bflocked\b|\bglow in the dark\b|\bgitd\b|\bmetallic\b|\bdiamond(?: collection)?\b|\bblack light\b|\bchrome\b/gi,' ').replace(/\s+/g,' ').trim();
 if(variant)clean=`${clean} ${variant}`.trim();
 return clean;
}
function cleanFunkoIdentification(row:AiIdentification):AiIdentification{
 if(row.type!=='funko')return row;

 // No usamos el título generado como prueba de variante: el propio modelo puede haberla inventado ahí.
 // Solo aceptamos una variante especial si existe evidencia textual positiva en lo observado/descrito.
 const evidence=`${row.edition||''} ${(row.tags||[]).join(' ')} ${row.explanation||''}`.trim();
 const claimed=canonicalFunkoVariant(String(row.funkoVariant||''));

 // Una pegatina cuyo texto se ha leído explícitamente manda sobre cualquier inferencia previa.
 // Chase tiene prioridad porque puede coexistir con acabados/ediciones y es la distinción comercial clave.
 const stickerHits=funkoVariantRules.filter(rule=>stickerVariantEvidence(evidence,rule.re));
 const sticker=stickerHits.find(rule=>rule.label==='Chase')||stickerHits[0];

 // Si no hay lectura explícita de pegatina, exigimos al menos que el nombre de la variante aparezca
 // positivamente en edición/tags/explicación. Ver "una pegatina" por sí solo NO basta.
 const positiveHits=funkoVariantRules.filter(rule=>rule.re.test(evidence)&&!negativeVariantEvidence(evidence,rule.re));
 const positive=positiveHits.find(rule=>rule.label==='Chase')||positiveHits[0];
 const resolved=sticker?.label||positive?.label||'';

 // Si el modelo afirmó Diamond/Chase/etc. sin evidencia literal, se elimina en vez de adivinar.
 // Si afirmó una variante distinta a la que realmente leyó en la pegatina, se corrige.
 const finalVariant=resolved||(claimed?'':'');
 const title=cleanFunkoTitle(String(row.title||''),finalVariant);
 return {...row,title,funkoVariant:finalVariant};
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
 const result=getPersonalKey()?await identifyDirect(images):await post<AiIdentification>('identify',{images});
 return cleanFunkoIdentification(result);
}
export async function investigate(item:Partial<InventoryDraft>):Promise<ResearchResult>{
 await keyReady.catch(()=>{});
 const research=await (getPersonalKey()?researchDirect(item):post<ResearchResult>('research',{confirmed:true,item}));
 try{const guide=await readHobbyDbValue(item,research);return guide?applyHobbyDbValue(research,guide):research;}
 catch(error){return {...research,warnings:[`hobbyDB: ${error instanceof Error?error.message:'no se pudo leer el Estimated Value.'}`,...research.warnings]};}
}
