import type { InventoryDraft } from '../types';

export interface ActionFigure411BrowserValue {
  source: 'ActionFigure411';
  amount: number;
  currency: 'USD' | 'EUR' | 'GBP';
  url: string;
  searchUrl: string;
  title: string;
  genre: string;
  group: string;
  wave: string;
  year: number | null;
  retail: number | null;
  upc: string;
  soldCount: number;
  soldAverage: number;
  soldHigh: number | null;
  soldLow: number | null;
  buyItNowAverage: number | null;
  activeFilteredCount: number;
  activeTotalCount: number;
  evidence: string;
  methodology: string;
}

type BridgeReply =
  | { ok: true; value: ActionFigure411BrowserValue }
  | { ok: false; error: string };

const WEB_SOURCE='frikivault-web';
const EXT_SOURCE='frikivault-af411-extension';

function requestId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
}

function waitForMessage<T>(id:string,type:string,timeoutMs:number):Promise<T>{
  return new Promise((resolve,reject)=>{
    const timer=window.setTimeout(()=>{
      window.removeEventListener('message',onMessage);
      reject(new Error(type==='AF411_READY'?'No se detecta el puente de Chrome de ActionFigure411.':'La búsqueda en ActionFigure411 tardó demasiado.'));
    },timeoutMs);
    function onMessage(event:MessageEvent){
      if(event.source!==window)return;
      const data=event.data;
      if(!data||data.source!==EXT_SOURCE||data.type!==type||data.requestId!==id)return;
      window.clearTimeout(timer);
      window.removeEventListener('message',onMessage);
      resolve(data.payload as T);
    }
    window.addEventListener('message',onMessage);
  });
}

async function ensureBridge(){
  const id=requestId();
  const answer=waitForMessage<{ready:boolean}>(id,'AF411_READY',900);
  window.postMessage({source:WEB_SOURCE,type:'AF411_PING',requestId:id},'*');
  const result=await answer;
  if(!result?.ready)throw new Error('El puente de Chrome de ActionFigure411 no está disponible.');
}

export async function lookupActionFigure411InBrowser(item:Partial<InventoryDraft>):Promise<{status:'completed';value:ActionFigure411BrowserValue}>{
  if(typeof window==='undefined')throw new Error('ActionFigure411 necesita ejecutarse desde el navegador.');
  await ensureBridge();
  const id=requestId();
  const answer=waitForMessage<BridgeReply>(id,'AF411_RESULT',65000);
  window.postMessage({
    source:WEB_SOURCE,
    type:'AF411_LOOKUP',
    requestId:id,
    payload:{item:{
      type:item.type,
      title:item.title||'',
      character:item.character||'',
      manufacturer:item.manufacturer||'',
      line:item.line||'',
      franchise:item.franchise||'',
      edition:item.edition||'',
      wave:item.wave||'',
      exclusive:item.exclusive||'',
      year:item.year||null,
      sku:item.sku||'',
      barcode:item.barcode||''
    }}
  },'*');
  const reply=await answer;
  if(!reply?.ok)throw new Error(reply?.error||'El navegador no pudo completar la consulta de ActionFigure411.');
  return {status:'completed',value:reply.value};
}
