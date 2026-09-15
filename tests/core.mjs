import assert from 'node:assert/strict';
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

const webFetch=async()=>new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
  {type:'web_search_result',title:'Figura Batman 24,99 €',url:'https://www.ebay.es/itm/123',cited_text:'Figura Batman 24,99 €'},
  {type:'web_search_result',title:'Figura Batman 30 €',url:'https://es.wallapop.com/item/batman-123',cited_text:'Figura Batman 30 €'}
]}]}),{status:200,headers:{'content-type':'application/json'}});
const webSources=await deepseekWebSearch('Batman',{key:'test',fetcher:webFetch});
assert.equal(webSources.length,2);
const publicListings=parsePublicListings(webSources);
assert.equal(publicListings[0].price,24.99);
assert.equal(publicListings[1].price,30);

let identifyBody;
const multiImageFetch=async(_url,init)=>{
  identifyBody=JSON.parse(init.body);
  return new Response(JSON.stringify({choices:[{message:{content:'{"title":"Pikachu","type":"figure","confidence":0.9,"explanation":"Vistas combinadas"}'}}]}),{status:200,headers:{'content-type':'application/json'}});
};
await identify(['data:image/jpeg;base64,AAAA','data:image/jpeg;base64,BBBB','data:image/jpeg;base64,CCCC'],{key:'test',fetcher:multiImageFetch});
const imageBlocks=identifyBody.messages[1].content.filter(block=>block.type==='image_url');
assert.equal(imageBlocks.length,3);

const noSources=await research({confirmed:true,item:{title:'Batman #125',type:'comic'}},{key:'test',fetcher:fakeFetch});
assert.equal(noSources.sources.length,0);
assert.equal(noSources.warnings.length,1);
assert.equal(noSources.sold.available,false);

console.log('core tests ok');
