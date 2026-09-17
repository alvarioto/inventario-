import { auth } from './firebase';
import { getPersonalKey, identifyDirect, researchDirect, keyReady } from './direct-ai';
import type { AiIdentification, InventoryDraft, ResearchResult } from '../types';
export type ApiStatus={deepseek:boolean;model:string;webSearch:boolean;publicSearch:boolean;mode:string;session?:string};
const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
const hobbyDbValueUrl=(import.meta.env.VITE_HOBBYDB_VALUE_URL||'').replace(/\/$/,'');
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
 for(const source of research?.sources||[]){
  try{
   const url=new URL(source.url);
   const host=url.hostname.toLowerCase().replace(/^www\./,'');
   if(host==='hobbydb.com'&&/\/catalog_items\/[^/?#]+/i.test(url.pathname))return url.href;
  }catch{}
 }
 return '';
}
function cleanFunkoIdentification(row:AiIdentification):AiIdentification{
 if(row.type!=='funko')return row;
 const variant=String(row.funkoVariant||'').trim();
 if(!variant)return row;
 const explicit=`${row.title||''} ${row.edition||''} ${(row.tags||[]).join(' ')}`;
 const explanation=String(row.explanation||'');
 const negativeChase=/(?:\bno\b|\bnot\b|\bwithout\b|\bsin\b).{0,28}\bchase\b/i.test(`${explicit} ${explanation}`);
 if(/^chase$/i.test(variant)&&(!/\bchase\b/i.test(explicit)||negativeChase))return {...row,funkoVariant:''};
 const specials=[['Flocked',/\bflocked\b/i],['Glow in the Dark',/glow in the dark|\bgitd\b/i],['Metallic',/\bmetallic\b/i],['Diamond',/\bdiamond(?: collection)?\b/i],['Black Light',/black light/i],['Chrome',/\bchrome\b/i]] as const;
 const known=specials.find(([name])=>name.toLowerCase()===variant.toLowerCase());
 if(known&&!known[1].test(explicit))return {...row,funkoVariant:''};
 return row;
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
