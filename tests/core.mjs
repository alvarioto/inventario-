import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { identificationSchema, summarizeListings, safeUrl, deepseek, deepseekWebSearch, parsePublicListings, research, identify, isGenericProductTitle, buildResearchIdentity } from '../server/core.mjs';

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

const soldPriority=summarizeListings([
  {price:31.82,currency:'EUR',sourceType:'guide',originalPrice:37,originalCurrency:'USD'},
  {price:25,currency:'EUR',sourceType:'sold'},
  {price:27,currency:'EUR',sourceType:'sold'}
]);
assert.equal(soldPriority.kind,'sold');
assert.equal(soldPriority.median,26);

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
assert.equal(mergedIdentification.funkoCategory,'Pop! Regular');

// Regresión: el arte "MARVEL COMICS / X-MEN" del cartón no puede convertir
// una figura Hasbro/Marvel Legends en un cómic.
const weaponXVisionFetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
 title:'Marvel Legends X-Men Wolverine (Weapon X)',
 type:'comic',
 franchise:'Marvel / X-Men',
 character:'Wolverine',
 manufacturer:'Hasbro',
 line:'Marvel Legends',
 sku:'G0644',
 confidence:.96,
 explanation:'Figura articulada de Wolverine dentro de un blister con manos, cabeza y accesorios intercambiables; el cartón lleva el logo MARVEL COMICS.',
 tags:['action figure','blister card']
})}}]}),{status:200,headers:{'content-type':'application/json'}});
const weaponXIdentification=await identify('data:image/jpeg;base64,WEAPONX',{key:'test',fetcher:weaponXVisionFetch});
assert.equal(weaponXIdentification.type,'figure');
assert.equal(weaponXIdentification.manufacturer,'Hasbro');
assert.equal(weaponXIdentification.sku,'G0644');

// La naturaleza física manda para todas las familias.
const physicalCases=[
 {input:{title:'Charizard promo art',type:'comic',manufacturer:'The Pokémon Company',setName:'Scarlet & Violet',cardNumber:'199/165',explanation:'Trading card inside a PSA slab',graded:true},expected:'card'},
 {input:{title:'Batman artwork',type:'comic',manufacturer:'McFarlane Toys',line:'DC Multiverse',explanation:'Articulated action figure in blister packaging'},expected:'figure'},
 {input:{title:'The Last of Us cover art',type:'comic',platform:'PlayStation 5',explanation:'PS5 video game disc in plastic case'},expected:'game'},
 {input:{title:'Grogu',type:'figure',manufacturer:'LEGO',sku:'75318',explanation:'LEGO brick construction set'},expected:'lego'},
 {input:{title:'Pikachu',type:'figure',explanation:'Soft stuffed plush toy made of fabric'},expected:'plush'},
 {input:{title:'Iron Man helmet',type:'figure',explanation:'1:1 scale wearable prop replica helmet'},expected:'replica'}
];
for(const row of physicalCases){const fetcher=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...row.input,confidence:.95})}}]}),{status:200,headers:{'content-type':'application/json'}});const identified=await identify('data:image/jpeg;base64,PHYSICAL',{key:'test',fetcher});assert.equal(identified.type,row.expected);}



// Si la visión describe la pegatina CHASE pero omite el campo, se recupera sin
// permitir que la búsqueda de precios caiga en la variante Classic.
const chaseVisionFetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
 title:'Funko Pop! 101 Dalmatians Cruella De Vil #1663',type:'funko',character:'Cruella De Vil',manufacturer:'Funko',line:'Pop! Disney',popNumber:'1663',funkoVariant:'',confidence:.98,explanation:'Pegatina amarilla CHASE visible en el frontal',tags:[]
})}}]}),{status:200,headers:{'content-type':'application/json'}});
const chaseIdentification=await identify('data:image/jpeg;base64,CHASEPHOTO',{key:'test',fetcher:chaseVisionFetch});
assert.equal(chaseIdentification.funkoVariant,'Chase');
assert.equal(buildResearchIdentity(chaseIdentification),'Cruella De Vil 1663 Chase');

// Formato/línea y variante son dimensiones distintas. Kinder NO es una variante.
const kinderMax={title:'Max Mayfield',type:'funko',character:'Max Mayfield',manufacturer:'Funko',line:'Stranger Things',funkoCategory:'Kinder / Promotional',funkoVariant:'',popNumber:'',sku:'VC265'};
assert.equal(buildResearchIdentity(kinderMax),'Max Mayfield Kinder');
assert.equal(buildResearchIdentity({...kinderMax,funkoVariant:'Upside Down'}),'Max Mayfield Kinder Upside Down');

// Figuras físicas: la búsqueda debe usar fabricante/línea/SKU y no dejar que
// el arte "MARVEL COMICS" arrastre los resultados hacia publicaciones.
const weaponXFigure={
 title:'Marvel Comics X-Men Weapon X Wolverine (Weapon X)',
 type:'figure',manufacturer:'Hasbro',line:'Marvel Legends',character:'Wolverine',sku:'G0644'
};
assert.equal(buildResearchIdentity(weaponXFigure),'Hasbro Marvel Legends X-Men Weapon X Wolverine (Weapon X) G0644');

// Las tiendas regionales ajenas (p.ej. Amazon Brasil) no pueden contaminar la tasación.
const genericCurrencyFetch=async(url,init)=>{
 if(String(url).includes('frankfurter.app'))return new Response(JSON.stringify({rates:{EUR:.9,GBP:.8}}),{status:200,headers:{'content-type':'application/json'}});
 if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
  {type:'web_search_result',title:'Hasbro Marvel Legends Wolverine Weapon X G0644 49,90 EUR',url:'https://www.amazon.com.br/dp/WRONGREGION',cited_text:'G0644 49,90 EUR'},
  {type:'web_search_result',title:'Hasbro Marvel Legends Wolverine Weapon X G0644 39,90 EUR',url:'https://www.ebay.es/itm/G0644',cited_text:'Hasbro Marvel Legends G0644 39,90 EUR'}
 ]}]}),{status:200,headers:{'content-type':'application/json'}});
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const genericCurrencyResearch=await research({confirmed:true,item:{...weaponXFigure,franchise:'Marvel',edition:'',issueNumber:'',volume:'',setName:'',cardNumber:'',rarity:'',platform:'',language:'',country:'',gradingCompany:'',grade:'',isbn:'',barcode:'',popNumber:'',funkoCategory:'',funkoVariant:''}},{key:'test',fetcher:genericCurrencyFetch});
assert.ok(!genericCurrencyResearch.sources.some(x=>x.url.includes('amazon.com.br')));
assert.equal(genericCurrencyResearch.exchangeRates.USD,1);
assert.equal(genericCurrencyResearch.exchangeRates.EUR,.9);




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
assert.match(fallbackResearch.summary,/Referencia orientativa calculada|única identidad/i);

// Funko: PriceCharting es la referencia principal; eBay/StockX son orientación.
let pricePrompts=[];
const priceMarketFetch=async(url,init)=>{
 if(String(url).includes('frankfurter.dev'))return new Response(JSON.stringify({rate:.9}),{status:200,headers:{'content-type':'application/json'}});
 if(String(url).includes('/anthropic/v1/messages')){
  const prompt=String(JSON.parse(init.body).messages?.[0]?.content||'');
  pricePrompts.push(prompt);
  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
   {type:'web_search_result',title:'Eomer #1982 Prices | Funko POP Movies',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982',cited_text:'Full Price Guide: Eomer #1982. Out of Box $15.00. In Box $22.00. New $25.00.'},
   {type:'web_search_result',title:'Funko Pop Éomer #1982 - 29,95 EUR',url:'https://www.ebay.es/itm/eomer1982',cited_text:'Éomer #1982 · 29,95 EUR'},
   {type:'web_search_result',title:'Funko Pop Eomer 1982',url:'https://stockx.com/funko-pop-eomer-1982',cited_text:'Eomer #1982'}
  ]}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(String(url).includes('frankfurter.app'))return new Response(JSON.stringify({rates:{EUR:.9,GBP:.8}}),{status:200,headers:{'content-type':'application/json'}});
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const priceResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies',popNumber:'1982',hasBox:true}},{key:'test',fetcher:priceMarketFetch});
assert.equal(pricePrompts.length,1);
assert.equal(priceResearch.searchIdentity,'Éomer 1982');
assert.match(pricePrompts[0],/PriceCharting/i);
assert.match(pricePrompts[0],/Out of Box/i);
assert.match(pricePrompts[0],/In Box/i);
assert.match(pricePrompts[0],/New/i);
assert.equal(priceResearch.asking.kind,'guide');
assert.ok(priceResearch.asking.median>0);
assert.ok(priceResearch.sources.some(source=>source.url.includes('pricecharting.com/game/')));
assert.ok(priceResearch.comparables.some(row=>row.url.includes('pricecharting.com/game/')));
assert.match(priceResearch.links.priceCharting,/pricecharting\.com\/search-products/);
assert.match(priceResearch.links.priceCharting,/type=prices/);

// Dos tarjetas con el mismo personaje/número: la variante de la foto manda.
const chaseFetch=async(url,init)=>{
 if(String(url).includes('/anthropic/v1/messages')){
  const prompt=String(JSON.parse(init.body).messages?.[0]?.content||'');
  assert.match(prompt,/PriceCharting/i);
  assert.match(prompt,/descarta Classic\/Regular\/Standard/i);
  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
   {type:'web_search_result',title:'Cruella De Vil [Chase] #1663 Prices | Funko POP Disney',url:'https://www.pricecharting.com/game/funko-pop-disney/cruella-de-vil-chase-1663',cited_text:'Cruella De Vil [Chase] #1663 Out of Box $9.04 In Box $12.00 New $15.06'},
   {type:'web_search_result',title:'Cruella De Vil #1663 Prices | Funko POP Disney',url:'https://www.pricecharting.com/game/funko-pop-disney/cruella-de-vil-1663',cited_text:'Cruella De Vil #1663 Out of Box $5.00 In Box $7.00 New $9.00'}
  ]}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(String(url).includes('frankfurter'))return new Response(JSON.stringify(String(url).includes('latest')?{rates:{EUR:.9}}:{rate:.9}),{status:200,headers:{'content-type':'application/json'}});
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const chaseResearch=await research({confirmed:true,item:{title:'Funko Pop! Disney Cruella De Vil #1663 Chase',type:'funko',manufacturer:'Funko',character:'Cruella De Vil',line:'Pop! Disney',popNumber:'1663',funkoVariant:'Chase',hasBox:true}},{key:'test',fetcher:chaseFetch});
assert.equal(chaseResearch.searchIdentity,'Cruella De Vil 1663 Chase');
assert.ok(chaseResearch.sources.some(source=>source.url.includes('cruella-de-vil-chase-1663')));
assert.ok(!chaseResearch.sources.some(source=>source.url.endsWith('cruella-de-vil-1663')));


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
assert.ok(funkoResearch.asking.median>0);
assert.ok(funkoResearch.comparables.some(row=>row.url.includes('ebay.es')));


// Regresión: las fotos se convierten a datos persistentes antes de pulsar Guardar.
const appSource=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const inventorySource=readFileSync(new URL('../src/lib/inventory.ts',import.meta.url),'utf8');
const aiCoreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');
assert.doesNotMatch(aiCoreSource,/eBay vendidos\/completados y tiendas públicas/);
assert.match(aiCoreSource,/PriceCharting es la referencia principal/);
assert.match(appSource,/initialPhotos\.slice\(0, maxCloudPhotos\(\)\)\.map\(\(file\) => uploadItemImage\(file\)\)/);
assert.match(appSource,/Leer código de barras/);
assert.match(appSource,/lector es propio de FrikiVault/i);
assert.match(appSource,/Coleka · catálogo general/);
assert.match(appSource,/LegendsVerse · Marvel Legends/);
assert.match(appSource,/FigureRealm · antiguas\/variantes/);
assert.match(appSource,/Mejorar con IA/);
assert.match(appSource,/Número Pop/);
assert.match(appSource,/Formato \/ línea Funko/);
assert.ok(appSource.includes('Variante / acabado'));
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
assert.match(appSource,/Referencia principal/);
assert.match(appSource,/Valor principal · ventas cerradas/);
assert.doesNotMatch(appSource,/catalogSourceLinks/);
assert.doesNotMatch(appSource,/site:figurerealm\.com|site:figurestash\.com|site:coleka\.com/);
assert.match(appSource,/Otras referencias orientativas/);
assert.match(appSource,/>PriceCharting<\/a>/);
assert.match(appSource,/Analizar artículo/);
assert.doesNotMatch(appSource,/Confirmar e investigar|Actualizar investigación/);
const directAiSource=readFileSync(new URL('../src/lib/direct-ai.ts',import.meta.url),'utf8');
const coreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');
assert.doesNotMatch(directAiSource,/pricecharting/i);
assert.match(coreSource,/pricecharting\.com\/search-products/);
assert.match(coreSource,/frankfurter\.dev\/v2\/providers\/ecb\/rate\/usd\/eur/);



// Regresión: las fuentes de mercado y los botones conservan su estilo original.
const currentCoreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');
const currentStylesSource=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
assert.match(currentCoreSource,/PriceCharting es la referencia principal/);

assert.doesNotMatch(currentCoreSource,/reasoning:\{effort:'none'\}/);
assert.match(currentCoreSource,/limitPricingSources/);
assert.match(currentCoreSource,/thinking:\{type:'disabled'\}/);
assert.match(currentCoreSource,/sourceLooksBroken/);
assert.doesNotMatch(currentCoreSource,/hobbydb|\bppg\b/i);
assert.doesNotMatch(currentStylesSource,/\.sheet-foot \.primary,.sheet-foot \.secondary,.sheet-foot \.danger\{min-height:54px/);

// Sin un precio público exacto no se inventa un valor principal.
let orientativeAiCalls=0;
const noPriceFunkoFetch=async(url,init)=>{
 if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[]}]}),{status:200,headers:{'content-type':'application/json'}});
 if(String(url).includes('/chat/completions')){orientativeAiCalls++;return new Response(JSON.stringify({choices:[{message:{content:'{"median":17.5,"min":14,"max":21,"reason":"estimación conservadora"}'}}]}),{status:200,headers:{'content-type':'application/json'}});}
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const orientativeFunko=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',hasBox:true}},{key:'test',fetcher:noPriceFunkoFetch});
assert.equal(orientativeAiCalls,0);
assert.equal(orientativeFunko.asking.median,null);
assert.match(orientativeFunko.warnings.join(' '),/No se encontró un precio visible/i);

// Incluso si también falla la estimación IA, la ficha conserva un valor base orientativo.
const totalFailureFetch=async(url)=>{
 if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[]}]}),{status:200,headers:{'content-type':'application/json'}});
 if(String(url).includes('/chat/completions'))return new Response('error',{status:500});
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const guaranteedFunko=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',hasBox:true}},{key:'test',fetcher:totalFailureFetch});
assert.equal(guaranteedFunko.asking.median,null);

console.log('core tests ok');

assert.match(readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8'),/pricecharting\.com\/search-products/);
assert.doesNotMatch(readFileSync(new URL('../src/lib/direct-ai.ts',import.meta.url),'utf8'),/pricecharting/i);
assert.doesNotMatch(readFileSync(new URL('../src/components/DirectAiSettings.tsx',import.meta.url),'utf8'),/pricecharting/i);
