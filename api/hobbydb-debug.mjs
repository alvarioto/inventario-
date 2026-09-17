const H='https://www.hobbydb.com';
function out(res,status,body){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(body));}
function uniq(xs){return [...new Set(xs)];}
function snippets(text){const s=String(text||'');const keys=['catalog_items','algolia','elastic','search','filters[q]','price_guide'];const rows=[];for(const key of keys){let from=0;for(let n=0;n<8;n++){const i=s.toLowerCase().indexOf(key.toLowerCase(),from);if(i<0)break;rows.push(s.slice(Math.max(0,i-180),Math.min(s.length,i+320)).replace(/\s+/g,' '));from=i+key.length;}}return uniq(rows).slice(0,30);}
async function get(url,cookie){const r=await fetch(url,{headers:{Cookie:cookie,'User-Agent':'Mozilla/5.0 FrikiVault/1.0',Accept:'text/html,application/javascript,application/json,*/*',Referer:H+'/marketplaces/hobbydb'},redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(15000)});return {r,text:await r.text()};}
export default async function handler(req,res){
 try{
  const cookie=String(process.env.HOBBYDB_COOKIE||'').trim();if(!cookie)return out(res,503,{error:'no cookie'});
  const q='Cruella de Vil 1663 Chase';const {r,text}=await get(H+'/marketplaces/hobbydb/catalog_items?q='+encodeURIComponent(q),cookie);
  const scripts=uniq([...text.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(m=>new URL(m[1],H).href));
  const forms=[...text.matchAll(/<form\b[^>]*action=["']([^"']+)["'][^>]*>/gi)].map(m=>new URL(m[1],H).href).slice(0,20);
  const dataUrls=uniq([...text.matchAll(/(?:url|endpoint|action|source|remote|href)[-_:a-z0-9]*=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/catalog|search|api|filter/i.test(x))).slice(0,40);
  const assets=[];
  for(const url of scripts.filter(x=>new URL(x).hostname.endsWith('hobbydb.com')).slice(-12)){
   try{const got=await get(url,cookie);const hits=snippets(got.text);if(hits.length)assets.push({url,status:got.r.status,length:got.text.length,hits});}catch(e){assets.push({url,error:String(e?.message||e)});}
  }
  return out(res,200,{page:{status:r.status,finalUrl:r.url,length:text.length,scripts,forms,dataUrls,inlineHits:snippets(text)},assets});
 }catch(e){return out(res,500,{error:String(e?.message||e)});}
}
