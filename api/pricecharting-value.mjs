const PRICECHARTING='https://www.pricecharting.com';
const CACHE_TTL_MS=6*60*60*1000;
const cache=globalThis.__frikivaultPriceChartingCache||(globalThis.__frikivaultPriceChartingCache=new Map());

function json(res,status,body){
 res.statusCode=status;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 res.end(JSON.stringify(body));
}
function normalize(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&amp;/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
function decodeHtml(value){
 return String(value||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;|&#160;/g,' ');
}
function stripTags(value){
 return decodeHtml(String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function parseUsd(value){
 const m=String(value||'').match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
 if(!m)return null;
 const n=Number(m[1].replace(/,/g,''));
 return Number.isFinite(n)&&n>0&&n<100000?n:null;
}
function numberToken(value){return String(value||'').match(/\d{1,5}/)?.[0]||'';}
function words(value){return normalize(value).split(' ').filter(x=>x.length>=2);}
function requestedVariant(item){
 const raw=normalize(item?.funkoVariant||'');
 if(!raw||['classic','standard','regular','normal','base'].includes(raw))return'';
 if(raw.includes('upside down'))return'upside down';
 if(raw.includes('chase'))return'chase';
 if(raw.includes('flocked'))return'flocked';
 if(raw.includes('glow')||raw.includes('gitd'))return'glow';
 if(raw.includes('metallic'))return'metallic';
 if(raw.includes('diamond'))return'diamond';
 if(raw.includes('black light'))return'black light';
 if(raw.includes('chrome'))return'chrome';
 if(raw.includes('clear')||raw.includes('translucent'))return'clear';
 if(raw.includes('scented'))return'scented';
 if(raw.includes('patina'))return'patina';
 if(raw.includes('wood'))return'wood';
 if(raw==='diy'||raw.includes('do it yourself'))return'diy';
 if(raw.includes('art series'))return'art series';
 return raw;
}
function rowVariant(value){
 const raw=normalize(value);
 if(/\bupside down\b/.test(raw))return'upside down';
 if(/\bchase\b/.test(raw))return'chase';
 if(/\bflocked\b/.test(raw))return'flocked';
 if(/\bglow in the dark\b|\bgitd\b/.test(raw))return'glow';
 if(/\bmetallic\b/.test(raw))return'metallic';
 if(/\bdiamond\b/.test(raw))return'diamond';
 if(/\bblack light\b/.test(raw))return'black light';
 if(/\bchrome\b/.test(raw))return'chrome';
 if(/\bclear\b|\btranslucent\b/.test(raw))return'clear';
 if(/\bscented\b/.test(raw))return'scented';
 if(/\bpatina\b/.test(raw))return'patina';
 if(/\bwood deco\b|\bwooden\b/.test(raw))return'wood';
 if(/\bdiy\b|\bdo it yourself\b/.test(raw))return'diy';
 if(/\bart series\b/.test(raw))return'art series';
 return'';
}
function buildSearchQuery(item){
 const isFunko=item?.type==='funko'||normalize(item?.manufacturer)==='funko';
 const parts=[];
 if(item?.barcode)parts.push(String(item.barcode).trim());
 if(isFunko){
  const name=String(item.character||item.title||'').trim();
  if(name)parts.push(name);
  if(item.popNumber)parts.push(String(item.popNumber).trim());
  if(requestedVariant(item))parts.push(String(item.funkoVariant).trim());
  parts.push('Funko');
 }else{
  for(const value of [item?.title,item?.manufacturer,item?.line,item?.sku].filter(Boolean))parts.push(String(value).trim());
 }
 return [...new Set(parts)].join(' ').replace(/\s+/g,' ').trim().slice(0,220);
}
function classCell(row,className){
 const escaped=className.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const re=new RegExp('<(?:td|cell)\\b[^>]*class=["\\'][^"\\']*\\b'+escaped+'\\b[^"\\']*["\\'][^>]*>([\\s\\S]*?)<\\/(?:td|cell)>','i');
 return row.match(re)?.[1]||'';
}
function parseSearchRows(html){
 const rows=[];
 const re=/<(?:tr|row)\b[^>]*(?:data-product\s*=|id=["']product-)[^>]*>([\s\S]*?)<\/(?:tr|row)>/gi;
 for(const match of String(html||'').matchAll(re)){
  const raw=match[0];
  const titleHtml=classCell(raw,'title');
  const title=stripTags(titleHtml);
  if(!title)continue;
  const consoleName=stripTags(classCell(raw,'console'));
  const used=parseUsd(stripTags(classCell(raw,'used_price')));
  const cib=parseUsd(stripTags(classCell(raw,'cib_price')));
  const fresh=parseUsd(stripTags(classCell(raw,'new_price')));
  const hrefMatch=titleHtml.match(/href=["']([^"']*\/game\/[^"']+)["']/i)||raw.match(/href=["']([^"']*\/game\/[^"']+)["']/i);
  let url='';
  if(hrefMatch){try{url=new URL(decodeHtml(hrefMatch[1]),PRICECHARTING).href}catch{}}
  rows.push({title,console:consoleName,url,prices:{outOfBox:used,inBox:cib,new:fresh}});
 }
 return rows;
}
function productTitleFromHtml(html){
 const raw=String(html||'');
 const h1=raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
 const title=h1?stripTags(h1):stripTags(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
 return title.replace(/\s+Prices\s*[|].*$/i,'').trim();
}
function priceNearId(html,key){
 const raw=String(html||'');
 const patterns=[
  new RegExp('<[^>]+id=["\\']'+key+'["\\'][^>]*>([\\s\\S]{0,180}?)<\\/[^>]+>','i'),
  new RegExp('<[^>]+class=["\\'][^"\\']*\\b'+key+'\\b[^"\\']*["\\'][^>]*>([\\s\\S]{0,180}?)<\\/[^>]+>','i')
 ];
 for(const re of patterns){
  const hit=raw.match(re),n=parseUsd(stripTags(hit?.[1]||''));
  if(n!=null)return n;
 }
 return null;
}
function parseProductPage(html,url=''){
 const text=stripTags(html);
 const labelled=(label)=>{
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const hit=text.match(new RegExp(escaped+'[^$]{0,90}\\$\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)','i'));
  return hit?Number(hit[1].replace(/,/g,'')):null;
 };
 const prices={
  outOfBox:priceNearId(html,'used_price')??labelled('Out of Box'),
  inBox:priceNearId(html,'cib_price')??labelled('In Box'),
  new:priceNearId(html,'new_price')??labelled('New')
 };
 return {title:productTitleFromHtml(html),console:'',url,prices};
}
function exactScore(item,row){
 const isFunko=item?.type==='funko'||normalize(item?.manufacturer)==='funko';
 const hay=normalize(row.title+' '+row.console);
 const strongIds=[item?.barcode,item?.sku].filter(Boolean).map(normalize).filter(x=>x.length>=5);
 if(strongIds.some(id=>hay.includes(id)))return 1000;
 const name=String(item?.character||item?.title||'').trim();
 const stop=new Set(['funko','pop','figure','figura','vinyl','movies','movie','television','animation','games','game','disney','marvel','heroes','the','and','with']);
 const nameTokens=words(name).filter(x=>x.length>=2&&!stop.has(x)&&!/^\\d+$/.test(x));
 const hits=nameTokens.filter(x=>hay.includes(x)).length;
 const ratio=nameTokens.length?hits/nameTokens.length:0;
 if(nameTokens.length&&hits<Math.max(1,Math.ceil(nameTokens.length*.55)))return -1;
 let score=hits*25+ratio*100;
 if(isFunko){
  if(!/funko\\s+pop/i.test(row.console+' '+row.title))score-=40;
  const wantedNumber=numberToken(item?.popNumber);
  if(wantedNumber){
   const explicit=[...String(row.title).matchAll(/#\\s*(\\d{1,5})\\b/g)].map(x=>x[1]);
   if(explicit.length&&!explicit.includes(wantedNumber))return -1;
   if(!explicit.includes(wantedNumber)&&!new RegExp('(?:^|\\\\D)'+wantedNumber+'(?:\\\\D|$)').test(row.title))return -1;
   score+=180;
  }
  const wantedVariant=requestedVariant(item),actualVariant=rowVariant(row.title);
  if(wantedVariant&&actualVariant!==wantedVariant)return -1;
  if(!wantedVariant&&actualVariant)return -1;
  if(wantedVariant===actualVariant&&wantedVariant)score+=140;
 }else{
  const titleTokens=words(item?.title||'').filter(x=>x.length>=3&&!stop.has(x)&&!/^\\d+$/.test(x));
  const titleHits=titleTokens.filter(x=>hay.includes(x)).length;
  if(titleTokens.length>2&&titleHits/titleTokens.length<.5)return -1;
  score+=titleHits*20;
 }
 return score;
}
function chooseBest(item,rows){
 const ranked=rows.map(row=>({row,score:exactScore(item,row)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
 if(!ranked.length||ranked[0].score<60)return null;
 return ranked[0].row;
}
function choosePrice(item,prices){
 const options=[];
 if(item?.sealed===true)options.push(['New',prices.new]);
 if(item?.hasBox===false)options.push(['Out of Box',prices.outOfBox]);
 if(item?.hasBox===true)options.push(['In Box',prices.inBox]);
 if(item?.type==='funko'&&item?.hasBox==null)options.push(['In Box',prices.inBox]);
 options.push(['In Box',prices.inBox],['New',prices.new],['Out of Box',prices.outOfBox]);
 for(const [condition,amount] of options)if(Number.isFinite(amount)&&amount>0)return{condition,amount};
 return null;
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
  'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1'
 },redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(15000)});
 const html=await response.text();
 if(antiBot(html,response.status)){
  const e=new Error('PriceCharting ha limitado temporalmente la consulta pública. No se reintenta automáticamente.');
  e.code='RATE_LIMITED';
  throw e;
 }
 if(!response.ok)throw new Error('PriceCharting HTTP '+response.status);
 return {html,url:response.url||url};
}
async function resolvePriceCharting(item){
 const query=buildSearchQuery(item);
 if(!query)throw new Error('Faltan datos para buscar el artículo en PriceCharting.');
 const cacheKey=normalize(query)+'|'+String(item?.hasBox)+'|'+String(item?.sealed);
 const cached=cache.get(cacheKey);
 if(cached&&Date.now()-cached.at<CACHE_TTL_MS)return {...cached.value,cacheHit:true};
 const searchUrl=PRICECHARTING+'/search-products?type=prices&q='+encodeURIComponent(query);
 const page=await fetchPublic(searchUrl);
 let row;
 if(/\/game\//i.test(new URL(page.url).pathname))row=parseProductPage(page.html,page.url);
 else row=chooseBest(item,parseSearchRows(page.html));
 if(!row)throw new Error('No se encontró una ficha de PriceCharting que coincida exactamente con nombre, número y variante.');
 const chosen=choosePrice(item,row.prices||{});
 if(!chosen)throw new Error('La ficha exacta existe, pero PriceCharting no muestra un precio utilizable.');
 const variant=requestedVariant(item)||rowVariant(row.title)||'Standard';
 const value={status:'completed',value:{
  amount:chosen.amount,currency:'USD',url:row.url||page.url||searchUrl,
  evidence:'PriceCharting: Out of Box '+(row.prices.outOfBox==null?'—':'$'+row.prices.outOfBox.toFixed(2))+' · In Box '+(row.prices.inBox==null?'—':'$'+row.prices.inBox.toFixed(2))+' · New '+(row.prices.new==null?'—':'$'+row.prices.new.toFixed(2)),
  variant,title:row.title,condition:chosen.condition,prices:row.prices
 }};
 cache.set(cacheKey,{at:Date.now(),value});
 if(cache.size>200){
  const oldest=[...cache.entries()].sort((a,b)=>a[1].at-b[1].at).slice(0,50);
  for(const [key] of oldest)cache.delete(key);
 }
 return value;
}
export {buildSearchQuery,parseSearchRows,parseProductPage,chooseBest,choosePrice,resolvePriceCharting};

export default async function handler(req,res){
 if(!applyCors(req,res))return json(res,403,{error:'Origen no autorizado.'});
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
  const item=body.item||{};
  if(!item.title&&!item.character&&!item.barcode&&!item.sku)return json(res,400,{error:'Faltan datos del artículo para buscar en PriceCharting.'});
  const result=await resolvePriceCharting(item);
  return json(res,200,result);
 }catch(error){
  const message=String(error?.message||'No se pudo consultar PriceCharting.');
  return json(res,error?.code==='RATE_LIMITED'?429:502,{error:message});
 }
}
