import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { identificationSchema, summarizeListings, safeUrl, deepseek, deepseekWebSearch, parsePublicListings, research, identify } from '../server/core.mjs';

const identification = identificationSchema.parse({title:'Batman #125',type:'comic',confidence:.8,explanation:'Texto visible'});
assert.equal(identification.franchise,'');
assert.equal(safeUrl('javascript:alert(1)'),null);

const market = summarizeListings([
  {price:10,currency:'EUR',shipping:2},
  {price:20,currency:'EUR',shipping:0}
]);
assert.deepEqual(
  {kind:market.kind,currency:market.currency,count:market.count,min:market.min,max:market.max,median:market.median},
  {kind:'asking',currency:'EUR',count:2,min:12,max:20,median:16}
);
assert.match(market.label,/no ventas cerradas/i);

const fakeFetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"summary":"Ficha contrastada","facts":[],"comparableIds":[]}'}}]}),{status:200,headers:{'content-type':'application/json'}});
assert.equal((await deepseek([{role:'user',content:'test'}],{key:'test',fetcher:fakeFetch})).summary,'Ficha contrastada');

const fencedFetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'```json\n{"ok":true,"value":"recuperado"}\n```'}}]}),{status:200,headers:{'content-type':'application/json'}});
const fencedResult=await deepseek([{role:'user',content:'test fenced'}],{key:'test',fetcher:fencedFetch});
assert.equal(fencedResult.ok,true);
assert.equal(fencedResult.value,'recuperado');

const webFetch=async()=>new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
  {type:'web_search_result',title:'Figura Batman 24,99 €',url:'https://www.ebay.es/itm/123',cited_text:'Figura Batman 24,99 €'},
  {type:'web_search_result',title:'Figura Batman 30 €',url:'https://es.wallapop.com/item/batman-123',cited_text:'Figura Batman 30 €'}
]}]}),{status:200,headers:{'content-type':'application/json'}});
const webSources=await deepseekWebSearch('Batman',{key:'test',fetcher:webFetch});
assert.equal(webSources.length,2);
const publicListings=parsePublicListings(webSources);
assert.equal(publicListings[0].price,24.99);
assert.equal(publicListings[1].price,30);

// Con varias fotos: una consulta visual por foto + una fusión textual final.
const identifyBodies=[];
const partials=[
  {title:'Funko Pop! Éomer #1982',type:'funko',franchise:'The Lord of the Rings',character:'Éomer',manufacturer:'Funko',line:'Pop! Movies',sku:'1982',confidence:0.96,explanation:'Frontal y número visibles'},
  {title:'Éomer',type:'funko',franchise:'The Lord of the Rings',character:'Éomer',manufacturer:'Funko',line:'Pop! Movies',sku:'1982',confidence:0.90,explanation:'Trasera y colección visibles'},
  {title:'Funko Pop! Éomer #1982',type:'funko',franchise:'The Lord of the Rings',character:'Éomer',manufacturer:'Funko',line:'Pop! Movies',sku:'1982',confidence:0.98,explanation:'Etiqueta inferior y código visibles'}
];
let visualCall=0;
const multiImageFetch=async(_url,init)=>{
  const body=JSON.parse(init.body); identifyBodies.push(body);
  const hasImage=body.messages?.some(message=>Array.isArray(message.content)&&message.content.some(block=>block.type==='image_url'));
  const result=hasImage ? partials[visualCall++] : {...partials[0],confidence:0.99,explanation:'Las tres vistas coinciden en personaje, línea y número 1982'};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'content-type':'application/json'}});
};
const mergedIdentification=await identify(['data:image/jpeg;base64,AAAA','data:image/jpeg;base64,BBBB','data:image/jpeg;base64,CCCC'],{key:'test',fetcher:multiImageFetch});
assert.equal(identifyBodies.length,4);
assert.equal(identifyBodies.slice(0,3).every(body=>body.messages[1].content.filter(block=>block.type==='image_url').length===1),true);
assert.equal(Array.isArray(identifyBodies[3].messages[1].content),false);
assert.equal(mergedIdentification.title,'Funko Pop! Éomer #1982');
assert.equal(mergedIdentification.sku,'1982');

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
assert.equal(fallbackChatCalls,1);
assert.equal(fallbackResearch.listings.length,1);
assert.equal(fallbackResearch.asking.count,1);
assert.match(fallbackResearch.summary,/conserva los datos verificables/i);
assert.ok(fallbackResearch.warnings.some(x=>/Resumen IA/i.test(x)));

// Regresión: una respuesta JSON imperfecta del modelo no debe tumbar toda la investigación.

// Regresión: las fotos se convierten a datos persistentes antes de pulsar Guardar.
const appSource=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const inventorySource=readFileSync(new URL('../src/lib/inventory.ts',import.meta.url),'utf8');
assert.match(appSource,/initialPhotos\.slice\(0, maxCloudPhotos\(\)\)\.map\(\(file\) => uploadItemImage\(file\)\)/);
assert.match(appSource,/prepared\.map\(\(file\) => uploadItemImage\(file\)\)/);
assert.match(appSource,/imageUrls: \[\.\.\.\(current\.imageUrls \|\| \[\]\), \.\.\.urls\]\.slice\(0, limit\)/);
assert.doesNotMatch(appSource,/const \[photos, setPhotos\]/);
assert.match(appSource,/const \[pendingPhotos, setPendingPhotos\] = useState<File\[]>\(initialPhotos\)/);
assert.match(appSource,/pendingPhotos\.slice\(0, room\)\.map\(\(file\) => uploadItemImage\(file\)\)/);
assert.match(appSource,/disabled=\{busy \|\| photoPreparing \|\| !draft\.title\.trim\(\)\}/);
assert.doesNotMatch(inventorySource,/getDocFromServer/);


console.log('core tests ok');