import { readFileSync, writeFileSync } from 'node:fs';

function once(text, oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`No se encontró: ${label}`);
  return text.replace(oldValue, newValue);
}

const corePath='src/lib/ai-core.mjs';
let core=readFileSync(corePath,'utf8');

const oldLimit=`function limitPricingSources(rows){
 const counts={pricecharting:0,stockx:0,ebay:0};
 return rows.filter(allowedPricingSource).filter(source=>{
  const host=hostOf(source.url);
  const group=host.includes('pricecharting.com')?'pricecharting':host.includes('stockx.com')?'stockx':'ebay';
  const max=group==='ebay'?2:1;
  if(counts[group]>=max)return false;
  counts[group]++;
  return true;
 });
}`;

const newLimit=`function pricingSourceScore(item,source){
 const host=hostOf(source?.url);
 const raw=\`${'${source?.title||\'\'}'} ${'${source?.snippet||\'\'}'}\`;
 let score=0;
 if(extractMoneyPrices(raw).length)score+=100;
 if(item?.type==='funko'&&funkoTextMatches(item,raw))score+=50;
 let path='';
 try{path=new URL(source.url).pathname.toLowerCase()}catch{}
 if(host.includes('pricecharting.com')){
  if(/\\/game\\/funko-pop-/.test(path))score+=35;
  if(/search-products|\\/search/.test(path))score-=30;
 }
 if(host.includes('stockx.com')){
  if(path&&path!=='/'&&!/\\/brands\\/funko|\\/search/.test(path))score+=20;
  if(/\\/brands\\/funko|\\/search/.test(path))score-=20;
 }
 if(host.includes('ebay.')){
  if(/\\/itm\\//.test(path))score+=25;
  if(/\\/sch\\//.test(path))score-=20;
 }
 return score;
}

function prioritizePricingSources(item,rows){
 return [...rows].sort((a,b)=>pricingSourceScore(item,b)-pricingSourceScore(item,a));
}

function limitPricingSources(rows,item=null){
 const counts={pricecharting:0,stockx:0,ebay:0};
 const ordered=item?prioritizePricingSources(item,rows):rows;
 return ordered.filter(allowedPricingSource).filter(source=>{
  const host=hostOf(source.url);
  const group=host.includes('pricecharting.com')?'pricecharting':host.includes('stockx.com')?'stockx':'ebay';
  const max=group==='ebay'?2:1;
  if(counts[group]>=max)return false;
  counts[group]++;
  return true;
 });
}`;
core=once(core,oldLimit,newLimit,'prioridad de fuentes');

const oldSearch=` // UNA sola búsqueda web de precios. El nombre/referencia se pasa literalmente y no se
 // vuelve a ampliar con consultas distintas para cada marketplace.
 if(config.key){
  try{
   const exactQuery=identity.trim();
   const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');
   const allowed=limitPricingSources(keepUsableSources(found));
   webSources=limitPricingSources(uniqueSources([...webSources,...relevantSourcesForItem(item,allowed)]));
  }catch(error){
   warnings.push(error instanceof Error?\`Búsqueda de precios: ${'${error.message}'}\`:'No se pudo completar la búsqueda de precios.');
  }
 }`;

const newSearch=` // Para Funko no se dispersa la búsqueda: PriceCharting va primero y, si ya aporta
 // un precio exacto visible, no se consulta ningún otro marketplace.
 if(config.key){
  try{
   const exactQuery=identity.trim();
   let hasExactVisiblePrice=priceChartingListings.length>0;

   if(isFunko&&!hasExactVisiblePrice){
    const pcFound=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:'pricecharting'}),'pricecharting-public');
    const pcUsable=keepUsableSources(pcFound).filter(allowedPricingSource);
    const pcRelevant=prioritizePricingSources(item,relevantSourcesForItem(item,pcUsable));
    webSources=uniqueSources([...webSources,...pcRelevant]);
    hasExactVisiblePrice=parsePublicListings(pcRelevant).length>0;
   }

   if(!isFunko||!hasExactVisiblePrice){
    const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');
    const usable=keepUsableSources(found).filter(allowedPricingSource);
    const relevant=prioritizePricingSources(item,relevantSourcesForItem(item,usable));
    webSources=uniqueSources([...webSources,...relevant]);
   }

   webSources=limitPricingSources(uniqueSources(webSources),item);
  }catch(error){
   warnings.push(error instanceof Error?\`Búsqueda de precios: ${'${error.message}'}\`:'No se pudo completar la búsqueda de precios.');
  }
 }`;
core=once(core,oldSearch,newSearch,'flujo PriceCharting primero');

core=once(core," const sources=limitPricingSources(uniqueSources(webSources));"," const sources=limitPricingSources(uniqueSources(webSources),item);",'prioridad final de fuentes');

// Menos búsquedas internas cuando ya estamos en modo PriceCharting: una búsqueda exacta y,
// como máximo, una segunda comprobación dentro del mismo dominio.
core=once(core,"    max_uses:3,","    max_uses:searchMode==='pricecharting'?2:3,",'max uses por modo');

writeFileSync(corePath,core);

const testsPath='tests/core.mjs';
let tests=readFileSync(testsPath,'utf8');
const marker="// Regresión: una respuesta JSON imperfecta del modelo no debe tumbar toda la investigación.\n";
const regression=`// Regresión realista: si DeepSeek devuelve primero una página genérica de PriceCharting\n// y después la ficha exacta con precio, la ficha exacta debe ganar y producir valoración.\nlet realPcSearchCalls=0;\nconst realPcFetch=async(url,init)=>{\n if(String(url).includes('frankfurter.dev')){\n  return new Response(JSON.stringify({rate:.9}),{status:200,headers:{'content-type':'application/json'}});\n }\n if(String(url).includes('/anthropic/v1/messages')){\n  realPcSearchCalls++;\n  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[\n   {type:'web_search_result',title:'PriceCharting Search Products',url:'https://www.pricecharting.com/search-products?type=prices&q=Eomer+1982',cited_text:'Search Funko prices'},\n   {type:'web_search_result',title:'Eomer #1982 Prices | Funko POP Movies',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982',cited_text:'Full Price Guide: Eomer #1982. Out of Box $11.05 · In Box $16.00 · New $18.75'}\n  ]}]}),{status:200,headers:{'content-type':'application/json'}});\n }\n return new Response('{}',{status:404,headers:{'content-type':'application/json'}});\n};\nconst realPcResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies',popNumber:'1982',hasBox:true}},{key:'test',fetcher:realPcFetch});\nassert.equal(realPcSearchCalls,1);\nassert.equal(realPcResearch.searchIdentity,'Éomer 1982');\nassert.equal(realPcResearch.sources[0].url,'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982');\nassert.ok(realPcResearch.asking.median>0);\nassert.ok(realPcResearch.comparables.length>0);\n\n`;
if(!tests.includes(marker))throw new Error('No se encontró marcador de tests');
tests=tests.replace(marker,regression+marker);
writeFileSync(testsPath,tests);

console.log('Real Funko pricing source fix applied');
