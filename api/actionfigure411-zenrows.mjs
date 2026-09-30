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
const SEARCH_STOP=new Set(['the','a','an','series','figure','figures','action','collectible','collectibles','toy','toys','pack','set','two','2','hasbro','mcfarlane','neca','bandai','super7','marvel','legends']);

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

function romanToInt(raw){
  const roman=String(raw||'').toUpperCase();
  if(!/^[IVXLCDM]+$/.test(roman))return null;
  const values={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};
  let total=0,prev=0;
  for(let i=roman.length-1;i>=0;i--){
    const value=values[roman[i]]||0;
    total+=value<prev?-value:value;
    if(value>=prev)prev=value;
  }
  return total>0&&total<4000?total:null;
}

function canonicalMarks(value){
  return String(value||'')
    .replace(/\bMark\s+([IVXLCDM]+)\b/gi,(_,roman)=>{const n=romanToInt(roman);return n?`MK${n}`:`Mark ${roman}`})
    .replace(/\bMark\s+(\d{1,4})\b/gi,'MK$1')
    .replace(/\bMK\s+(\d{1,4})\b/gi,'MK$1');
}

function simpleNormalize(value){
  return canonicalMarks(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}

function distinctiveTokens(value){
  return [...new Set(simpleNormalize(value).split(' ').filter(token=>token.length>=2&&!SEARCH_STOP.has(token)))];
}

function itemIdentityTokens(item){
  const main=distinctiveTokens([item.title,item.edition,item.character].filter(Boolean).join(' '));
  const weak=new Set(distinctiveTokens([item.manufacturer,item.line,item.franchise].filter(Boolean).join(' ')));
  return main.filter(token=>!weak.has(token)||/^(?:mk\d+|\d{3,})$/.test(token));
}

function identityCoverage(item,candidateText){
  const wanted=itemIdentityTokens(item);
  if(!wanted.length)return 0;
  const got=new Set(distinctiveTokens(candidateText));
  const hits=wanted.filter(token=>got.has(token)).length;
  return hits/wanted.length;
}

function removePhrase(value,phrase){
  const raw=String(phrase||'').trim();
  if(!raw)return value;
  const escaped=raw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
  return value.replace(new RegExp(`\\b${escaped}\\b`,'ig'),' ');
}

function cleanedTitle(item){
  let value=canonicalMarks(item.title||'');
  for(const phrase of [item.manufacturer,item.line,item.franchise])value=removePhrase(value,phrase);
  return value.replace(/\b(?:2|two)[-\s]*pack\b/ig,' ').replace(/\bpack\b/ig,' ').replace(/\s+/g,' ').trim();
}

function addUnique(rows,value){
  const clean=String(value||'').replace(/\s+/g,' ').trim();
  if(clean.length<2)return;
  const key=simpleNormalize(clean);
  if(!key||rows.some(x=>simpleNormalize(x)===key))return;
  rows.push(clean);
}

function suffixPhrase(value,maxWords=3){
  const tokens=String(value||'').replace(/[^A-Za-z0-9]+/g,' ').split(/\s+/).filter(Boolean).filter(x=>!SEARCH_STOP.has(x.toLowerCase()));
  return tokens.slice(-maxWords).join(' ');
}

function buildFastSearchTerms(item={}){
  const terms=[];
  const barcode=String(item.barcode||'').replace(/\D/g,'');
  if(barcode.length>=8)addUnique(terms,barcode);

  const title=cleanedTitle(item);
  const parts=title.split(/\s+(?:&|and|vs\.?|versus|\+)\s+|\s*\/\s*/i).map(x=>x.trim()).filter(Boolean);
  for(const part of parts){
    const short=suffixPhrase(part,3);
    if(short)addUnique(terms,short);
  }

  const editionCharacter=canonicalMarks([item.edition,item.character].filter(Boolean).join(' '));
  if(editionCharacter)addUnique(terms,editionCharacter);

  for(const value of buildSearchTerms({...item,title:canonicalMarks(item.title),character:canonicalMarks(item.character)})){
    addUnique(terms,canonicalMarks(value));
  }

  if(item.sku)addUnique(terms,item.sku);
  return terms.slice(0,6);
}

async function zenFetch(targetUrl,{jsRender=false}={}){
  const key=String(process.env.ZENROWS_API_KEY||'').trim();
  if(!key)throw new Error('ZENROWS_API_KEY no está configurada en el backend.');
  const qs=new URLSearchParams({apikey:key,url:targetUrl,premium_proxy:'true'});
  if(jsRender)qs.set('js_render','true');
  const response=await fetch(`${ZENROWS_API}?${qs}`,{signal:AbortSignal.timeout(jsRender?30000:15000)});
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
    const baseScore=barcodeTerm?650:scoreCandidate({...item,title:canonicalMarks(item.title),character:canonicalMarks(item.character)},row);
    const coverage=identityCoverage(item,title);
    const score=(Number.isFinite(baseScore)&&baseScore>0?baseScore:0)+Math.round(coverage*280);
    if(!barcodeTerm&&score<100)return null;
    return {row,score,coverage,term,id:Number(entry?.id)||null};
  }).filter(Boolean);
}

function genreOrder(item){
  const inferred=inferGenres(item);
  const seen=new Set(inferred.map(x=>x.g));
  return [...inferred,...GENRES.filter(x=>!seen.has(x.g))];
}

function bestCandidate(found){
  return [...found.values()].sort((a,b)=>b.score-a.score)[0]||null;
}

function strongCandidate(candidate,item){
  if(!candidate)return false;
  if(/^\d{8,14}$/.test(candidate.term))return candidate.score>=650;
  const tokenCount=itemIdentityTokens(item).length;
  const needed=tokenCount>=4?0.60:0.50;
  return candidate.coverage>=needed&&candidate.score>=400;
}

async function searchGenreBatch(item,terms,genres,found){
  for(const term of terms){
    const results=await Promise.all(genres.map(async genre=>{
      const target=`${ACTIONFIGURE411}/common/search.php?term=${encodeURIComponent(term)}&genre=${genre.g}`;
      try{return parseAutocomplete(await zenFetch(target),genre,term,item)}catch{return[]}
    }));
    for(const list of results){
      for(const candidate of list){
        const existing=found.get(candidate.row.url);
        if(!existing||candidate.score>existing.score)found.set(candidate.row.url,candidate);
      }
    }
    const best=bestCandidate(found);
    if(strongCandidate(best,item))return true;
  }
  return false;
}

async function searchCandidates(item){
  const terms=buildFastSearchTerms(item);
  if(!terms.length)throw new Error('Faltan UPC, nombre, personaje o SKU para buscar la figura.');
  const ordered=genreOrder(item);
  const inferred=inferGenres(item);
  const found=new Map();

  if(inferred.length){
    const primary=ordered.slice(0,Math.min(2,inferred.length));
    const strong=await searchGenreBatch(item,terms,primary,found);
    if(strong||found.size)return [...found.values()].sort((a,b)=>b.score-a.score).slice(0,6);
    const rest=ordered.slice(primary.length);
    for(let i=0;i<rest.length;i+=4){
      if(await searchGenreBatch(item,terms.slice(0,3),rest.slice(i,i+4),found))break;
    }
  }else{
    for(let i=0;i<ordered.length;i+=4){
      if(await searchGenreBatch(item,terms.slice(0,4),ordered.slice(i,i+4),found))break;
    }
  }
  return [...found.values()].sort((a,b)=>b.score-a.score).slice(0,6);
}

function minimumCoverage(item){
  return itemIdentityTokens(item).length>=4?0.60:0.50;
}

async function resolveBest(item,candidates){
  const requestedBarcode=item.barcode;
  const gap=candidates[1]?candidates[0].score-candidates[1].score:999;
  const limit=gap<80?Math.min(2,candidates.length):Math.min(1,candidates.length);
  let fallback=null;

  for(const candidate of candidates.slice(0,limit)){
    let html='';
    try{html=await zenFetch(candidate.row.url,{jsRender:true})}catch{continue}
    const detail=parseDetailPage(html,candidate.row.url);
    if(!detail.title)continue;
    if(requestedBarcode&&detail.upc&&requestedBarcode!==detail.upc)continue;
    const combined=[detail.title,detail.group,detail.wave,candidate.row.title].filter(Boolean).join(' ');
    const coverage=identityCoverage(item,combined);
    if(requestedBarcode&&detail.upc===requestedBarcode){
      return {candidate,detail,score:2000+candidate.score,coverage};
    }
    if(coverage<minimumCoverage(item))continue;
    const detailScore=scoreCandidate({...item,title:canonicalMarks(item.title),character:canonicalMarks(item.character)},{
      title:detail.title,
      url:candidate.row.url,
      group:detail.group,
      wave:detail.wave,
      year:detail.year,
      retail:detail.retail,
      genre:candidate.row.genre
    });
    const resolved={candidate,detail,coverage,score:candidate.score+Math.max(detailScore,0)+Math.round(coverage*320)};
    if(!fallback||resolved.score>fallback.score)fallback=resolved;
    if(gap>=80)return resolved;
  }
  return fallback;
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
    methodology:'Ficha exacta localizada con el buscador oficial de ActionFigure411 a través del backend ZenRows. Se prioriza UPC y búsquedas cortas específicas; la coincidencia debe conservar los rasgos distintivos del producto antes de aceptar la ficha.'
  };
}

export {buildFastSearchTerms,identityCoverage,canonicalMarks,itemIdentityTokens};

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
