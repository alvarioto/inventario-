const ACTIONFIGURE411='https://www.actionfigure411.com';
const CACHE_TTL_MS=3*60*60*1000;
const cache=globalThis.__frikivaultActionFigure411Cache||(globalThis.__frikivaultActionFigure411Cache=new Map());

const GENRES=[
 {name:'Star Wars',g:1,slug:'star-wars',aliases:['star wars','black series','vintage collection','mandalorian','darth vader','jedi']},
 {name:'Marvel',g:2,slug:'marvel',aliases:['marvel legends','marvel','x men','x-men','spider man','spider-man','avengers','iron man','wolverine']},
 {name:'Transformers',g:3,slug:'transformers',aliases:['transformers','optimus prime','megatron','autobot','decepticon']},
 {name:'G.I. Joe',g:4,slug:'gijoe',aliases:['g i joe','gi joe','g.i. joe','classified series','cobra commander']},
 {name:'Masters of the Universe',g:5,slug:'masters-of-the-universe',aliases:['masters of the universe','motu','masterverse','he man','he-man','skeletor']},
 {name:'Teenage Mutant Ninja Turtles',g:6,slug:'teenage-mutant-ninja-turtles',aliases:['teenage mutant ninja turtles','tmnt','ninja turtles','turtles of grayskull']},
 {name:'Power Rangers',g:7,slug:'power-rangers',aliases:['power rangers','lightning collection']},
 {name:'DC',g:8,slug:'dc',aliases:['dc multiverse','dc comics','mcfarlane dc','batman','superman','wonder woman','joker']},
 {name:'Thundercats',g:9,slug:'thundercats',aliases:['thundercats','thunder cats','lion o','lion-o']},
 {name:'Indiana Jones',g:10,slug:'indiana-jones',aliases:['indiana jones','adventure series']},
 {name:'Dungeons & Dragons',g:11,slug:'dungeons-dragons',aliases:['dungeons dragons','dungeons & dragons','d&d','golden archive']},
 {name:'Mythic Legions',g:12,slug:'mythic-legions',aliases:['mythic legions','four horsemen']},
 {name:'Action Force',g:13,slug:'action-force',aliases:['action force','valaverse']},
 {name:'Ghostbusters',g:14,slug:'ghostbusters',aliases:['ghostbusters','ghost busters','plasma series']}
];

function json(res,status,body){
 res.statusCode=status;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 res.end(JSON.stringify(body));
}
function decodeHtml(value){
 return String(value||'')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function stripTags(value){
 return decodeHtml(String(value||'')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function normalize(value){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
function words(value){
 return normalize(value).split(' ').filter(x=>x.length>=2);
}
function parseNumber(raw){
 let value=String(raw||'').replace(/\s|\u00a0/g,'');
 if(!value)return null;
 const lastComma=value.lastIndexOf(','),lastDot=value.lastIndexOf('.');
 if(lastComma>=0&&lastDot>=0){
  if(lastComma>lastDot)value=value.replace(/\./g,'').replace(',','.');
  else value=value.replace(/,/g,'');
 }else if(lastComma>=0){
  const decimals=value.length-lastComma-1;
  value=decimals>=1&&decimals<=2?value.replace(',','.'):value.replace(/,/g,'');
 }
 const n=Number(value);
 return Number.isFinite(n)&&n>=0&&n<1000000?n:null;
}
function parseMoney(value){
 const m=String(value||'').match(/([$€£])\s*([0-9][0-9.,]*)/);
 if(!m)return null;
 const amount=parseNumber(m[2]);
 if(amount==null)return null;
 return {amount,currency:m[1]==='$'?'USD':m[1]==='€'?'EUR':'GBP'};
}
function inferGenres(item={}){
 const fields=[item.franchise,item.line,item.manufacturer,item.title,item.character,item.edition].filter(Boolean).join(' ');
 const hay=normalize(fields);
 const ranked=[];
 for(const genre of GENRES){
  let score=0;
  for(const alias of genre.aliases){
   const token=normalize(alias);
   if(token&&hay.includes(token))score=Math.max(score,token.length+20);
  }
  if(score)ranked.push({genre,score});
 }
 return ranked.sort((a,b)=>b.score-a.score).map(x=>x.genre);
}
const GENERIC_WORDS=new Set(['action','figure','figura','figures','toy','toys','collectible','collectibles','hasbro','mcfarlane','neca','bandai','super7','marvel','legends','series','the','and','with','of','a','an']);
function cleanSearchName(value){
 return words(value).filter(x=>!GENERIC_WORDS.has(x)).join(' ').trim();
}
function buildSearchTerms(item={}){
 const values=[];
 const barcode=String(item.barcode||'').replace(/\D/g,'');
 if(barcode.length>=8)values.push(barcode);
 const character=cleanSearchName(item.character||'');
 const title=cleanSearchName(item.title||'');
 if(character)values.push(character);
 if(title)values.push(title);
 const sku=String(item.sku||'').trim();
 if(sku.length>=4)values.push(sku);
 return [...new Set(values.map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean))].slice(0,4);
}
function absoluteUrl(href){
 try{return new URL(decodeHtml(href),ACTIONFIGURE411).href}catch{return''}
}
function enclosingRow(html,index){
 const before=html.lastIndexOf('<tr',index);
 const after=html.indexOf('</tr>',index);
 if(before>=0&&after>index&&after-before<12000)return html.slice(before,after+5);
 const cardBefore=Math.max(0,index-900),cardAfter=Math.min(html.length,index+2400);
 return html.slice(cardBefore,cardAfter);
}
function parseLabel(text,label,nextLabels){
 const next=nextLabels.map(x=>x.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&')).join('|');
 const re=new RegExp(label.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&')+'\\s*:\\s*(.*?)(?=\\s+(?:'+next+')\\s*:|$)','i');
 return String(text||'').match(re)?.[1]?.trim()||'';
}
function parseSearchResults(html,genre){
 const out=new Map();
 const raw=String(html||'');
 const re=/<a\b[^>]*href=["']([^"']+\.php(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
 for(const match of raw.matchAll(re)){
  const href=match[1],url=absoluteUrl(href);
  if(!url)continue;
  let pathname='';
  try{pathname=new URL(url).pathname.toLowerCase()}catch{continue}
  if(!pathname.startsWith('/'+genre.slug+'/'))continue;
  if(/(?:price-guide|visual-guide|checklist|aggregator|amazon-prime|stats|index|set-list|build-a-figure-list)\.php$/i.test(pathname))continue;
  let title=stripTags(match[2]);
  if(!title){
   const alt=match[2].match(/\balt=["']([^"']+)["']/i)?.[1]||'';
   title=decodeHtml(alt).trim();
  }
  if(!title||title.length>220)continue;
  const rowHtml=enclosingRow(raw,match.index||0);
  const rowText=stripTags(rowHtml);
  const group=parseLabel(rowText,'Group',['Wave','Year','Retail']);
  const wave=parseLabel(rowText,'Wave',['Year','Retail']);
  const yearRaw=rowText.match(/\bYear\s*:\s*(\d{4})\b/i)?.[1];
  const retailRaw=rowText.match(/\bRetail\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i)?.[1];
  const candidate={title,url,group,wave,year:yearRaw?Number(yearRaw):null,retail:parseMoney(retailRaw||'')?.amount??null,genre:genre.name};
  const existing=out.get(url);
  if(!existing||candidate.title.length>existing.title.length)out.set(url,candidate);
 }
 return [...out.values()];
}
function overlapScore(a,b){
 const stop=new Set(['marvel','legends','action','figure','figura','series','the','and','with','of','a','an']);
 const aa=[...new Set(words(a).filter(x=>!stop.has(x)))];
 const bb=new Set(words(b).filter(x=>!stop.has(x)));
 if(!aa.length)return 0;
 return aa.filter(x=>bb.has(x)).length/aa.length;
}
function scoreCandidate(item,row){
 const targets=[item.character,item.title].filter(Boolean).map(cleanSearchName).filter(Boolean);
 if(!targets.length)return -1;
 let nameScore=0;
 const rowName=normalize(row.title);
 for(const target of targets){
  const n=normalize(target);
  if(!n)continue;
  if(n===rowName)nameScore=Math.max(nameScore,340);
  else if(rowName.includes(n)||n.includes(rowName))nameScore=Math.max(nameScore,230);
  nameScore=Math.max(nameScore,overlapScore(n,row.title)*190);
 }
 if(nameScore<75)return -1;
 let score=nameScore;
 const year=Number(item.year)||null;
 if(year&&row.year){
  if(year===row.year)score+=130;
  else score-=Math.min(180,Math.abs(year-row.year)*45);
 }
 if(item.wave&&row.wave){
  const ratio=overlapScore(item.wave,row.wave);
  if(normalize(item.wave)===normalize(row.wave))score+=100;
  else score+=ratio*65;
 }
 const meta=[item.edition,item.exclusive,item.line].filter(Boolean).join(' ');
 if(meta)score+=overlapScore(meta,[row.group,row.wave,row.title].join(' '))*70;
 return score;
}
function chooseBest(item,rows){
 const ranked=rows.map(row=>({row,score:scoreCandidate(item,row)})).filter(x=>x.score>=75).sort((a,b)=>b.score-a.score);
 if(!ranked.length)return null;
 if(ranked[1]&&ranked[0].score-ranked[1].score<18){
  const a=normalize([ranked[0].row.title,ranked[0].row.group,ranked[0].row.wave,ranked[0].row.year].join(' '));
  const b=normalize([ranked[1].row.title,ranked[1].row.group,ranked[1].row.wave,ranked[1].row.year].join(' '));
  if(a!==b)return {ambiguous:true,candidates:ranked.slice(0,5)};
 }
 return {ambiguous:false,...ranked[0]};
}
function parseDetailPage(html,url=''){
 const raw=String(html||''),text=stripTags(raw);
 const title=stripTags(raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/\s*[|].*$/,'').trim();
 const sold=text.match(/average\s+price\s+based\s+(?:upon|on)\s+the\s+last\s+(\d+)\s+sold\s+auctions?\s+is\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i);
 const range=text.match(/High\s*:\s*([$€£]\s*[0-9][0-9.,]*)\s*[/|\-]?\s*Low\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i);
 const bin=text.match(/average\s+Buy\s+It\s+Now\s+price\s+is\s+([$€£]\s*[0-9][0-9.,]*)\s+based\s+(?:upon|on)\s+(\d+)\s+filtered\s+active\s+auctions?\s+out\s+of\s+(\d+)/i);
 const soldMoney=parseMoney(sold?.[2]||'');
 const highMoney=parseMoney(range?.[1]||'');
 const lowMoney=parseMoney(range?.[2]||'');
 const binMoney=parseMoney(bin?.[1]||'');
 const retailMoney=parseMoney(text.match(/\bRetail\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i)?.[1]||'');
 const year=Number(text.match(/\bYear\s*:\s*(\d{4})\b/i)?.[1])||null;
 const upc=text.match(/\bUPC\s*:\s*([0-9]{8,14})\b/i)?.[1]||'';
 const group=parseLabel(text,'Group',['Wave','Year','Retail','UPC','Where to Buy']);
 const wave=parseLabel(text,'Wave',['Year','Retail','UPC','Where to Buy']);
 return {
  title,url,group,wave,year,upc,retail:retailMoney?.amount??null,
  soldCount:sold?Number(sold[1]):0,
  soldAverage:soldMoney?.amount??null,
  soldHigh:highMoney?.amount??null,
  soldLow:lowMoney?.amount??null,
  buyItNowAverage:binMoney?.amount??null,
  activeFilteredCount:bin?Number(bin[2]):0,
  activeTotalCount:bin?Number(bin[3]):0,
  currency:soldMoney?.currency||highMoney?.currency||lowMoney?.currency||binMoney?.currency||retailMoney?.currency||'USD'
 };
}
function antiBot(html,status){
 const text=normalize(html);
 return status===403||status===429||/captcha|verify you are human|cloudflare|access denied|too many requests/.test(text);
}
async function fetchPublic(url,fetcher=fetch){
 const response=await fetcher(url,{method:'GET',headers:{
  'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':'en-US,en;q=0.9,es;q=0.7',
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36'
 },redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(18000)});
 const html=await response.text();
 if(antiBot(html,response.status)){
  const error=new Error('ActionFigure411 ha limitado temporalmente la consulta pública.');
  error.code='RATE_LIMITED';throw error;
 }
 if(!response.ok)throw new Error('ActionFigure411 HTTP '+response.status);
 return {html,url:response.url||url};
}
async function resolveActionFigure411(item,{fetcher=fetch}={}){
 if(normalize(item?.type)!=='figure')throw new Error('ActionFigure411 se usa solo para figuras no Funko.');
 const genres=inferGenres(item);
 if(!genres.length)throw new Error('No se pudo determinar una sección compatible de ActionFigure411 para esta figura.');
 const terms=buildSearchTerms(item);
 if(!terms.length)throw new Error('Faltan datos suficientes para buscar la figura en ActionFigure411.');
 const cacheKey=normalize([genres[0].slug,...terms,item.year,item.wave,item.edition,item.exclusive].filter(Boolean).join('|'));
 const cached=cache.get(cacheKey);
 if(cached&&Date.now()-cached.at<CACHE_TTL_MS)return {...cached.value,cacheHit:true};

 let best=null,lastAmbiguous=false;
 for(const genre of genres.slice(0,2)){
  for(const term of terms){
   const searchUrl=ACTIONFIGURE411+'/common/search-results.php?g='+genre.g+'&term='+encodeURIComponent(term.replace(/\s+/g,''));
   const page=await fetchPublic(searchUrl,fetcher);
   const chosen=chooseBest(item,parseSearchResults(page.html,genre));
   if(!chosen)continue;
   if(chosen.ambiguous){lastAmbiguous=true;continue;}
   if(!best||chosen.score>best.score)best={...chosen,genre,term,searchUrl};
   if(chosen.score>=360)break;
  }
 }
 if(!best){
  if(lastAmbiguous)throw new Error('ActionFigure411 encontró varias figuras demasiado parecidas; no se usará un precio ambiguo.');
  throw new Error('No se encontró una ficha suficientemente precisa en ActionFigure411.');
 }
 const detailPage=await fetchPublic(best.row.url,fetcher);
 const detail=parseDetailPage(detailPage.html,detailPage.url||best.row.url);
 if(!(detail.soldAverage>0)&&!(detail.soldCount>0))throw new Error('La ficha exacta existe, pero ActionFigure411 no muestra ventas cerradas suficientes para estimar su valor.');
 if(!(detail.soldAverage>0))throw new Error('ActionFigure411 no publica una media de ventas cerradas utilizable para esta figura.');
 const value={status:'completed',value:{
  source:'ActionFigure411',
  amount:detail.soldAverage,
  currency:detail.currency,
  url:detail.url||best.row.url,
  searchUrl:best.searchUrl,
  title:detail.title||best.row.title,
  genre:best.genre.name,
  group:detail.group||best.row.group,
  wave:detail.wave||best.row.wave,
  year:detail.year||best.row.year,
  retail:detail.retail??best.row.retail,
  upc:detail.upc,
  soldCount:detail.soldCount,
  soldAverage:detail.soldAverage,
  soldHigh:detail.soldHigh,
  soldLow:detail.soldLow,
  buyItNowAverage:detail.buyItNowAverage,
  activeFilteredCount:detail.activeFilteredCount,
  activeTotalCount:detail.activeTotalCount,
  evidence:'Media de '+detail.soldCount+' ventas cerradas: '+detail.soldAverage.toFixed(2)+' '+detail.currency+
   (detail.soldLow!=null&&detail.soldHigh!=null?' · rango '+detail.soldLow.toFixed(2)+'-'+detail.soldHigh.toFixed(2)+' '+detail.currency:'')+
   (detail.buyItNowAverage!=null?' · Buy It Now medio '+detail.buyItNowAverage.toFixed(2)+' '+detail.currency:''),
  methodology:'Estimación de mercado de ActionFigure411 basada en subastas vendidas recientes. Es una referencia de mercado, no el precio pagado ni un precio fijo.'
 }};
 cache.set(cacheKey,{at:Date.now(),value});
 if(cache.size>200){
  for(const [key] of [...cache.entries()].sort((a,b)=>a[1].at-b[1].at).slice(0,50))cache.delete(key);
 }
 return value;
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

export {GENRES,decodeHtml,stripTags,normalize,parseMoney,inferGenres,buildSearchTerms,parseSearchResults,scoreCandidate,chooseBest,parseDetailPage,resolveActionFigure411};

export default async function handler(req,res){
 if(!applyCors(req,res))return json(res,403,{error:'Origen no autorizado.'});
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
  const item=body.item||{};
  if(item.type!=='figure')return json(res,400,{error:'ActionFigure411 se usa solo para figuras.'});
  if(!item.title&&!item.character&&!item.barcode&&!item.sku)return json(res,400,{error:'Faltan datos de la figura.'});
  return json(res,200,await resolveActionFigure411(item));
 }catch(error){
  const message=String(error?.message||'No se pudo consultar ActionFigure411.');
  return json(res,error?.code==='RATE_LIMITED'?429:502,{error:message});
 }
}
