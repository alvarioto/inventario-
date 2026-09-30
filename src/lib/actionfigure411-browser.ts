import type { InventoryDraft } from '../types';

export interface ActionFigure411BrowserValue {
  source: 'ActionFigure411';
  amount: number;
  currency: 'USD' | 'EUR' | 'GBP';
  url: string;
  searchUrl: string;
  id?: number | null;
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

type RemoteReply =
  | { status: 'completed'; value: ActionFigure411BrowserValue }
  | { error: string; debug?: unknown };

const actionFigure411ValueUrl=(
  import.meta.env.VITE_ACTIONFIGURE411_VALUE_URL ||
  'https://frikivault-hobbydb-api.vercel.app/api/actionfigure411-zenrows'
).replace(/\/$/,'');

function identityPayload(item:Partial<InventoryDraft>){
  return {
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
    barcode:item.barcode||'',
    tags:Array.isArray(item.tags)?item.tags.slice(0,12):[],
    aiExplanation:item.aiExplanation||''
  };
}

function validateValue(value:ActionFigure411BrowserValue){
  if(!value||value.source!=='ActionFigure411')throw new Error('Respuesta inválida de ActionFigure411.');
  if(!value.url||!value.title)throw new Error('ActionFigure411 no devolvió una ficha individual válida.');
  if(!Number.isFinite(value.soldAverage)||value.soldAverage<=0||value.soldCount<=0){
    throw new Error('La ficha exacta no publica una media verificable de ventas cerradas.');
  }
  return value;
}

export async function lookupActionFigure411InBrowser(
  item:Partial<InventoryDraft>
):Promise<{status:'completed';value:ActionFigure411BrowserValue}>{
  if(item.type!=='figure')throw new Error('ActionFigure411 solo se consulta para figuras.');
  const response=await fetch(actionFigure411ValueUrl,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({item:identityPayload(item)}),
    signal:AbortSignal.timeout(90000)
  });
  let payload:RemoteReply;
  try{payload=await response.json() as RemoteReply}
  catch{throw new Error(`ActionFigure411 devolvió una respuesta no válida (HTTP ${response.status}).`)}
  if(!response.ok||!('status' in payload)||payload.status!=='completed'){
    const error='error' in payload?payload.error:`ActionFigure411 HTTP ${response.status}`;
    throw new Error(error||'ActionFigure411 no pudo completar la consulta.');
  }
  return {status:'completed',value:validateValue(payload.value)};
}
