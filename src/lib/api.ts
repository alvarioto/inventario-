import { auth } from './firebase';
import type { AiIdentification, InventoryDraft, ResearchResult } from '../types';
export type ApiStatus={deepseek:boolean;model:string;webSearch:boolean;ebay:boolean;mode:string;session?:string};
const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
export async function getApiStatus():Promise<ApiStatus>{const r=await fetch(base+'/api/status');if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('El servidor de IA no está arrancado. Abre ABRIR-FRIKIVAULT.cmd.');return r.json()}
async function post<T>(route:string,payload:unknown):Promise<T>{
 const status=await getApiStatus();const token=await auth?.currentUser?.getIdToken();
 const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(status.session?{'X-FrikiVault-Session':status.session}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
 const result=await r.json();if(!r.ok)throw new Error(result.error||`Error HTTP ${r.status}`);return result;
}
export const identifyPhoto=(image:string)=>post<AiIdentification>('identify',{image});
export const investigate=(item:Partial<InventoryDraft>)=>post<ResearchResult>('research',{confirmed:true,item});
