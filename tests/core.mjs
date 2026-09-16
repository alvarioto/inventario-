import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { identificationSchema, summarizeListings, safeUrl, deepseek, deepseekWebSearch, parsePublicListings, fetchPriceChartingGuide, research, identify, isGenericProductTitle, buildResearchIdentity } from '../server/core.mjs';

const identification = identificationSchema.parse({title:'Batman #125',type:'comic',confidence:.8,explanation:'Texto visible'});
assert.equal(identification.franchise,'');
assert.equal(identification.condition,null);
assert.equal(identification.hasBox,null);
assert.equal(identificationSchema.parse({title:'Test mint',type:'funko',condition:'mint',confidence:.9,explanation:'x'}).condition,'new');
assert.equal(identificationSchema.parse({title:'Test used',type:'funko',condition:'used',confidence:.9,explanation:'x'}).condition,'good');
assert.equal(identificationSchema.parse({title:'Test unknown',type:'funko',condition:'unknown',confidence:.9,explanation:'x'}).condition,null);
assert.equal(safeUrl('javascript:alert(1)'),null);


assert.equal(isGenericProductTitle('Funko caja – dorso con código de barras e Item No. 90310 Funko'),true);
const cleanIdentity=buildResearchIdentity({title:'Funko caja – dorso con código de barras e Item No. 90310 Funko',type:'funko',manufacturer:'Funko',sku:'90310',barcode:'889698903105'});
assert.doesNotMatch(cleanIdentity,/dorso|codigo de barras/i);
assert.equal(cleanIdentity,'Funko 90310');
assert.doesNotMatch(cleanIdentity,/889698903105/);
assert.equal(buildResearchIdentity({title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',sku:'90310',barcode:'889698903105'}),'Éomer 1982');
assert.equal(buildResearchIdentity({title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982 Chase',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',funkoVariant:'Chase'}),'Éomer 1982 Chase');

const market = summarizeListings([
  {price:10,currency:'EUR',shipping:2},
  {price:20,currency:'EUR',shipping:0}
]);
assert.deepEqual(
  {kind:market.kind,currency:market.currency,count:market.count,min:market.min,max:market.max,median:market.median},
  {kind:'asking',currency:'EUR',count:2,min:12,max:20,median:16}
);
assert.match(market.label,/ventas cerradas/i);

const fakeFetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"summary":"Ficha contrastada","facts":[],"comparableIds":[]}'}}]}),{status:200,headers:{'content-type':'application/json'}});
assert.equal((await deepseek([{role:'user',content:'test'}],{key:'test',fetcher:fakeFetch})).summary,'Ficha contrastada');

const fencedFetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'```json\n{"ok":true,"value":"recuperado"}\n```'}}]}),{status:200,headers:{'content-type':'application/json'}});
const fencedResult=await deepseek([{role:'user',content:'test fenced'}],{key:'test',fetcher:fencedFetch});
assert.equal(fencedResult.ok,true);
assert.equal(fencedResult.value,'recuperado');


// Una respuesta vacía de DeepSeek se reintenta una vez sin obligar al usuario a empezar de nuevo.
let emptyRetryCalls=0;
const emptyThenOkFetch=async()=>{
 emptyRetryCalls++;
 const content=emptyRetryCalls===1?'':JSON.stringify({ok:true,recovered:true});
 return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'content-type':'application/json'}});
};
const recovered=await deepseek([{role:'user',content:'retry empty'}],{key:'test',fetcher:emptyThenOkFetch,retries:1,timeoutMs:1000});
assert.equal(recovered.recovered,true);
assert.equal(emptyRetryCalls,2);

const webFetch=async()=>new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
  {type:'web_search_result',title:'Figura Batman 24,99 €',url:'https://www.ebay.es/itm/123',cited_text:'Figura Batman 24,99 €'},
  {type:'web_search_result',title:'Figura Batman 30 €',url:'https://es.wallapop.com/item/batman-123',cited_text:'Figura Batman 30 €'}
]}]}),{status:200,headers:{'content-type':'application/json'}});
const webSources=await deepseekWebSearch('Batman',{key:'test',fetcher:webFetch});
assert.equal(webSources.length,2);
const publicListings=parsePublicListings(webSources);
assert.equal(publicListings[0].price,24.99);
assert.equal(publicListings[1].price,30);

// También aprovechamos precios públicos de tiendas que no son marketplaces conocidos.
const shopListings=parsePublicListings([{id:'shop-1',kind:'web',title:'Funko Pop Éomer #1982 - 29,95 €',url:'https://tienda-ejemplo.es/product/eomer-1982',snippet:'En stock · precio 29,95 €'}]);
assert.equal(shopListings.length,1);
assert.equal(shopListings[0].price,29.95);
assert.match(shopListings[0].condition,/Precio de tienda/i);

// PriceCharting/hobbyDB pueden publicar USD: se convierten a EUR solo con una tasa explícita.
const guideListings=parsePublicListings([{id:'guide-1',kind:'funko-specialist',title:'Éomer #1982 Funko POP Movies $20.00',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982',snippet:'CIB Price $20.00'}],{USD_EUR:0.85});
assert.equal(guideListings.length,1);
assert.equal(guideListings[0].price,17);
assert.equal(guideListings[0].currency,'EUR');
assert.equal(guideListings[0].sourceType,'guide');
assert.match(guideListings[0].condition,/Guía de valoración/i);


// API oficial PriceCharting: una coincidencia exacta con caja devuelve la guía CIB,
// convierte centavos USD a EUR y nunca expone el token en la URL pública guardada.
const pcToken='a'.repeat(40);
const pcFetch=async(input)=>{
  const url=new URL(String(input));
  assert.equal(url.hostname,'www.pricecharting.com');
  assert.equal(url.pathname,'/api/product');
  assert.equal(url.searchParams.get('t'),pcToken);
  return new Response(JSON.stringify({status:'success',id:'12345','product-name':'Eomer #1982','console-name':'Funko Pop Movies','loose-price':1399,'cib-price':2599,'new-price':3299}),{status:200,headers:{'content-type':'application/json'}});
};
const pcResult=await fetchPriceChartingGuide({title:'Funko Pop! Eomer #1982',type:'funko',line:'Pop! Movies',sku:'1982',hasBox:true},pcToken,pcFetch,.9);
assert.equal(pcResult.listings.length,1);
assert.equal(pcResult.listings[0].price,23.39);
assert.equal(pcResult.listings[0].currency,'EUR');
assert.equal(pcResult.listings[0].sourceType,'guide');
assert.doesNotMatch(pcResult.sources[0].url,/t=/);

// Con varias fotos: UNA sola llamada multimodal. La primera foto es principal y las demás complementarias.
let unifiedIdentifyCalls=0;
let unifiedImages=0;
const unifiedIdentifyFetch=async(_url,init)=>{
 unifiedIdentifyCalls++;
 const body=JSON.parse(init.body);
 assert.equal(body.thinking?.type,'disabled');
 assert.equal(body.reasoning_effort,undefined);
 unifiedImages=body.messages[1].content.filter(block=>block.type==='image_url').length;
 const result={title:'Funko Pop! Éomer #1982',type:'funko',franchise:'The Lord of the Rings',character:'Éomer',manufacturer:'Funko',line:'Pop! Movies',sku:'90310',confidence:.99,explanation:'Frontal como vista principal; trasera usada solo para la referencia'};
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'content-type':'application/json'}});
};
const mergedIdentification=await identify(['data:image/jpeg;base64,AAAA','data:image/jpeg;base64,BBBB','data:image/jpeg;base64,CCCC'],{key:'test',fetcher:unifiedIdentifyFetch});
assert.equal(unifiedIdentifyCalls,1);
assert.equal(unifiedImages,3);
assert.equal(mergedIdentification.title,'Funko Pop! Éomer #1982');
assert.equal(mergedIdentification.sku,'90310');
assert.equal(mergedIdentification.popNumber,'1982');
assert.equal(mergedIdentification.funkoCategory,'Movies');

const noSources=await research({confirmed:true,item:{title:'Batman #125',type:'comic'}},{key:'test',fetcher:fakeFetch});
assert.equal(noSources.sources.length,0);
assert.equal(noSources.warnings.length,1);
assert.equal(noSources.sold.available,false);

let fallbackChatCalls=0;
const fallbackFetch=async(url,init)=>{
  if(String(url).includes('/anthropic/v1/messages')){
    return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
      {type:'web_search_result',title:'Batman #125 comic 12,00 €',url:'https://www.ebay.es/itm/999',cited_text:'Batman #125 comic 12,00 €'}
    ]}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(String(url).includes('/chat/completions')){
    fallbackChatCalls++;
    return new Response(JSON.stringify({choices:[{message:{content:'esto no es json'}}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const fallbackResearch=await research({confirmed:true,item:{title:'Batman #125',type:'comic'}},{key:'test',fetcher:fallbackFetch});
assert.equal(fallbackChatCalls,0);
assert.equal(fallbackResearch.listings.length,1);
assert.equal(fallbackResearch.asking.count,1);
assert.match(fallbackResearch.summary,/Valoración calculada localmente|única identidad/i);

// La consulta REAL enviada al buscador de PriceCharting debe conservar nombre + número,
// incluso si popNumber no venía guardado pero sí aparece en el título.
let exactPcPrompts=[];
const exactPcQueryFetch=async(url,init)=>{
 if(String(url).includes('/anthropic/v1/messages')){
  const body=JSON.parse(init.body);
  exactPcPrompts.push(String(body.messages?.[0]?.content||''));
  const prompt=String(body.messages?.[0]?.content||'');
  if(prompt.includes('MODO PRICECHARTING')) return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[{type:'web_search_result',title:'Eomer #1982 Prices | Funko POP Movies',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982',cited_text:'Eomer #1982 · In Box $16.00'}]}]}),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[]}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(String(url).includes('frankfurter.dev'))return new Response(JSON.stringify({rate:.9}),{status:200,headers:{'content-type':'application/json'}});
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const exactPcQueryResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies'}},{key:'test',fetcher:exactPcQueryFetch});
assert.equal(exactPcQueryResearch.searchIdentity,'Éomer 1982');
const exactPcPrompt=exactPcPrompts.find(x=>x.includes('MODO PRICECHARTING'))||'';
assert.ok(exactPcPrompt,'No se ejecutó la llamada específica de PriceCharting');
assert.match(exactPcPrompt,/^Busca precios actuales para: Eomer 1982\./);
assert.match(exactPcPrompt,/NO puedes quitarlo ni buscar solo el nombre/);
assert.match(exactPcPrompt,/q=Eomer%201982/);
assert.equal(exactPcQueryResearch.asking.count,1);
assert.equal(exactPcQueryResearch.asking.median,14.4);
assert.equal(exactPcQueryResearch.comparables[0].url,'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982');

// Regresión realista: si DeepSeek devuelve primero una página genérica de PriceCharting
// y después la ficha exacta con precio, la ficha exacta debe ganar y producir valoración.
let realPcSearchCalls=0;
const realPcFetch=async(url,init)=>{
 if(String(url).includes('frankfurter.dev')){
  return new Response(JSON.stringify({rate:.9}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(String(url).includes('/anthropic/v1/messages')){
  realPcSearchCalls++;
  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
   {type:'web_search_result',title:'PriceCharting Search Products',url:'https://www.pricecharting.com/search-products?type=prices&q=Eomer+1982',cited_text:'Search Funko prices'},
   {type:'web_search_result',title:'Eomer #1982 Prices | Funko POP Movies',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982',cited_text:'Full Price Guide: Eomer #1982. Out of Box $11.05 · In Box $16.00 · New $18.75'}
  ]}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const realPcResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies',popNumber:'1982',hasBox:true}},{key:'test',fetcher:realPcFetch});
assert.equal(realPcSearchCalls,1);
assert.equal(realPcResearch.searchIdentity,'Éomer 1982');
assert.equal(realPcResearch.sources[0].url,'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982');
assert.ok(realPcResearch.asking.median>0);
assert.ok(realPcResearch.comparables.length>0);

// Regresión: una respuesta JSON imperfecta del modelo no debe tumbar toda la investigación.

// Funko: la misma identidad corta debe mandar también en los filtros posteriores.
const funkoPriceFetch=async(url)=>{
  if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
    {type:'web_search_result',title:'Éomer Funko Pop #1982 - 29,95 €',url:'https://www.ebay.es/itm/eomer1982',cited_text:'Éomer Funko Pop #1982 29,95 €'}
  ]}]}),{status:200,headers:{'content-type':'application/json'}});
  return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const funkoResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies',popNumber:'1982',sku:'90310'}},{key:'test',fetcher:funkoPriceFetch});
assert.equal(funkoResearch.searchIdentity,'Éomer 1982');
assert.equal(funkoResearch.asking.count,1);
assert.equal(funkoResearch.asking.median,29.95);


// Regresión: las fotos se convierten a datos persistentes antes de pulsar Guardar.
const appSource=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const inventorySource=readFileSync(new URL('../src/lib/inventory.ts',import.meta.url),'utf8');
const aiCoreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');
assert.doesNotMatch(aiCoreSource,/eBay vendidos\/completados y tiendas públicas/);
assert.match(aiCoreSource,/contrasta únicamente con StockX y eBay vendidos\/completados/);
assert.match(appSource,/initialPhotos\.slice\(0, maxCloudPhotos\(\)\)\.map\(\(file\) => uploadItemImage\(file\)\)/);
assert.match(appSource,/Escanear código/);
assert.match(appSource,/Mejorar con IA/);
assert.match(appSource,/Número Pop/);
assert.match(appSource,/Categoría Funko/);
assert.ok(appSource.includes('Variante / especial'));
assert.match(appSource,/prepared\.map\(\(file\) => uploadItemImage\(file\)\)/);
assert.match(appSource,/imageUrls: \[\.\.\.\(current\.imageUrls \|\| \[\]\), \.\.\.urls\]\.slice\(0, limit\)/);
assert.doesNotMatch(appSource,/const \[photos, setPhotos\]/);
assert.match(appSource,/const \[pendingPhotos, setPendingPhotos\] = useState<File\[]>\(initialPhotos\)/);
assert.match(appSource,/pendingPhotos\.slice\(0, room\)\.map\(\(file\) => uploadItemImage\(file\)\)/);
assert.match(appSource,/disabled=\{busy \|\| photoPreparing \|\| !draft\.title\.trim\(\)\}/);
assert.doesNotMatch(inventorySource,/getDocFromServer/);

assert.doesNotMatch(appSource,/PPG \/ hobbyDB/);
assert.match(appSource,/País \/ mercado de la edición/);
assert.match(appSource,/Idioma de la edición/);
assert.match(appSource,/setTab\('home'\)/);
assert.match(appSource,/valuation-highlight/);
assert.match(appSource,/Analizar artículo/);
assert.doesNotMatch(appSource,/Confirmar e investigar|Actualizar investigación/);
const directAiSource=readFileSync(new URL('../src/lib/direct-ai.ts',import.meta.url),'utf8');
assert.match(directAiSource,/priceChartingToken/);
assert.match(directAiSource,/settings', 'pricecharting'/);
const coreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');
assert.match(coreSource,/PriceCharting/);
assert.match(coreSource,/frankfurter\.dev\/v2\/providers\/ecb\/rate\/usd\/eur/);



// Regresión: PriceCharting es prioritario y los botones del formulario conservan su estilo original.
const currentCoreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');
const currentStylesSource=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
assert.match(currentCoreSource,/PriceCharting va primero/);

assert.doesNotMatch(currentCoreSource,/reasoning:\{effort:'none'\}/);
assert.match(currentCoreSource,/limitPricingSources/);
assert.match(currentCoreSource,/thinking:\{type:'disabled'\}/);
assert.match(currentCoreSource,/sourceLooksBroken/);
assert.doesNotMatch(currentCoreSource,/ppg:'https:\/\/www\.hobbydb\.com/);
assert.doesNotMatch(currentStylesSource,/\.sheet-foot \.primary,.sheet-foot \.secondary,.sheet-foot \.danger\{min-height:54px/);

console.log('core tests ok');

