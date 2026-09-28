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

type SearchPayload = {
  found?: boolean;
  title?: string;
  url?: string;
  genre?: string;
  group?: string;
  wave?: string;
  year?: number | null;
  retail?: number | null;
  upc?: string;
  soldCount?: number;
  soldAverage?: number | null;
  soldHigh?: number | null;
  soldLow?: number | null;
  buyItNowAverage?: number | null;
  activeFilteredCount?: number;
  activeTotalCount?: number;
};

const WEB_SOURCE='frikivault-web';
const EXT_SOURCE='frikivault-af411-extension';
const DEEPSEEK_KEY_PREFIX='frikivault.deepseek.personal.v1';

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

function normalize(value:unknown){
  return String(value??'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}

function compactIdentity(item:Partial<InventoryDraft>){
  const manufacturer=String(item.manufacturer||'').trim();
  const line=String(item.line||'').trim();
  const edition=String(item.edition||'').trim();
  const character=String(item.character||'').trim();
  let title=String(item.title||'').trim();

  for(const repeated of [manufacturer,line]){
    const escaped=repeated.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(escaped)title=title.replace(new RegExp(`^(?:${escaped})\\s+`,'i'),'').trim();
  }
  const subject=character&&normalize(character)!==normalize(line)?character:title;
  const parts=[manufacturer,line,edition,subject,item.sku?`SKU ${item.sku}`:'',item.barcode?`UPC ${item.barcode}`:'']
    .map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(Boolean);
  const out:string[]=[];
  for(const part of parts){
    const n=normalize(part);
    if(!n)continue;
    if(out.some(existing=>normalize(existing)===n))continue;
    out.push(part);
  }
  return out.join(' ').replace(/\s+/g,' ').trim();
}

function readPersonalDeepSeekKey(){
  if(typeof window==='undefined')return '';
  for(const storage of [window.sessionStorage,window.localStorage]){
    for(let i=0;i<storage.length;i++){
      const name=storage.key(i)||'';
      if(!name.startsWith(DEEPSEEK_KEY_PREFIX))continue;
      const value=String(storage.getItem(name)||'').trim();
      if(/^sk-[A-Za-z0-9_-]{16,}$/.test(value))return value;
    }
  }
  return '';
}

function jsonFromText(value:string):SearchPayload|null{
  let raw=String(value||'').trim();
  if(!raw)return null;
  const fence='```';
  if(raw.startsWith(fence)){
    raw=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  }
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start>=0&&end>start)raw=raw.slice(start,end+1);
  try{return JSON.parse(raw) as SearchPayload}catch{return null}
}

function safeActionFigureUrl(value:unknown){
  try{
    const url=new URL(String(value||''));
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    const path=url.pathname.toLowerCase();
    if(host!=='actionfigure411.com')return '';
    if(!path.endsWith('.php')||path.includes('/common/')||/(price-guide|visual-guide|checklist|aggregator|amazon-prime|stats|set-list)/.test(path))return '';
    return url.href;
  }catch{return ''}
}

function distinctiveTokens(item:Partial<InventoryDraft>){
  const stop=new Set(['hasbro','marvel','legends','series','action','figure','figura','the','infinity','saga','pack','set','and','with','from','final','battle','avengers','endgame']);
  return [...new Set(normalize(`${item.character||''} ${item.title||''}`).split(' ')
    .filter(token=>token.length>=3&&!stop.has(token)&&!/^\d+$/.test(token)))];
}

function validateSearchPayload(item:Partial<InventoryDraft>,payload:SearchPayload):ActionFigure411BrowserValue{
  if(payload?.found===false)throw new Error('ActionFigure411 no encontró una ficha exacta indexada.');
  const url=safeActionFigureUrl(payload?.url);
  if(!url)throw new Error('La búsqueda pública no devolvió una ficha individual válida de ActionFigure411.');
  const title=String(payload?.title||'').replace(/\s+/g,' ').trim();
  if(!title)throw new Error('La ficha de ActionFigure411 no devolvió un título verificable.');

  const wanted=distinctiveTokens(item);
  const hay=normalize(title);
  const hits=wanted.filter(token=>hay.includes(token)).length;
  if(wanted.length>=2&&hits<2)throw new Error('La ficha encontrada en ActionFigure411 no coincide suficientemente con la figura.');

  const requestedBarcode=String(item.barcode||'').replace(/\D/g,'');
  const returnedUpc=String(payload?.upc||'').replace(/\D/g,'');
  if(requestedBarcode&&returnedUpc&&requestedBarcode!==returnedUpc)throw new Error('El UPC de ActionFigure411 no coincide con el artículo.');

  const soldAverage=Number(payload?.soldAverage);
  const soldCount=Math.max(0,Number(payload?.soldCount)||0);
  if(!Number.isFinite(soldAverage)||soldAverage<=0||soldCount<=0)throw new Error('La ficha exacta no publica una media verificable de ventas cerradas.');

  const asNumberOrNull=(value:unknown)=>{
    const n=Number(value);
    return Number.isFinite(n)&&n>=0?n:null;
  };
  const soldHigh=asNumberOrNull(payload?.soldHigh);
  const soldLow=asNumberOrNull(payload?.soldLow);
  const buyItNowAverage=asNumberOrNull(payload?.buyItNowAverage);
  const retail=asNumberOrNull(payload?.retail);
  const year=asNumberOrNull(payload?.year);
  const activeFilteredCount=Math.max(0,Number(payload?.activeFilteredCount)||0);
  const activeTotalCount=Math.max(0,Number(payload?.activeTotalCount)||0);

  return {
    source:'ActionFigure411',amount:soldAverage,currency:'USD',url,searchUrl:url,title,
    genre:String(payload?.genre||item.franchise||'').trim(),group:String(payload?.group||'').trim(),wave:String(payload?.wave||'').trim(),
    year:year==null?null:Math.round(year),retail,upc:returnedUpc,
    soldCount,soldAverage,soldHigh,soldLow,buyItNowAverage,activeFilteredCount,activeTotalCount,
    evidence:`Media de ${soldCount} ventas cerradas: ${soldAverage.toFixed(2)} USD${soldLow!=null&&soldHigh!=null?` · rango ${soldLow.toFixed(2)}-${soldHigh.toFixed(2)} USD`:''}${buyItNowAverage!=null?` · Buy It Now medio ${buyItNowAverage.toFixed(2)} USD`:''}`,
    methodology:'Estimación de mercado de la ficha exacta de ActionFigure411 localizada mediante búsqueda web pública cuando el puente local de Chrome no está disponible. Solo se acepta la media explícita de ventas cerradas del artículo coincidente.'
  };
}

function buildPublicSearchHints(item:Partial<InventoryDraft>,identity:string){
  const sku=String(item.sku||'').trim();
  const barcode=String(item.barcode||'').replace(/\D/g,'');
  const rawName=String(item.character||item.title||'').replace(/\s+/g,' ').trim();
  const shortName=rawName
    .replace(/^Hasbro\s+/i,'')
    .replace(/^Marvel\s+Legends(?:\s+Series)?\s+/i,'')
    .replace(/\bThe\s+Infinity\s+Saga\b/ig,'')
    .replace(/\bF\d{4,}\b/ig,'')
    .replace(/\s+/g,' ').trim();
  const aliases=[
    shortName,
    shortName.replace(/Mark\s+LXXXV/ig,'MK85').replace(/Mark\s+85/ig,'MK85'),
    shortName.replace(/Mark\s+LXXXV/ig,'Mark 85')
  ].filter(Boolean);
  return [
    ...(sku?[`site:actionfigure411.com/marvel "${sku}"`,`site:actionfigure411.com "${sku}"`]:[]),
    ...(barcode?[`site:actionfigure411.com "${barcode}"`]:[]),
    ...aliases.map(name=>`site:actionfigure411.com/marvel "${name}"`),
    `site:actionfigure411.com ${identity}`
  ].filter((value,index,rows)=>value&&rows.indexOf(value)===index).slice(0,5);
}

async function lookupViaPublicWebSearch(item:Partial<InventoryDraft>){
  const key=readPersonalDeepSeekKey();
  if(!key)throw new Error('No hay una clave de DeepSeek disponible para el fallback público de ActionFigure411.');
  const identity=compactIdentity(item);
  if(!identity)throw new Error('Faltan datos suficientes para buscar la figura en ActionFigure411.');

  const hints=buildPublicSearchHints(item,identity);
  let lastError='';
  for(const hint of hints){
    const prompt=`Busca EXCLUSIVAMENTE la ficha INDIVIDUAL exacta en ActionFigure411 para este producto físico: ${identity}.
Haz como PRIMERA búsqueda exactamente: ${hint}
Si no basta, prueba una variante corta por SKU/UPC/nombre, pero siempre con site:actionfigure411.com. Distingue packs, reediciones, BAF y variantes. No uses otra web para el precio.
Si encuentras la ficha exacta, lee SOLO los datos publicados por esa ficha. soldAverage debe ser exactamente el valor de "The average price based upon the last N sold auctions is" o "Sold Auctions Avg"; NO uses Retail ni Buy It Now como soldAverage.
Devuelve ÚNICAMENTE JSON sin markdown con esta forma:
{"found":true,"title":"","url":"https://www.actionfigure411.com/...php","genre":"","group":"","wave":"","year":null,"retail":null,"upc":"","soldCount":0,"soldAverage":null,"soldHigh":null,"soldLow":null,"buyItNowAverage":null,"activeFilteredCount":0,"activeTotalCount":0}
Si no existe coincidencia exacta o no puedes verificar la media de ventas cerradas, devuelve {"found":false}. No inventes ningún dato.`;

    const response=await fetch('https://api.deepseek.com/anthropic/v1/messages',{
      method:'POST',
      headers:{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'},
      body:JSON.stringify({
        model:'deepseek-flash',max_tokens:1200,messages:[{role:'user',content:prompt}],
        tools:[{type:'web_search_20250305',name:'web_search',max_uses:3,user_location:{type:'approximate',country:'ES',timezone:'Europe/Madrid'}}],
        tool_choice:{type:'auto'},stream:false
      }),
      signal:AbortSignal.timeout(30000)
    });
    if(!response.ok){
      if(response.status===402)throw new Error('DeepSeek no tiene saldo disponible para buscar ActionFigure411.');
      if(response.status===429)throw new Error('DeepSeek ha limitado temporalmente las búsquedas de ActionFigure411.');
      lastError=`La búsqueda pública de ActionFigure411 devolvió HTTP ${response.status}.`;
      continue;
    }
    const data=await response.json();
    const texts=(Array.isArray(data?.content)?data.content:[])
      .filter((block:any)=>block?.type==='text'&&block?.text)
      .map((block:any)=>String(block.text));
    for(const text of texts.reverse()){
      const payload=jsonFromText(text);
      if(!payload)continue;
      if(payload.found===false){
        lastError=`Sin coincidencia con ${hint}`;
        continue;
      }
      try{return validateSearchPayload(item,payload)}
      catch(error){lastError=error instanceof Error?error.message:String(error)}
    }
  }
  throw new Error(lastError||'ActionFigure411 no encontró una ficha exacta indexada tras probar SKU, UPC y nombre corto.');
}

async function lookupViaExtension(item:Partial<InventoryDraft>){
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
  return reply.value;
}

export async function lookupActionFigure411InBrowser(item:Partial<InventoryDraft>):Promise<{status:'completed';value:ActionFigure411BrowserValue}>{
  if(typeof window==='undefined')throw new Error('ActionFigure411 necesita ejecutarse desde el navegador.');
  let bridgeError='';
  try{
    const value=await lookupViaExtension(item);
    return {status:'completed',value};
  }catch(error){
    bridgeError=error instanceof Error?error.message:String(error);
  }

  try{
    const value=await lookupViaPublicWebSearch(item);
    return {status:'completed',value};
  }catch(error){
    const fallbackError=error instanceof Error?error.message:String(error);
    throw new Error(`${fallbackError}${bridgeError?` · Puente local: ${bridgeError}`:''}`);
  }
}
