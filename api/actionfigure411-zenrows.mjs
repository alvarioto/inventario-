import {
  GENRES,
  inferGenres,
  buildSearchTerms,
  scoreCandidate,
  parseDetailPage,
  stripTags,
  looksBlocked
} from './actionfigure411-value.mjs';

const ACTIONFIGURE411='https://www.actionfigure411.com';
const ZENROWS_API='https://api.zenrows.com/v1/';

function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
}

function absoluteUrl(value){
  try{return new URL(String(value||''),ACTIONFIGURE411).href}catch{return''}
}

function safeItem(raw={}){
  return {
    type:String(raw.type||'figure'),
    title:String(raw.title||'').trim(),
    character:String(raw.character||'').trim(),
    manufacturer:String(raw.manufacturer||'').trim(),
    line:String(raw.line||'').trim(),
    franchise:String(raw.franchise||'').trim(),
    edition:String(raw.edition||'').trim(),
    wave:String(raw.wave||'').trim(),
    exclusive:String(raw.exclusive||'').trim(),
    year:Number(raw.year)||null,
    sku:String(raw.sku||'').trim(),
    barcode:String(raw.barcode||'').replace(/\D/g,'')
  };
}

async function zenFetch(targetUrl,{jsRender=false}={}){
  const key=String(process.env.ZENROWS_API_KEY||'').trim();
  if(!key)throw new Error('ZENROWS_API_KEY no está configurada en el backend.');
  const qs=new URLSearchParams({apikey:key,url:targetUrl,premium_proxy:'true'});
  if(jsRender)qs.set('js_render','true');
  const response=await fetch(`${ZENROWS_API}?${qs}`,{signal:AbortSignal.timeout(jsRender?45000:25000)});
  const text=await response.text();
  if(!response.ok)throw new Error(`ZenRows HTTP ${response.status}: ${text.slice(0,220)}`);
  if(looksBlocked(text))throw new Error('ActionFigure411 devolvió una página de bloqueo.');
  return text;
}

function parseAutocomplete(raw,genre,term,item){
  let rows=[];
  try{rows=JSON.parse(raw)}catch{return[]}
  if(!Array.isArray(rows))return[];
  const barcodeTerm=/^\d{8,14}$/.test(term);
  return rows.map(entry=>{
    const url=absoluteUrl(entry?.url);
    if(!url)return null;
    const title=stripTags(entry?.name||'').replace(/^\s*\[\d+\]\s*/,'').trim();
    if(!title)return null;
    const row={title,url,group:'',wave:'',year:null,retail:null,genre:genre.name};
    const score=barcodeTerm?600:scoreCandidate(item,row);
    if(score<75)return null;
    return {row,score,term,id:Number(entry?.id)||null};
  }).filter(Boolean);
}

function genreOrder(item){
  const inferred=inferGenres(item);
  const seen=new Set(inferred.map(x=>x.g));
  return [...inferred,...GENRES.filter(x=>!seen.has(x.g))];
}

async function searchCandidates(item){
  const terms=buildSearchTerms(item);
  if(!terms.length)throw new Error('Faltan UPC, nombre, personaje o SKU para buscar la figura.');
  const ordered=genreOrder(item);
  const inferredCount=inferGenres(item).length;
  const firstPass=inferredCount?ordered.slice(0,Math.min(3,inferredCount)):ordered;
  const secondPass=inferredCount?ordered.slice(firstPass.length):[];
  const found=new Map();

  async function run(genres){
    for(const term of terms){
      for(const genre of genres){
        const target=`${ACTIONFIGURE411}/common/search.php?term=${encodeURIComponent(term)}&genre=${genre.g}`;
        let raw='';
        try{raw=await zenFetch(target)}catch{continue}
        for(const candidate of parseAutocomplete(raw,genre,term,item)){
          const existing=found.get(candidate.row.url);
          if(!existing||candidate.score>existing.score)found.set(candidate.row.url,candidate);
        }
        const best=[...found.values()].sort((a,b)=>b.score-a.score)[0];
        if(best?.score>=500)return true;
        if(best?.score>=320&&!/^\d{8,14}$/.test(term))return true;
      }
    }
    return false;
  }

  const strong=await run(firstPass);
  if(!strong&&secondPass.length)await run(secondPass);
  return [...found.values()].sort((a,b)=>b.score-a.score).slice(0,8);
}

async function resolveBest(item,candidates){
  const requestedBarcode=item.barcode;
  const checked=[];
  for(const candidate of candidates.slice(0,5)){
    let html='';
    try{html=await zenFetch(candidate.row.url,{jsRender:true})}catch{continue}
    const detail=parseDetailPage(html,candidate.row.url);
    if(!detail.title)continue;
    if(requestedBarcode&&detail.upc&&requestedBarcode!==detail.upc)continue;
    const detailScore=scoreCandidate(item,{
      title:detail.title,
      url:candidate.row.url,
      group:detail.group,
      wave:detail.wave,
      year:detail.year,
      retail:detail.retail,
      genre:candidate.row.genre
    });
    if(!requestedBarcode&&detailScore<75)continue;
    checked.push({candidate,detail,score:(requestedBarcode&&detail.upc===requestedBarcode?1000:0)+Math.max(candidate.score,0)+Math.max(detailScore,0)});
  }
  checked.sort((a,b)=>b.score-a.score);
  return checked[0]||null;
}

function valueFromResolved(item,resolved){
  const {candidate,detail}=resolved;
  if(!Number.isFinite(detail.soldAverage)||detail.soldAverage<=0||detail.soldCount<=0){
    throw new Error('La ficha exacta existe, pero no publica suficientes ventas cerradas para estimar su valor.');
  }
  const id=candidate.id||Number(candidate.row.url.match(/-(\d+)\.php(?:$|\?)/)?.[1])||null;
  return {
    source:'ActionFigure411',
    amount:detail.soldAverage,
    currency:detail.currency||'USD',
    url:candidate.row.url,
    searchUrl:candidate.row.url,
    id,
    title:detail.title||candidate.row.title,
    genre:candidate.row.genre,
    group:detail.group||'',
    wave:detail.wave||'',
    year:detail.year,
    retail:detail.retail,
    upc:detail.upc||item.barcode||'',
    soldCount:detail.soldCount,
    soldAverage:detail.soldAverage,
    soldHigh:detail.soldHigh,
    soldLow:detail.soldLow,
    buyItNowAverage:detail.buyItNowAverage,
    activeFilteredCount:detail.activeFilteredCount,
    activeTotalCount:detail.activeTotalCount,
    evidence:`Media de ${detail.soldCount} ventas cerradas: ${detail.soldAverage.toFixed(2)} ${detail.currency||'USD'}${detail.soldLow!=null&&detail.soldHigh!=null?` · rango ${detail.soldLow.toFixed(2)}-${detail.soldHigh.toFixed(2)} ${detail.currency||'USD'}`:''}${detail.buyItNowAverage!=null?` · Buy It Now medio ${detail.buyItNowAverage.toFixed(2)} ${detail.currency||'USD'}`:''}`,
    methodology:'Ficha exacta localizada con el buscador oficial de ActionFigure411 a través del backend ZenRows. Se prioriza UPC y después identidad, serie, variante, wave y año. El valor principal es la media publicada de ventas cerradas.'
  };
}

export default async function handler(req,res){
  setCors(res);
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  if(req.method!=='POST'){
    res.statusCode=405;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({error:'Usa POST.'}));
  }
  try{
    const item=safeItem(req.body?.item||req.body||{});
    if(item.type!=='figure')throw new Error('ActionFigure411 solo se usa para figuras.');
    const candidates=await searchCandidates(item);
    if(!candidates.length)throw new Error('ActionFigure411 no encontró una ficha compatible en sus géneros.');
    const resolved=await resolveBest(item,candidates);
    if(!resolved)throw new Error('No se pudo validar una ficha exacta de ActionFigure411.');
    const value=valueFromResolved(item,resolved);
    res.statusCode=200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.end(JSON.stringify({status:'completed',value}));
  }catch(error){
    res.statusCode=422;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({error:error instanceof Error?error.message:String(error)}));
  }
}
