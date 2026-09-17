const H='https://www.hobbydb.com';
function out(res,status,body){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(body));}
async function get(url,cookie){const r=await fetch(url,{headers:{Cookie:cookie,'User-Agent':'Mozilla/5.0 FrikiVault/1.0',Accept:'application/json,text/plain,*/*',Referer:H+'/marketplaces/hobbydb/catalog_items?q=Cruella%20de%20Vil%201663%20Chase'},redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(15000)});return {r,text:await r.text()};}
export default async function handler(req,res){
 try{
  const cookie=String(process.env.HOBBYDB_COOKIE||'').trim();if(!cookie)return out(res,503,{error:'no cookie'});
  const p=new URLSearchParams();
  p.set('include_cit','true');p.set('include_last_page','true');p.set('include_main_images','true');p.set('per','6');p.set('from_index','true');p.set('serializer','CatalogItemPudbSerializer');
  p.set('market_id','hobbydb');p.set('order[name]','created_at');p.set('order[sort]','desc');p.set('page','1');p.set('q','Cruella de Vil 1663 Chase');p.set('subvariants','true');p.set('grouped','false');
  const url=H+'/api/catalog_items?'+p.toString();const got=await get(url,cookie);let parsed=null;try{parsed=JSON.parse(got.text)}catch{}
  const rows=Array.isArray(parsed?.data)?parsed.data.slice(0,6).map(x=>({id:x.id,type:x.type,attributes:x.attributes})):null;
  return out(res,200,{requestUrl:url,status:got.r.status,contentType:got.r.headers.get('content-type')||'',length:got.text.length,meta:parsed?.meta||null,rows,prefix:parsed?null:got.text.slice(0,1200)});
 }catch(e){return out(res,500,{error:String(e?.message||e)});}
}
