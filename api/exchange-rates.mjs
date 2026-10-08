const cache=globalThis.__frikivaultFxCache||(globalThis.__frikivaultFxCache={rates:null,expiresAt:0,updatedAt:''});
const CODES=['EUR','GBP','JPY','CAD','AUD','CHF','CNY','MXN','KRW'];

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400');
  res.end(JSON.stringify(body));
}
function configuredOrigins(){
  const values=String(process.env.APP_ORIGIN||'').split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);
  return new Set(['https://frikivault-alvarioto-2026.web.app','https://frikivault-alvarioto-2026.firebaseapp.com',...values]);
}
function applyCors(req,res){
  const origin=String(req.headers?.origin||'').replace(/\/$/,'');
  if(!origin)return true;
  if(!configuredOrigins().has(origin))return false;
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age','86400');
  return true;
}
function normalizeRates(data){
  const source=data?.rates||{};
  const rates={USD:1};
  for(const code of CODES){
    const value=Number(source?.[code]);
    if(Number.isFinite(value)&&value>0)rates[code]=value;
  }
  return Object.keys(rates).length>1?rates:null;
}
async function fetchFrankfurter(){
  const url='https://api.frankfurter.app/latest?from=USD&to='+CODES.join(',');
  const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'FrikiVault/1.0'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Frankfurter HTTP '+response.status);
  const rates=normalizeRates(await response.json());
  if(!rates)throw new Error('Frankfurter sin tipos válidos');
  return rates;
}
async function fetchOpenErApi(){
  const response=await fetch('https://open.er-api.com/v6/latest/USD',{headers:{Accept:'application/json','User-Agent':'FrikiVault/1.0'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Open ER API HTTP '+response.status);
  const data=await response.json();
  const rates=normalizeRates({rates:data?.rates});
  if(!rates)throw new Error('Open ER API sin tipos válidos');
  return rates;
}

export default async function handler(req,res){
  if(!applyCors(req,res))return json(res,403,{ok:false,error:'Origen no autorizado.'});
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  if(req.method!=='GET')return json(res,405,{ok:false,error:'GET only'});
  const now=Date.now();
  if(cache.rates&&cache.expiresAt>now)return json(res,200,{ok:true,rates:cache.rates,updatedAt:cache.updatedAt,source:'cache'});
  let lastError='';
  for(const source of [fetchFrankfurter,fetchOpenErApi]){
    try{
      const rates=await source();
      cache.rates=rates;
      cache.expiresAt=now+6*60*60*1000;
      cache.updatedAt=new Date().toISOString();
      return json(res,200,{ok:true,rates,updatedAt:cache.updatedAt,source:source===fetchFrankfurter?'Frankfurter':'Open ER API'});
    }catch(error){
      lastError=error instanceof Error?error.message:String(error);
    }
  }
  if(cache.rates)return json(res,200,{ok:true,rates:cache.rates,updatedAt:cache.updatedAt,source:'stale-cache',warning:lastError});
  return json(res,502,{ok:false,error:'No se pudieron obtener tipos de cambio.',detail:lastError});
}
