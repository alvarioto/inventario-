const ACTIONFIGURE411='https://www.actionfigure411.com';
const CACHE_MS=12*60*60*1000;

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

const GENERIC=new Set(['action','figure','figura','figures','toy','toys','collectible','collectibles','hasbro','mcfarlane','neca','bandai','super7','marvel','legends','series','the','and','with','of','a','an']);

function normalize(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
function words(value){return normalize(value).split(' ').filter(x=>x.length>=2)}
function cleanName(value){return words(value).filter(x=>!GENERIC.has(x)).join(' ').trim()}
function inferGenres(item){
  const hay=normalize([item.franchise,item.line,item.manufacturer,item.title,item.character,item.edition].filter(Boolean).join(' '));
  return GENRES.map(genre=>{
    let score=0;
    for(const alias of genre.aliases){
      const n=normalize(alias);
      if(n&&hay.includes(n))score=Math.max(score,n.length+20);
    }
    return {genre,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.genre);
}
function buildTerms(item){
  const out=[];
  const barcode=String(item.barcode||'').replace(/\D/g,'');
  if(barcode.length>=8)out.push(barcode);
  const character=cleanName(item.character||'');
  const title=cleanName(item.title||'');
  if(character)out.push(character);
  if(title)out.push(title);
  const sku=String(item.sku||'').trim();
  if(sku.length>=4)out.push(sku);
  return [...new Set(out)].slice(0,3);
}
function parseNumber(raw){
  let value=String(raw||'').replace(/\s|\u00a0/g,'');
  if(!value)return null;
  const comma=value.lastIndexOf(','),dot=value.lastIndexOf('.');
  if(comma>=0&&dot>=0){
    value=comma>dot?value.replace(/\./g,'').replace(',','.'):value.replace(/,/g,'');
  }else if(comma>=0){
    const decimals=value.length-comma-1;
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
function parseField(text,label,next){
  const names=next.join('|');
  return String(text||'').match(new RegExp(label+'\\s*:\\s*(.*?)(?=\\s+(?:'+names+')\\s*:|$)','i'))?.[1]?.trim()||'';
}
function candidatesFromRows(rows,genre){
  const out=new Map();
  for(const raw of rows||[]){
    let url;
    try{url=new URL(raw.url)}catch{continue}
    if(url.hostname!=='www.actionfigure411.com'||!url.pathname.toLowerCase().startsWith('/'+genre.slug+'/'))continue;
    if(!/\.php$/i.test(url.pathname))continue;
    if(/(?:price-guide|visual-guide|checklist|aggregator|amazon-prime|stats|index|set-list|build-a-figure-list)\.php$/i.test(url.pathname))continue;
    const title=String(raw.title||'').replace(/\s+/g,' ').trim();
    if(!title||title.length>220)continue;
    const text=String(raw.rowText||'').replace(/\s+/g,' ').trim();
    const candidate={
      title,url:url.href,
      group:parseField(text,'Group',['Wave','Year','Retail']),
      wave:parseField(text,'Wave',['Year','Retail']),
      year:Number(text.match(/\bYear\s*:\s*(\d{4})\b/i)?.[1])||null,
      retail:parseMoney(text.match(/\bRetail\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i)?.[1]||'')?.amount??null
    };
    if(!out.has(candidate.url)||title.length>out.get(candidate.url).title.length)out.set(candidate.url,candidate);
  }
  return [...out.values()];
}
function overlap(a,b){
  const stop=new Set(['marvel','legends','action','figure','figura','series','the','and','with','of','a','an']);
  const aa=[...new Set(words(a).filter(x=>!stop.has(x)))],bb=new Set(words(b).filter(x=>!stop.has(x)));
  if(!aa.length)return 0;
  return aa.filter(x=>bb.has(x)).length/aa.length;
}
function score(item,row){
  const targets=[item.character,item.title].filter(Boolean).map(cleanName).filter(Boolean);
  let nameScore=0,rowName=normalize(row.title);
  for(const target of targets){
    const n=normalize(target);
    if(n===rowName)nameScore=Math.max(nameScore,340);
    else if(rowName.includes(n)||n.includes(rowName))nameScore=Math.max(nameScore,230);
    nameScore=Math.max(nameScore,overlap(n,row.title)*190);
  }
  if(nameScore<75)return -1;
  let total=nameScore;
  const year=Number(item.year)||null;
  if(year&&row.year)total+=year===row.year?130:-Math.min(180,Math.abs(year-row.year)*45);
  if(item.wave&&row.wave)total+=normalize(item.wave)===normalize(row.wave)?100:overlap(item.wave,row.wave)*65;
  const meta=[item.edition,item.exclusive,item.line].filter(Boolean).join(' ');
  if(meta)total+=overlap(meta,[row.group,row.wave,row.title].join(' '))*70;
  return total;
}
function choose(item,rows){
  const ranked=rows.map(row=>({row,score:score(item,row)})).filter(x=>x.score>=75).sort((a,b)=>b.score-a.score);
  if(!ranked.length)return null;
  if(ranked[1]&&ranked[0].score-ranked[1].score<18){
    const a=normalize([ranked[0].row.title,ranked[0].row.group,ranked[0].row.wave,ranked[0].row.year].join(' '));
    const b=normalize([ranked[1].row.title,ranked[1].row.group,ranked[1].row.wave,ranked[1].row.year].join(' '));
    if(a!==b)return {ambiguous:true};
  }
  return {ambiguous:false,...ranked[0]};
}
function parseDetail(data){
  const text=String(data.text||'').replace(/\s+/g,' ').trim();
  const sold=text.match(/average\s+price\s+based\s+(?:upon|on)\s+the\s+last\s+(\d+)\s+sold\s+auctions?\s+is\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i);
  const range=text.match(/High\s*:\s*([$€£]\s*[0-9][0-9.,]*)\s*[/|\-]?\s*Low\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i);
  const bin=text.match(/average\s+Buy\s+It\s+Now\s+price\s+is\s+([$€£]\s*[0-9][0-9.,]*)\s+based\s+(?:upon|on)\s+(\d+)\s+filtered\s+active\s+auctions?\s+out\s+of\s+(\d+)/i);
  const soldMoney=parseMoney(sold?.[2]||''),high=parseMoney(range?.[1]||''),low=parseMoney(range?.[2]||''),buy=parseMoney(bin?.[1]||'');
  const retail=parseMoney(text.match(/\bRetail\s*:\s*([$€£]\s*[0-9][0-9.,]*)/i)?.[1]||'');
  return {
    title:String(data.title||'').trim(),url:data.url,
    group:parseField(text,'Group',['Wave','Year','Retail','UPC','Where to Buy']),
    wave:parseField(text,'Wave',['Year','Retail','UPC','Where to Buy']),
    year:Number(text.match(/\bYear\s*:\s*(\d{4})\b/i)?.[1])||null,
    upc:text.match(/\bUPC\s*:\s*([0-9]{8,14})\b/i)?.[1]||'',
    retail:retail?.amount??null,
    soldCount:sold?Number(sold[1]):0,soldAverage:soldMoney?.amount??null,
    soldHigh:high?.amount??null,soldLow:low?.amount??null,buyItNowAverage:buy?.amount??null,
    activeFilteredCount:bin?Number(bin[2]):0,activeTotalCount:bin?Number(bin[3]):0,
    currency:soldMoney?.currency||high?.currency||low?.currency||buy?.currency||retail?.currency||'USD'
  };
}
function waitForTab(tabId,predicate,timeout=16000){
  return new Promise((resolve,reject)=>{
    let done=false;
    const timer=setTimeout(()=>finish(new Error('La página tardó demasiado en cargar.')),timeout);
    function finish(error,tab){
      if(done)return;done=true;clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);
      error?reject(error):resolve(tab);
    }
    function listener(id,change,tab){
      if(id!==tabId)return;
      if(change.status==='complete'&&predicate(tab))finish(null,tab);
    }
    chrome.tabs.get(tabId).then(tab=>{if(tab.status==='complete'&&predicate(tab))finish(null,tab)}).catch(e=>finish(e));
  });
}
async function navigate(tabId,url,predicate=()=>true){
  const waiting=waitForTab(tabId,predicate,18000);
  await chrome.tabs.update(tabId,{url});
  return waiting;
}
async function run(tabId,func,args=[]){
  const rows=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func,args});
  return rows?.[0]?.result;
}
async function visibleSearch(tabId,genre,term){
  await navigate(tabId,ACTIONFIGURE411+'/'+genre.slug+'/',tab=>tab.url?.startsWith(ACTIONFIGURE411+'/'+genre.slug));
  const started=await run(tabId,(query)=>{
    const input=document.querySelector('#queryInput');
    if(!input)return {ok:false,error:'No aparece el cuadro Search de ActionFigure411.'};
    input.focus();
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if(setter)setter.call(input,query);else input.value=query;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const init={key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true};
    input.dispatchEvent(new KeyboardEvent('keydown',init));
    input.dispatchEvent(new KeyboardEvent('keypress',init));
    input.dispatchEvent(new KeyboardEvent('keyup',init));
    if(input.form)setTimeout(()=>{try{input.form.requestSubmit()}catch{}},30);
    return {ok:true};
  },[term]);
  if(!started?.ok)throw new Error(started?.error||'No se pudo escribir en el buscador de ActionFigure411.');
  try{
    await waitForTab(tabId,tab=>/\/common\/search-results\.php/i.test(tab.url||''),2500);
  }catch{
    // Mismo destino que usa el Search de la web, pero la navegación la hace
    // el Chrome real del usuario. No existe ninguna petición desde Vercel.
    const searchUrl=ACTIONFIGURE411+'/common/search-results.php?g='+genre.g+'&term='+encodeURIComponent(term.replace(/\s+/g,''));
    await navigate(tabId,searchUrl,tab=>/\/common\/search-results\.php/i.test(tab.url||''));
  }
  const data=await run(tabId,()=>({
    url:location.href,
    text:document.body?.innerText||'',
    rows:[...document.querySelectorAll('a[href]')].map(a=>{
      const row=a.closest('tr')||a.closest('.row')||a.parentElement?.parentElement||a.parentElement;
      return {title:(a.textContent||a.querySelector('img')?.alt||'').trim(),url:a.href,rowText:row?.innerText||''};
    })
  }));
  if(/verify you are human|access denied|too many requests|captcha/i.test(data?.text||''))throw new Error('ActionFigure411 ha pedido verificación en el navegador.');
  return data;
}
async function getDetail(tabId,url){
  await navigate(tabId,url,tab=>tab.url===url||tab.url?.startsWith(url));
  return run(tabId,()=>({url:location.href,title:document.querySelector('h1')?.textContent?.trim()||document.title,text:document.body?.innerText||''}));
}
async function cached(key){
  const id='af411:'+key;
  const row=(await chrome.storage.local.get(id))[id];
  return row&&Date.now()-row.at<CACHE_MS?row.value:null;
}
async function saveCache(key,value){
  await chrome.storage.local.set({['af411:'+key]:{at:Date.now(),value}});
}
async function lookup(item){
  if(item?.type!=='figure')throw new Error('ActionFigure411 se usa solo para figuras.');
  const genres=inferGenres(item),terms=buildTerms(item);
  if(!genres.length)throw new Error('No se pudo determinar la sección de ActionFigure411.');
  if(!terms.length)throw new Error('Faltan datos para buscar la figura.');
  const key=normalize([genres[0].slug,...terms,item.year,item.wave,item.edition,item.exclusive].filter(Boolean).join('|'));
  const hit=await cached(key);if(hit)return hit;

  let tab;
  try{
    tab=await chrome.tabs.create({url:'about:blank',active:false});
    let best=null,ambiguous=false;
    for(const genre of genres.slice(0,2)){
      for(const term of terms){
        const data=await visibleSearch(tab.id,genre,term);
        const chosen=choose(item,candidatesFromRows(data.rows,genre));
        if(!chosen)continue;
        if(chosen.ambiguous){ambiguous=true;continue;}
        if(!best||chosen.score>best.score)best={...chosen,genre,term,searchUrl:data.url};
        if(chosen.score>=330)break;
      }
      if(best?.score>=330)break;
    }
    if(!best){
      if(ambiguous)throw new Error('ActionFigure411 encontró varias figuras demasiado parecidas.');
      throw new Error('ActionFigure411 no encontró una coincidencia suficientemente precisa.');
    }
    const detail=parseDetail(await getDetail(tab.id,best.row.url));
    if(!(detail.soldAverage>0))throw new Error('La ficha exacta no muestra una media de ventas cerradas utilizable.');
    const value={
      source:'ActionFigure411',amount:detail.soldAverage,currency:detail.currency,url:detail.url,searchUrl:best.searchUrl,
      title:detail.title||best.row.title,genre:best.genre.name,group:detail.group||best.row.group,wave:detail.wave||best.row.wave,
      year:detail.year||best.row.year,retail:detail.retail??best.row.retail,upc:detail.upc,soldCount:detail.soldCount,
      soldAverage:detail.soldAverage,soldHigh:detail.soldHigh,soldLow:detail.soldLow,buyItNowAverage:detail.buyItNowAverage,
      activeFilteredCount:detail.activeFilteredCount,activeTotalCount:detail.activeTotalCount,
      evidence:'Media de '+detail.soldCount+' ventas cerradas: '+detail.soldAverage.toFixed(2)+' '+detail.currency+
        (detail.soldLow!=null&&detail.soldHigh!=null?' · rango '+detail.soldLow.toFixed(2)+'-'+detail.soldHigh.toFixed(2)+' '+detail.currency:'')+
        (detail.buyItNowAverage!=null?' · Buy It Now medio '+detail.buyItNowAverage.toFixed(2)+' '+detail.currency:''),
      methodology:'Estimación de mercado de ActionFigure411 obtenida desde su buscador visible usando el navegador real del usuario. Basada en subastas vendidas recientes; no es el precio pagado ni un precio fijo.'
    };
    await saveCache(key,value);
    return value;
  }finally{
    if(tab?.id)chrome.tabs.remove(tab.id).catch(()=>{});
  }
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type!=='AF411_LOOKUP')return;
  lookup(message.payload?.item||{}).then(value=>sendResponse({ok:true,value})).catch(error=>sendResponse({ok:false,error:String(error?.message||error)}));
  return true;
});
