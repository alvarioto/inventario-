const Z='https://api.zenrows.com/v1/';
const AF='https://www.actionfigure411.com';

async function zfetch(url, js=false){
  const key=String(process.env.ZENROWS_API_KEY||'').trim();
  if(!key) return {ok:false,error:'missing_key'};
  const qs=new URLSearchParams({apikey:key,url,premium_proxy:'true'});
  if(js) qs.set('js_render','true');
  const t0=Date.now();
  const r=await fetch(`${Z}?${qs}`,{signal:AbortSignal.timeout(js?30000:15000)});
  const text=await r.text();
  return {ok:r.ok,status:r.status,ms:Date.now()-t0,text};
}

export default async function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;return res.end('GET only')}
  try{
    const s=await zfetch(`${AF}/common/search.php?term=Iron%20Man%20MK85&genre=2`,false);
    let parsed=null;
    try{parsed=JSON.parse(s.text)}catch{}
    const hit=Array.isArray(parsed)?parsed.find(x=>Number(x?.id)===2428)||parsed[0]:null;
    if(!s.ok||!hit){
      res.statusCode=200;res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({stage:'search',ok:false,http:s.status,ms:s.ms,body:String(s.text||'').slice(0,300)}));
    }
    const detailUrl=new URL(hit.url,AF).href;
    const d=await zfetch(detailUrl,true);
    const text=String(d.text||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    const avg=text.match(/average\s+price\s+based\s+(?:upon|on)\s+the\s+last\s+(\d+)\s+sold\s+auctions?\s+is\s*:\s*\$\s*([0-9.,]+)/i);
    res.statusCode=200;res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({stage:'detail',ok:!!(d.ok&&avg),searchMs:s.ms,detailMs:d.ms,searchId:hit?.id||null,title:String(hit?.name||'').replace(/<[^>]+>/g,' '),detailHttp:d.status,soldCount:avg?Number(avg[1]):null,soldAverage:avg?Number(avg[2].replace(',','')):null,detailSample:avg?null:text.slice(0,300)}));
  }catch(e){
    res.statusCode=200;res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ok:false,error:e instanceof Error?e.message:String(e)}));
  }
}
