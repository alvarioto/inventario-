const H='https://www.hobbydb.com';
function out(res,status,body){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(body));}
function uniq(xs){return [...new Set(xs)];}
function targeted(text){const s=String(text||'');const keys=['catalogItemSearchResults','catalog-item-search-results','CatalogItemPudbSerializer','include_cit','include_last_page','freeformListings','keywords','subvariants','catalogItems'];const rows=[];for(const key of keys){let from=0;for(let n=0;n<12;n++){const i=s.indexOf(key,from);if(i<0)break;rows.push({key,snippet:s.slice(Math.max(0,i-650),Math.min(s.length,i+1350)).replace(/\s+/g,' ')});from=i+key.length;}}return rows.slice(0,80);}
async function get(url,cookie){const r=await fetch(url,{headers:{Cookie:cookie,'User-Agent':'Mozilla/5.0 FrikiVault/1.0',Accept:'text/html,application/javascript,application/json,*/*',Referer:H+'/marketplaces/hobbydb'},redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(15000)});return {r,text:await r.text()};}
export default async function handler(req,res){
 try{
  const cookie=String(process.env.HOBBYDB_COOKIE||'').trim();if(!cookie)return out(res,503,{error:'no cookie'});
  const q='Cruella de Vil 1663 Chase';const page=await get(H+'/marketplaces/hobbydb/catalog_items?q='+encodeURIComponent(q),cookie);
  const scripts=uniq([...page.text.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(m=>new URL(m[1],H).href));
  const target=scripts.find(x=>/\/assets\/marketplace\/application-[a-f0-9]+\.js/i.test(x));
  if(!target)return out(res,200,{error:'marketplace application asset not found',scripts});
  const asset=await get(target,cookie);
  const routeStrings=uniq([...asset.text.matchAll(/["'](\/[^"']*(?:catalog_items|price_guide|search)[^"']*)["']/gi)].map(m=>m[1])).slice(0,100);
  return out(res,200,{target,status:asset.r.status,length:asset.text.length,routeStrings,hits:targeted(asset.text)});
 }catch(e){return out(res,500,{error:String(e?.message||e)});}
}
