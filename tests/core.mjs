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

const guidePriority=summarizeListings([
  {price:31.82,currency:'EUR',sourceType:'guide',originalPrice:37,originalCurrency:'USD'},
  {price:48,currency:'EUR',sourceType:'market',originalPrice:55.8,originalCurrency:'USD'}
]);
assert.equal(guidePriority.kind,'guide');
assert.equal(guidePriority.median,31.82);
assert.equal(guidePriority.originalMedian,37);
assert.equal(guidePriority.originalCurrency,'USD');

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

// PriceCharting realista: el resultado web puede traer URL/título sin precio y dejar
// el importe únicamente en el texto final del modelo. Ese precio no puede perderse.
let pcPrompt='';
const pcTextOnlyFetch=async(_url,init)=>{
 pcPrompt=String(JSON.parse(init.body).messages?.[0]?.content||'');
 return new Response(JSON.stringify({content:[
  {type:'web_search_tool_result',content:[{type:'web_search_result',title:'Eomer #1982 Prices | Funko POP Movies',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982'}]},
  {type:'text',text:'PriceCharting · Eomer #1982 · Out of Box $11.05 · In Box $16.00 · New $18.75',citations:[]}
 ]}),{status:200,headers:{'content-type':'application/json'}});
};
const pcTextOnlySources=await deepseekWebSearch('Eomer 1982',{key:'test',fetcher:pcTextOnlyFetch,searchMode:'pricecharting'});
assert.equal(pcTextOnlySources.length,1);
assert.match(pcTextOnlySources[0].description,/\$16\.00/);
assert.match(pcPrompt,/Busca EXCLUSIVAMENTE en PriceCharting/);
assert.match(pcPrompt,/Eomer 1982/);
const pcTextOnlyListings=parsePublicListings(pcTextOnlySources.map(source=>({...source,snippet:source.description||''})),{USD_EUR:.9});
assert.equal(pcTextOnlyListings.length,3);
assert.equal(pcTextOnlyListings[1].price,14.4);

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

// Si la visión describe la pegatina CHASE pero omite el campo, se recupera sin
// permitir que la búsqueda de precios caiga en la variante Classic.
const chaseVisionFetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
 title:'Funko Pop! 101 Dalmatians Cruella De Vil #1663',type:'funko',character:'Cruella De Vil',manufacturer:'Funko',line:'Pop! Disney',popNumber:'1663',funkoVariant:'',confidence:.98,explanation:'Pegatina amarilla CHASE visible en el frontal',tags:[]
})}}]}),{status:200,headers:{'content-type':'application/json'}});
const chaseIdentification=await identify('data:image/jpeg;base64,CHASEPHOTO',{key:'test',fetcher:chaseVisionFetch});
assert.equal(chaseIdentification.funkoVariant,'Chase');
assert.equal(buildResearchIdentity(chaseIdentification),'Cruella De Vil 1663 Chase');

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

// Funko: una sola búsqueda usa hobbyDB como guía y eBay/StockX como respaldo de precio.
let hobbyPrompts=[];
const hobbyMarketFetch=async(url,init)=>{
 if(String(url).includes('frankfurter.dev'))return new Response(JSON.stringify({rate:.9}),{status:200,headers:{'content-type':'application/json'}});
 if(String(url).includes('/anthropic/v1/messages')){
  const prompt=String(JSON.parse(init.body).messages?.[0]?.content||'');
  hobbyPrompts.push(prompt);
  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
   {type:'web_search_result',title:'Éomer | Statues & Busts | hobbyDB',url:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/eomer-bust',cited_text:'Type: Statues & Busts Brand: Weta Workshop Reference #: 1982 Éomer'},
   {type:'web_search_result',title:'Éomer | Art Toys | hobbyDB',url:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/eomer-art-toys',cited_text:'Type: Art Toys Brand: Funko Series: Pop! Movies Reference #: 1982 Related Subjects: The Lord of the Rings Éomer'},
   {type:'web_search_result',title:'Funko Pop Éomer #1982 - 29,95 EUR',url:'https://www.ebay.es/itm/eomer1982',cited_text:'Éomer #1982 · 29,95 EUR'},
   {type:'web_search_result',title:'Funko Pop Eomer 1982',url:'https://stockx.com/funko-pop-eomer-1982',cited_text:'Eomer #1982'}
  ]}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const hobbyResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies',popNumber:'1982',hasBox:true}},{key:'test',fetcher:hobbyMarketFetch,priceChartingToken:'a'.repeat(40)});
assert.equal(hobbyPrompts.length,1);
assert.equal(hobbyResearch.searchIdentity,'Éomer 1982');
assert.ok(hobbyPrompts[0].includes('hobbyDB/Pop Price Guide'));
assert.match(hobbyPrompts[0],/Eomer 1982/);
assert.ok(hobbyResearch.asking.median>0);
assert.equal(hobbyResearch.asking.median,29.95);
assert.ok(hobbyResearch.sources.some(source=>source.url.includes('hobbydb.com')));
assert.equal(hobbyResearch.sources.filter(source=>source.url.includes('hobbydb.com')).length,1);
assert.ok(hobbyResearch.sources.some(source=>source.url.includes('eomer-art-toys')));
assert.ok(!hobbyResearch.sources.some(source=>source.url.includes('eomer-bust')));
assert.match(hobbyPrompts[0],/Brand: Funko/);
assert.match(hobbyPrompts[0],/Reference #/);
assert.ok(hobbyResearch.comparables.some(row=>row.url.includes('ebay.es')));
assert.match(hobbyResearch.links.ppg,/hobbydb\.com/);
assert.match(hobbyResearch.links.ppg,/\?q=/);
assert.equal(hobbyResearch.links.priceCharting,undefined);

// Dos tarjetas con el mismo personaje/número: la variante de la foto manda.
const chaseFetch=async(url,init)=>{
 if(String(url).includes('/anthropic/v1/messages')){
  const prompt=String(JSON.parse(init.body).messages?.[0]?.content||'');
  assert.match(prompt,/See Value/);
  assert.match(prompt,/descartar Classic\/Regular\/Standard/);
  assert.match(prompt,/Click to See Estimated Value and Historical Price Points/);
  assert.match(prompt,/NO confundas ese valor con un anuncio de la sección "For Sale or Trade"/);
  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
   {type:'web_search_result',title:'Cruella De Vil Chase | Art Toys | hobbyDB',url:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/cruella-de-vil-chase',cited_text:'Type: Art Toys Brand: Funko Series: Pop! Disney Reference #: 1663 Variant: Chase Cruella De Vil'},
   {type:'web_search_result',title:'Cruella De Vil Classic | Art Toys | hobbyDB',url:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/cruella-de-vil-classic',cited_text:'Type: Art Toys Brand: Funko Series: Pop! Disney Reference #: 1663 Variant: Classic Cruella De Vil'}
  ]}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const chaseResearch=await research({confirmed:true,item:{title:'Funko Pop! Disney Cruella De Vil #1663 Chase',type:'funko',manufacturer:'Funko',character:'Cruella De Vil',line:'Pop! Disney',popNumber:'1663',funkoVariant:'Chase',hasBox:true}},{key:'test',fetcher:chaseFetch});
assert.equal(chaseResearch.searchIdentity,'Cruella De Vil 1663 Chase');
assert.ok(chaseResearch.sources.some(source=>source.url.endsWith('cruella-de-vil-chase')));
assert.ok(!chaseResearch.sources.some(source=>source.url.endsWith('cruella-de-vil-classic')));

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
assert.ok(aiCoreSource.includes('hobbyDB/Pop Price Guide'));
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
assert.ok(currentCoreSource.includes('hobbyDB/Pop Price Guide'));

assert.doesNotMatch(currentCoreSource,/reasoning:\{effort:'none'\}/);
assert.match(currentCoreSource,/limitPricingSources/);
assert.match(currentCoreSource,/thinking:\{type:'disabled'\}/);
assert.match(currentCoreSource,/sourceLooksBroken/);
assert.ok(currentCoreSource.includes("ppg:'https://www.hobbydb.com"));
assert.doesNotMatch(currentStylesSource,/\.sheet-foot \.primary,.sheet-foot \.secondary,.sheet-foot \.danger\{min-height:54px/);

// Un Funko debe terminar SIEMPRE con un valor visible aunque las fuentes públicas no devuelvan importe legible.
let orientativeAiCalls=0;
const noPriceFunkoFetch=async(url,init)=>{
 if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[]}]}),{status:200,headers:{'content-type':'application/json'}});
 if(String(url).includes('/chat/completions')){orientativeAiCalls++;return new Response(JSON.stringify({choices:[{message:{content:'{"median":17.5,"min":14,"max":21,"reason":"estimación conservadora"}'}}]}),{status:200,headers:{'content-type':'application/json'}});}
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const orientativeFunko=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',hasBox:true}},{key:'test',fetcher:noPriceFunkoFetch});
assert.equal(orientativeAiCalls,1);
assert.equal(orientativeFunko.asking.median,17.5);
assert.match(orientativeFunko.summary,/Estimación orientativa/i);
assert.match(orientativeFunko.comparables[0].url,/hobbydb\.com/);

// Incluso si también falla la estimación IA, la ficha conserva un valor base orientativo.
const totalFailureFetch=async(url)=>{
 if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[]}]}),{status:200,headers:{'content-type':'application/json'}});
 if(String(url).includes('/chat/completions'))return new Response('error',{status:500});
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const guaranteedFunko=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',hasBox:true}},{key:'test',fetcher:totalFailureFetch});
assert.equal(guaranteedFunko.asking.median,15);
assert.ok(guaranteedFunko.asking.median>0);
assert.match(guaranteedFunko.summary,/Estimación orientativa/i);

console.log('core tests ok');
