const GENERIC=new Set([
 'the','and','for','with','from','into','edition','limited','variant','cover','volume','vol',
 'movie','movies','series','collection','figure','figura','comic','comics','manga','game','games',
 'funko','pop','premium','rewind','marvel','legends','star','wars','disney','dc','comics',
 'edicion','edición','limitada','numero','número','issue','book','libro','planeta'
]);

function norm(value){
 return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function compact(value){return norm(value).replace(/\s+/g,'');}
function words(value){
 return norm(value).split(' ').filter(token=>token.length>=3&&!GENERIC.has(token));
}
function unique(values){return [...new Set(values.filter(Boolean))];}
function strongIds(item){
 return unique([item?.barcode,item?.isbn,item?.sku].map(compact).filter(id=>id.length>=5));
}
function discriminatingTokens(item){
 const title=words(item?.character||item?.title||'');
 const context=new Set([
  ...words(item?.franchise),
  ...words(item?.manufacturer),
  ...words(item?.line)
 ]);
 const specific=title.filter(token=>!context.has(token));
 return unique(specific.length?specific:title);
}

export function priceChartingIdentityMatches(item,guide){
 if(!guide)return false;
 if(item?.type==='comic'||item?.type==='manga')return false;
 const raw=`${guide?.title||''} ${guide?.evidence||''} ${guide?.url||''}`;
 const hayCompact=compact(raw);
 const ids=strongIds(item);
 if(ids.some(id=>hayCompact.includes(id)))return true;

 // Figuras genéricas necesitan identificador fuerte para no aceptar videojuegos
 // u otros productos con el mismo personaje.
 if(item?.type==='figure')return false;

 const hayWords=new Set(words(raw));
 const characterTokens=words(item?.character);
 if(characterTokens.length&&characterTokens.some(token=>hayWords.has(token)))return true;

 const tokens=discriminatingTokens(item);
 if(!tokens.length)return false;
 const hits=tokens.filter(token=>hayWords.has(token)).length;
 if(tokens.length===1)return hits===1;
 // Para títulos con varias palabras distintivas, una palabra rara basta si las
 // genéricas/franquicia ya se han eliminado (p.ej. Sombra / Maul).
 return hits>=1;
}

export function researchUsesPriceChartingData(research){
 if(!research)return false;
 if(String(research?.summary||'').toLowerCase().includes('pricecharting'))return true;
 if(String(research?.asking?.label||'').toLowerCase().includes('pricecharting'))return true;
 if(Boolean(research?.links?.priceCharting))return true;
 if((research?.sources||[]).some(source=>String(source?.url||'').toLowerCase().includes('pricecharting.com')))return true;
 if((research?.comparables||[]).some(row=>String(row?.url||'').toLowerCase().includes('pricecharting.com')))return true;
 return (research?.facts||[]).some(fact=>`${fact?.label||''} ${fact?.value||''}`.toLowerCase().includes('pricecharting'));
}

export function priceChartingResearchMatchesItem(item,research){
 if(!researchUsesPriceChartingData(research))return true;
 if(item?.type==='comic'||item?.type==='manga')return false;
 const comparable=(research?.comparables||[]).filter(row=>
  String(row?.url||'').toLowerCase().includes('pricecharting.com')||
  String(row?.title||'').toLowerCase().includes('pricecharting')
 );
 const sources=(research?.sources||[]).filter(source=>
  String(source?.url||'').toLowerCase().includes('pricecharting.com')||
  String(source?.title||'').toLowerCase().includes('pricecharting')
 );
 const specific=[
  ...comparable.map(row=>`${row?.title||''} ${row?.condition||''}`),
  ...sources.map(source=>`${source?.title||''} ${source?.snippet||''}`)
 ].join(' ').trim();
 if(!specific)return false;
 return priceChartingIdentityMatches(item,{
  title:specific,
  evidence:research?.summary||'',
  url:comparable[0]?.url||sources[0]?.url||''
 });
}
