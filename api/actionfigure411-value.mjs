const ACTIONFIGURE411='https://www.actionfigure411.com';

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

function decodeHtml(value){
 return String(value||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function stripTags(value){
 return decodeHtml(String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function normalize(value){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
function words(value){return normalize(value).split(' ').filter(x=>x.length>=2)}
function parseNumber(raw){
 let value=String(raw||'').replace(/\s|\u00a0/g,'');
 if(!value)return null;
 const comma=value.lastIndexOf(','),dot=value.lastIndexOf('.');
 if(comma>=0&&dot>=0)value=comma>dot?value.replace(/\./g,'').replace(',','.'):value.replace(/,/g,'');
 else if(comma>=0){const decimals=value.length-comma-1;value=decimals>=1&&decimals<=2?value.replace(',','.'):value.replace(/,/g,'');}
 const n=Number(value);return Number.isFinite(n)&&n>=0&&n<1000000?n:null;
}
function parseMoney(value){
 const m=String(value||'').match(/([$€£])\s*([0-9][0-9.,]*)/);if(!m)return null;
 const amount=parseNumber(m[2]);if(amount==null)return null;
 return {amount,currency:m[1]==='$'?'USD':m[1]==='€'?'EUR':'GBP'};
}
function inferGenres(item={}){
 const hay=normalize([item.franchise,item.line,item.manufacturer,item.title,item.character,item.edition].filter(Boolean).join(' '));
 return GENRES.map(genre=>{
  let score=0;for(const alias of genre.aliases){const token=normalize(alias);if(token&&hay.includes(token))score=Math.max(score,token.length+20);}
  return {genre,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.genre);
}
const GENERIC_WORDS=new Set(['action','figure','figura','figures','toy','toys','collectible','collectibles','hasbro','mcfarlane','neca','bandai','super7','marvel','legends','series','the','and','with','of','a','an']);
function cleanSearchName(value){return words(value).filter(x=>!GENERIC_WORDS.has(x)).join(' ').trim()}
function buildSearchTerms(item={}){
 const values=[],barcode=String(item.barcode||'').replace(/\D/g,'');
 if(barcode.length>=8)values.push(barcode);
 const character=cleanSearchName(item.character||''),title=cleanSearchName(item.title||'');
 if(character)values.push(character);if(title)values.push(title);
 const sku=String(item.sku||'').trim();if(sku.length>=4)values.push(sku);
 return [...new Set(values.map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean))].slice(0,3);
}
function absoluteUrl(href){try{return new URL(decodeHtml(href),ACTIONFIGURE411).href}catch{return''}}
function enclosingRow(html,index){
 const before=html.lastIndexOf('<tr',index),after=html.indexOf('</tr>',index);
 if(before>=0&&after>index&&after-before<12000)return html.slice(before,after+5);
 return html.slice(Math.max(0,index-900),Math.min(html.length,index+2400));
}
function esc(value){return String(value||'').replace(/[.*+?^$()|[\]{}\\]/g,'\\$&')}
function parseLabel(text,label,nextLabels){
 const re=new RegExp(esc(label)+'\\s*:\\s*(.*?)(?=\\s+(?:'+nextLabels.map(esc).join('|')+')\\s*:|$)','i');
 return String(text||'').match(re)?.[1]?.trim()||'';
}
function parseSearchResults(html,genre){
 const out=new Map(),raw=String(html||''),re=/<a\b[^>]*href=["']([^"']+\.php(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
 for(const match of raw.matchAll(re)){
  const url=absoluteUrl(match[1]);if(!url)continue;
  let pathname='';try{pathname=new URL(url).pathname.toLowerCase()}catch{continue}
  if(!pathname.startsWith('/'+genre.slug+'/')||/(?:price-guide|visual-guide|checklist|aggregator|amazon-prime|stats|index|set-list|build-a-figure-list)\.php$/i.test(pathname))continue;
  let title=stripTags(match[2]);if(!title)title=decodeHtml(match[2].match(/\balt=["']([^"']+)["']/i)?.[1]||'').trim();
  if(!title||title.length>220)continue;
  const rowText=stripTags(enclosingRow(raw,match.index||0));
  const candidate={title,url,group:parseLabel(rowText,'Group',['Wave','Year','Retail']),wave:parseLabel(rowText,'Wave',['Year','Retail']),
   year:Number(rowText.match(/\bYear\s*:\s*(\d{4})\b/i)?.[1])||null,
   retail:parseMoney(rowText.match(/\bRetail\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i)?.[1]||'')?.amount??null,genre:genre.name};
  if(!out.has(url)||title.length>out.get(url).title.length)out.set(url,candidate);
 }
 return [...out.values()];
}
function overlapScore(a,b){
 const stop=new Set(['marvel','legends','action','figure','figura','series','the','and','with','of','a','an']);
 const aa=[...new Set(words(a).filter(x=>!stop.has(x)))],bb=new Set(words(b).filter(x=>!stop.has(x)));
 return aa.length?aa.filter(x=>bb.has(x)).length/aa.length:0;
}
function scoreCandidate(item,row){
 const targets=[item.character,item.title].filter(Boolean).map(cleanSearchName).filter(Boolean);if(!targets.length)return -1;
 let nameScore=0,rowName=normalize(row.title);
 for(const target of targets){const n=normalize(target);if(n===rowName)nameScore=Math.max(nameScore,340);else if(rowName.includes(n)||n.includes(rowName))nameScore=Math.max(nameScore,230);nameScore=Math.max(nameScore,overlapScore(n,row.title)*190);}
 if(nameScore<75)return -1;
 let score=nameScore;const year=Number(item.year)||null;
 if(year&&row.year)score+=year===row.year?130:-Math.min(180,Math.abs(year-row.year)*45);
 if(item.wave&&row.wave)score+=normalize(item.wave)===normalize(row.wave)?100:overlapScore(item.wave,row.wave)*65;
 const meta=[item.edition,item.exclusive,item.line].filter(Boolean).join(' ');if(meta)score+=overlapScore(meta,[row.group,row.wave,row.title].join(' '))*70;
 return score;
}
function chooseBest(item,rows){
 const ranked=rows.map(row=>({row,score:scoreCandidate(item,row)})).filter(x=>x.score>=75).sort((a,b)=>b.score-a.score);if(!ranked.length)return null;
 if(ranked[1]&&ranked[0].score-ranked[1].score<18){
  const a=normalize([ranked[0].row.title,ranked[0].row.group,ranked[0].row.wave,ranked[0].row.year].join(' ')),b=normalize([ranked[1].row.title,ranked[1].row.group,ranked[1].row.wave,ranked[1].row.year].join(' '));
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
 const soldMoney=parseMoney(sold?.[2]||''),high=parseMoney(range?.[1]||''),low=parseMoney(range?.[2]||''),buy=parseMoney(bin?.[1]||''),retail=parseMoney(text.match(/\bRetail\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i)?.[1]||'');
 return {title,url,group:parseLabel(text,'Group',['Wave','Year','Retail','UPC','Where to Buy']),wave:parseLabel(text,'Wave',['Year','Retail','UPC','Where to Buy']),
  year:Number(text.match(/\bYear\s*:\s*(\d{4})\b/i)?.[1])||null,upc:text.match(/\bUPC\s*:\s*([0-9]{8,14})\b/i)?.[1]||'',retail:retail?.amount??null,
  soldCount:sold?Number(sold[1]):0,soldAverage:soldMoney?.amount??null,soldHigh:high?.amount??null,soldLow:low?.amount??null,buyItNowAverage:buy?.amount??null,
  activeFilteredCount:bin?Number(bin[2]):0,activeTotalCount:bin?Number(bin[3]):0,currency:soldMoney?.currency||high?.currency||low?.currency||buy?.currency||retail?.currency||'USD'};
}
function looksBlocked(html){return /captcha|verify you are human|access denied|too many requests|temporarily blocked|cloudflare/.test(normalize(stripTags(html)))}

export {GENRES,decodeHtml,stripTags,normalize,parseMoney,inferGenres,buildSearchTerms,parseSearchResults,scoreCandidate,chooseBest,parseDetailPage,looksBlocked};

export default function handler(req,res){
 res.statusCode=410;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 res.end(JSON.stringify({error:'ActionFigure411 se consulta desde el navegador local de FrikiVault; el endpoint de servidor está retirado.'}));
}
