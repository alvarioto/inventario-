const AF411 = 'https://www.actionfigure411.com';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = globalThis.__frikivaultAf411Cache || (globalThis.__frikivaultAf411Cache = new Map());

const CATALOGS = [
  { id: 'marvel-legends', url: AF411 + '/marvel/marvel-legends-everything.php', test: x => /\bmarvel legends\b/.test(x.line) || (/\bmarvel\b/.test(x.franchise) && /\bhasbro\b/.test(x.manufacturer)) },
  { id: 'dc', url: AF411 + '/dc/all-action-figures.php', test: x => /\bdc\b|batman|superman|wonder woman|flash|aquaman|green lantern/.test(x.franchise + ' ' + x.title) },
  { id: 'transformers', url: AF411 + '/transformers/all-action-figures.php', test: x => /transformers/.test(x.franchise + ' ' + x.line) },
  { id: 'gijoe', url: AF411 + '/gijoe/all-action-figures.php', test: x => /g\.?i\.?\s*joe|gi joe/.test(x.franchise + ' ' + x.line) },
  { id: 'motu', url: AF411 + '/masters-of-the-universe/all-action-figures.php', test: x => /masters of the universe|\bmotu\b/.test(x.franchise + ' ' + x.line) },
  { id: 'tmnt', url: AF411 + '/teenage-mutant-ninja-turtles/all-action-figures.php', test: x => /teenage mutant ninja turtles|\btmnt\b/.test(x.franchise + ' ' + x.line) },
  { id: 'power-rangers', url: AF411 + '/power-rangers/all-action-figures.php', test: x => /power rangers/.test(x.franchise + ' ' + x.line) },
  { id: 'thundercats', url: AF411 + '/thundercats/all-action-figures.php', test: x => /thundercats/.test(x.franchise + ' ' + x.line) },
  { id: 'dungeons-dragons', url: AF411 + '/dungeons-dragons/all-action-figures.php', test: x => /dungeons.*dragons|\bd&d\b/.test(x.franchise + ' ' + x.line) },
  { id: 'ghostbusters', url: AF411 + '/ghostbusters/all-action-figures.php', test: x => /ghostbusters/.test(x.franchise + ' ' + x.line) },
  { id: 'indiana-jones', url: AF411 + '/indiana-jones/all-action-figures.php', test: x => /indiana jones/.test(x.franchise + ' ' + x.line) },
  { id: 'mythic-legions', url: AF411 + '/mythic-legions/all-action-figures.php', test: x => /mythic legions/.test(x.franchise + ' ' + x.line) },
  { id: 'action-force', url: AF411 + '/action-force/all-action-figures.php', test: x => /action force/.test(x.franchise + ' ' + x.line) }
];

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}
function decodeHtml(value){
  return String(value||'')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;|&#160;/g,' ');
}
function stripTags(value){
  return decodeHtml(String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function normalize(value){
  return stripTags(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function money(value){
  const m=String(value||'').match(/\$\s*([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
  if(!m)return null;
  const n=Number(m[1].replace(/,/g,''));
  return Number.isFinite(n)&&n>=0&&n<100000?n:null;
}
function absoluteUrl(value){
  try{return new URL(decodeHtml(value),AF411).href}catch{return''}
}
function cleanedItem(item={}){
  return {
    type: normalize(item.type),
    title: normalize(item.title),
    character: normalize(item.character),
    manufacturer: normalize(item.manufacturer),
    line: normalize(item.line),
    franchise: normalize(item.franchise),
    edition: normalize(item.edition),
    wave: normalize(item.wave),
    exclusive: normalize(item.exclusive),
    sku: normalize(item.sku),
    barcode: normalize(item.barcode),
    year: Number(item.year)||null,
    hasBox: item.hasBox
  };
}
function chooseCatalog(item){
  const x=cleanedItem(item);
  if(x.type!=='figure')return null;
  return CATALOGS.find(c=>c.test(x))||null;
}
function parseProductLinks(html){
  const out=[];
  const seen=new Set();
  const re=/<a\b([^>]*?)href=["']([^"']*-\d+\.php(?:#[^"']*)?)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for(const m of String(html||'').matchAll(re)){
    const href=absoluteUrl(m[2]);
    if(!href||!href.startsWith(AF411+'/')||seen.has(href))continue;
    const attrs=(m[1]||'')+' '+(m[3]||'');
    const inner=m[4]||'';
    let title=stripTags(inner);
    if(!title){
      title=decodeHtml(attrs.match(/\b(?:title|alt)=["']([^"']+)["']/i)?.[1]||'').trim();
    }
    if(!title){
      title=decodeHtml(inner.match(/\balt=["']([^"']+)["']/i)?.[1]||'').trim();
    }
    if(!title)continue;
    seen.add(href);
    out.push({title,url:href,group:'',year:null,avg:null});
  }
  return out;
}
function parseMarvelRows(html){
  const rows=[];
  for(const m of String(html||'').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)){
    const block=m[0];
    const title=stripTags(block.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1]||'');
    if(!title)continue;
    const text=stripTags(block);
    const group=text.match(/\bGroup:\s*(.+?)(?=\s+(?:BAF:|Year:|Avg Price:)|$)/i)?.[1]?.trim()||'';
    const baf=text.match(/\bBAF:\s*(.+?)(?=\s+(?:Year:|Avg Price:)|$)/i)?.[1]?.trim()||'';
    const year=Number(text.match(/\bYear:\s*(\d{4})/i)?.[1])||null;
    const avg=money(text.match(/\bAvg Price:\s*(\$[0-9.,]+)/i)?.[1]||'');
    const href=absoluteUrl(block.match(/href=["']([^"']*-\d+\.php(?:#[^"']*)?)["']/i)?.[1]||'');
    rows.push({title,url:href,group,baf,year,avg});
  }
  return rows;
}
const STOP=new Set(['marvel','legends','hasbro','action','figure','figures','collectible','toy','toys','series','the','and','with','of','a','an','edition']);
const GENERIC_GROUP=new Set(['misc','exclusive','deluxe','comics','inspired','wave','baf','price','guide','vintage']);
function tokens(value){return normalize(value).split(' ').filter(x=>x.length>1&&!STOP.has(x));}
function overlap(a,b){
  const aa=[...new Set(tokens(a))], bb=new Set(tokens(b));
  if(!aa.length)return 0;
  return aa.filter(x=>bb.has(x)).length/aa.length;
}
function specificGroupTokens(value){
  return [...new Set(tokens(value).filter(x=>!GENERIC_GROUP.has(x)))];
}
function productLinkScore(row,link){
  const urlText=normalize(link?.url||'');
  const titleTokens=[...new Set(tokens(row?.title||''))];
  if(!titleTokens.length||!urlText)return -1;
  const titleHits=titleTokens.filter(x=>urlText.includes(x)).length;
  const titleRatio=titleHits/titleTokens.length;
  if(titleRatio<0.8)return -1;
  const groupTokens=specificGroupTokens(row?.group||'');
  let groupRatio=0;
  if(groupTokens.length){
    const groupHits=groupTokens.filter(x=>urlText.includes(x)).length;
    groupRatio=groupHits/groupTokens.length;
    if(groupTokens.length>=2&&groupRatio<0.6)return -1;
  }
  return titleRatio*120+groupRatio*220;
}
function findBestProductLink(row,links){
  const ranked=links.map(link=>({link,score:productLinkScore(row,link)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
  if(!ranked.length)return null;
  if(ranked[1]&&Math.abs(ranked[0].score-ranked[1].score)<1&&ranked[0].link.url!==ranked[1].link.url)return null;
  return ranked[0].link;
}
function mergeRows(html,catalog){
  const links=parseProductLinks(html);
  if(catalog?.id!=='marvel-legends')return links;
  const rows=parseMarvelRows(html);
  if(!links.length)return rows.map(row=>({...row,url:''}));
  for(const row of rows){
    const match=findBestProductLink(row,links);
    row.url=match?.url||'';
  }
  return rows;
}
function scoreRow(item,row){
  const it=cleanedItem(item);
  const rowTitle=normalize(row.title);
  const rowMeta=normalize([row.title,row.group,row.baf].filter(Boolean).join(' '));
  const names=[it.title,it.character].filter(Boolean);
  let best=0;
  for(const n of names){
    if(n===rowTitle)best=Math.max(best,260);
    if(n&&rowTitle.includes(n))best=Math.max(best,220);
    best=Math.max(best,overlap(n,rowTitle)*180);
  }
  if(best<70)return -1;
  let score=best;
  const metadata=[it.wave,it.edition,it.exclusive,it.line,it.franchise].filter(Boolean).join(' ');
  score+=overlap(metadata,rowMeta)*110;
  if(it.year&&row.year){
    if(it.year===row.year)score+=90;
    else score-=Math.min(90,Math.abs(it.year-row.year)*25);
  }
  if(it.character&&rowTitle===it.character)score+=40;
  return score;
}
function chooseBest(item,rows){
  const ranked=rows.map(row=>({row,score:scoreRow(item,row)})).filter(x=>x.score>=70).sort((a,b)=>b.score-a.score);
  if(!ranked.length)return null;
  if(ranked[1]&&ranked[0].score-ranked[1].score<18){
    const a=normalize(ranked[0].row.title+' '+(ranked[0].row.group||'')+' '+(ranked[0].row.year||''));
    const b=normalize(ranked[1].row.title+' '+(ranked[1].row.group||'')+' '+(ranked[1].row.year||''));
    if(a!==b)return {ambiguous:true,candidates:ranked.slice(0,5).map(x=>({title:x.row.title,group:x.row.group,year:x.row.year,score:Math.round(x.score)}))};
  }
  return {ambiguous:false,row:ranked[0].row,score:ranked[0].score};
}
function parseProductPage(html,url=''){
  const text=stripTags(html);
  const title=stripTags(String(html||'').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'').replace(/^Marvel Legends\s*/i,'').trim();
  const year=Number(text.match(/\bYear:\s*(\d{4})/i)?.[1])||null;
  const retail=money(text.match(/\bRetail:\s*(\$[0-9.,]+)/i)?.[1]||'');
  const upc=text.match(/\bUPC:\s*([0-9]{8,14})/i)?.[1]||'';
  const asin=text.match(/\bASIN:\s*([A-Z0-9]{8,14})/i)?.[1]||'';
  const sold=text.match(/average price based upon the last\s*(\d+)\s* sold auctions is:\s*\$?\s*([0-9.,]+)/i);
  const soldCount=sold?Number(sold[1]):null;
  const soldAverage=sold?Number(sold[2].replace(/,/g,'')):null;
  const range=text.match(/\[\s*High:\s*\$?\s*([0-9.,]+)\s*\/\s*Low:\s*\$?\s*([0-9.,]+)\s*\]/i);
  const high=range?Number(range[1].replace(/,/g,'')):null;
  const low=range?Number(range[2].replace(/,/g,'')):null;
  const active=text.match(/average Buy It Now price is\s*\$?\s*([0-9.,]+)\s*based upon\s*(\d+)/i);
  const activeAverage=active?Number(active[1].replace(/,/g,'')):null;
  const activeCount=active?Number(active[2]):null;
  const group=text.match(/\bSet:\s*(.+?)(?=\s+Share:|\s+Where to Buy:|$)/i)?.[1]?.trim()||'';
  return {title,url,year,retail,upc,asin,soldCount,soldAverage,high,low,activeAverage,activeCount,group};
}
function productMatchesRow(row,product){
  if(!row||!product)return false;
  const productIdentity=normalize([product.title,product.group,product.url].filter(Boolean).join(' '));
  const titleTokens=[...new Set(tokens(row.title||''))];
  if(!titleTokens.length)return false;
  const titleRatio=titleTokens.filter(x=>productIdentity.includes(x)).length/titleTokens.length;
  if(titleRatio<0.8)return false;
  const groupTokens=specificGroupTokens(row.group||'');
  if(groupTokens.length>=2){
    const groupRatio=groupTokens.filter(x=>productIdentity.includes(x)).length/groupTokens.length;
    if(groupRatio<0.6)return false;
  }
  if(row.year&&product.year&&Number(row.year)!==Number(product.year))return false;
  return true;
}
function configuredOrigins(){
  const values=String(process.env.APP_ORIGIN||'').split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);
  return new Set(['https://frikivault-alvarioto-2026.web.app','https://frikivault-alvarioto-2026.firebaseapp.com',...values]);
}
function applyCors(req,res){
  const origin=String(req.headers.origin||'').replace(/\/$/,'');
  if(!origin)return true;
  if(!configuredOrigins().has(origin))return false;
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age','86400');
  return true;
}
function antiBot(html,status){
  const text=normalize(html);
  return status===403||status===429||/captcha|verify you are human|cloudflare|access denied|too many requests/.test(text);
}
async function fetchPublic(url){
  const response=await fetch(url,{method:'GET',headers:{
    'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':'es-ES,es;q=0.9,en;q=0.7',
    'User-Agent':'Mozilla/5.0 (compatible; FrikiVault/1.0; personal collection lookup)'
  },redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(18000)});
  const html=await response.text();
  if(antiBot(html,response.status)){
    const e=new Error('ActionFigure411 ha limitado temporalmente la consulta pública.');
    e.code='RATE_LIMITED';
    throw e;
  }
  if(!response.ok)throw new Error('ActionFigure411 HTTP '+response.status);
  return {html,url:response.url||url};
}
async function resolveActionFigure411(item){
  const catalog=chooseCatalog(item);
  if(!catalog)throw new Error('ActionFigure411 no tiene un catálogo compatible claramente identificado para esta pieza.');
  const key=normalize([catalog.id,item.title,item.character,item.wave,item.edition,item.year].filter(Boolean).join('|'));
  const cached=cache.get(key);
  if(cached&&Date.now()-cached.at<CACHE_TTL_MS)return {...cached.value,cacheHit:true};

  const catalogPage=await fetchPublic(catalog.url);
  const rows=mergeRows(catalogPage.html,catalog);
  const chosen=chooseBest(item,rows);
  if(!chosen)throw new Error('No se encontró una coincidencia suficientemente precisa en ActionFigure411.');
  if(chosen.ambiguous){
    const names=chosen.candidates.map(x=>[x.title,x.group,x.year].filter(Boolean).join(' · ')).join(' | ');
    throw new Error('Hay varias figuras demasiado parecidas en ActionFigure411: '+names);
  }
  const row=chosen.row;
  let product=null;
  if(row.url){
    try{
      const page=await fetchPublic(row.url);
      const parsed=parseProductPage(page.html,page.url);
      if(productMatchesRow(row,parsed))product=parsed;
    }catch{}
  }
  const amount=(product?.soldAverage&&product.soldAverage>0)?product.soldAverage:(row.avg&&row.avg>0?row.avg:null);
  if(!amount)throw new Error('La figura existe en ActionFigure411, pero todavía no tiene ventas cerradas suficientes para valorar.');
  const url=product?.url||row.url||catalog.url;
  const group=product?.group||row.group||'';
  const evidence=[
    product?.soldCount ? String(product.soldCount)+' ventas cerradas' : 'media publicada por ActionFigure411',
    product?.low!=null&&product?.high!=null ? 'rango $'+product.low.toFixed(2)+'–$'+product.high.toFixed(2) : '',
    group ? 'grupo '+group : '',
    (product?.year||row.year) ? 'año '+String(product?.year||row.year) : ''
  ].filter(Boolean).join(' · ');
  const value={status:'completed',value:{
    source:'ActionFigure411',
    amount,currency:'USD',url,title:product?.title||row.title,group,
    year:product?.year||row.year||null,retail:product?.retail??null,upc:product?.upc||'',
    asin:product?.asin||'',soldCount:product?.soldCount??null,low:product?.low??null,
    high:product?.high??null,activeAverage:product?.activeAverage??null,
    activeCount:product?.activeCount??null,evidence,
    methodology:'ActionFigure411 calcula la media con ventas cerradas filtradas. Para figuras modernas su guía prioriza artículos completos en caja y excluye lotes/sueltos cuando puede.'
  }};
  cache.set(key,{at:Date.now(),value});
  if(cache.size>250){
    const oldest=[...cache.entries()].sort((a,b)=>a[1].at-b[1].at).slice(0,60);
    for(const [k] of oldest)cache.delete(k);
  }
  return value;
}

export { CATALOGS, chooseCatalog, parseProductLinks, parseMarvelRows, productLinkScore, findBestProductLink, mergeRows, scoreRow, chooseBest, parseProductPage, productMatchesRow, resolveActionFigure411 };

export default async function handler(req,res){
  if(!applyCors(req,res))return json(res,403,{error:'Origen no autorizado.'});
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
    const item=body.item||{};
    if(!item.title&&!item.character)return json(res,400,{error:'Faltan datos de la figura.'});
    const result=await resolveActionFigure411(item);
    return json(res,200,result);
  }catch(error){
    const message=String(error?.message||'No se pudo consultar ActionFigure411.');
    return json(res,error?.code==='RATE_LIMITED'?429:502,{error:message});
  }
}
