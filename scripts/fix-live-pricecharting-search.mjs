import fs from 'node:fs';

const files=['src/lib/ai-core.mjs','server/core.mjs'];
for(const path of files){
  let s=fs.readFileSync(path,'utf8');

  const oldWeb=`function webSearchSources(response){
 const byUrl=new Map();
 const add=(entry={},context='')=>{
  const url=safeUrl(entry.url);
  if(!url)return;
  const current=byUrl.get(url)||{url,title:'Fuente web',description:''};
  current.title=String(entry.title||current.title).slice(0,300);
  const detail=[entry.cited_text,entry.description,context,entry.page_age]
   .filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
  if(detail)current.description=\`${'${current.description}'} ${'${detail}'}\`.trim().slice(0,2200);
  byUrl.set(url,current);
 };

 for(const block of Array.isArray(response?.content)?response.content:[]){
  if(block?.type==='web_search_tool_result'){
   const content=Array.isArray(block.content)?block.content:[];
   for(const result of content)if(result?.type==='web_search_result')add(result);
  }
  if(block?.type==='text'){
   const citations=Array.isArray(block.citations)?block.citations:[];
   // Si el bloque solo cita una página, el texto del propio bloque ayuda a conservar
   // el precio que DeepSeek acaba de leer de esa fuente.
   const context=citations.length===1?String(block.text||''):'';
   for(const citation of citations)add(citation,context);
  }
 }
 return keepUsableSources([...byUrl.values()]);
}`;

  const newWeb=`function webSearchSources(response,{attachAllText=false}={}){
 const byUrl=new Map();
 const answerText=[];
 const add=(entry={},context='')=>{
  const url=safeUrl(entry.url);
  if(!url)return;
  const current=byUrl.get(url)||{url,title:'Fuente web',description:''};
  current.title=String(entry.title||current.title).slice(0,300);
  const detail=[entry.cited_text,entry.description,context,entry.page_age]
   .filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
  if(detail)current.description=\`${'${current.description}'} ${'${detail}'}\`.trim().slice(0,2200);
  byUrl.set(url,current);
 };

 for(const block of Array.isArray(response?.content)?response.content:[]){
  if(block?.type==='web_search_tool_result'){
   const content=Array.isArray(block.content)?block.content:[];
   for(const result of content)if(result?.type==='web_search_result')add(result);
  }
  if(block?.type==='text'){
   const text=String(block.text||'').replace(/\\s+/g,' ').trim();
   if(text)answerText.push(text);
   const citations=Array.isArray(block.citations)?block.citations:[];
   const context=citations.length===1?text:'';
   for(const citation of citations)add(citation,context);
  }
 }
 // DeepSeek puede devolver el precio en el texto final aunque el resultado web no
 // incluya cited_text (muy habitual con PriceCharting). En la consulta dedicada a
 // PriceCharting todo el texto pertenece al mismo dominio, así que lo conservamos
 // junto a los resultados para que el parser no pierda el importe real.
 if(attachAllText&&answerText.length){
  const context=answerText.join(' ').replace(/\\s+/g,' ').trim().slice(0,2200);
  for(const current of byUrl.values()){
   current.description=\`${'${current.description}'} ${'${context}'}\`.trim().slice(0,2200);
  }
 }
 return keepUsableSources([...byUrl.values()]);
}`;

  if(!s.includes(oldWeb)) throw new Error(`${path}: webSearchSources pattern not found`);
  s=s.replace(oldWeb,newWeb);

  const oldRequest=` const requestText=searchMode==='identity'
  ?\`Identifica el nombre comercial exacto de este artículo de colección a partir de sus códigos y referencias: ${'${query}'}. Busca coincidencias literales de SKU/Item No./EAN/UPC y fabricante. Necesito fuentes que permitan saber QUÉ PRODUCTO ES; todavía no busques una tasación. Si una página solo describe una caja, etiqueta o fotografía, no la uses como nombre del producto.${'${specialistInstruction}'}\`
  :\`Busca precios actuales para: ${'${exactQuery}'}. Consulta EXCLUSIVAMENTE estas tres fuentes: PriceCharting (pricecharting.com), StockX (stockx.com) y eBay (ebay.*). NO uses tiendas, blogs, hobbyDB, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio. Haz como máximo TRES búsquedas internas: una para PriceCharting, una para StockX y una para eBay. En cada sitio parte exactamente del nombre corto recibido; no lo amplíes con EAN, SKU, franquicia, año o edición salvo que ya formen parte literal de ese nombre. Devuelve cada precio en un párrafo separado con una única cita, para poder asociar importe y fuente sin ambigüedad. Para cada precio útil conserva importe, moneda, título y URL. En eBay distingue vendido/completado de anuncio activo solo si la página lo indica. Descarta lotes, accesorios, cajas vacías y variantes claramente distintas. Si una de las tres fuentes no tiene coincidencia, continúa con las otras dos sin buscar una cuarta.${'${forcedQueryInstruction}'}${'${priceChartingExact}'}${'${specialistInstruction}'}\`;`;

  const newRequest=` const requestText=searchMode==='identity'
  ?\`Identifica el nombre comercial exacto de este artículo de colección a partir de sus códigos y referencias: ${'${query}'}. Busca coincidencias literales de SKU/Item No./EAN/UPC y fabricante. Necesito fuentes que permitan saber QUÉ PRODUCTO ES; todavía no busques una tasación. Si una página solo describe una caja, etiqueta o fotografía, no la uses como nombre del producto.${'${specialistInstruction}'}\`
  :searchMode==='pricecharting'
   ?\`Busca EXCLUSIVAMENTE en PriceCharting el producto "${'${exactQuery}'}". Usa exactamente nombre + número tal como lo recibes y NO añadas "Funko Pop", EAN, SKU, franquicia ni otras palabras. Prioriza una ficha individual /game/funko-pop-* frente a una página de búsqueda. Devuelve en el texto final el título exacto, la URL exacta y todos los precios públicos visibles que encuentres (Out of Box/Loose, In Box/CIB y New), manteniendo el símbolo $ y los decimales. Si encuentras la ficha exacta, no busques ninguna otra web.${'${forcedQueryInstruction}'}${'${priceChartingExact}'}${'${specialistInstruction}'}\`
   :\`Busca precios actuales para: ${'${exactQuery}'}. Consulta EXCLUSIVAMENTE estas tres fuentes: PriceCharting (pricecharting.com), StockX (stockx.com) y eBay (ebay.*). NO uses tiendas, blogs, hobbyDB, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio. Haz como máximo TRES búsquedas internas: una para PriceCharting, una para StockX y una para eBay. En cada sitio parte exactamente del nombre corto recibido; no lo amplíes con EAN, SKU, franquicia, año o edición salvo que ya formen parte literal de ese nombre. Devuelve cada precio en un párrafo separado con una única cita, para poder asociar importe y fuente sin ambigüedad. Para cada precio útil conserva importe, moneda, título y URL. En eBay distingue vendido/completado de anuncio activo solo si la página lo indica. Descarta lotes, accesorios, cajas vacías y variantes claramente distintas. Si una de las tres fuentes no tiene coincidencia, continúa con las otras dos sin buscar una cuarta.${'${forcedQueryInstruction}'}${'${priceChartingExact}'}${'${specialistInstruction}'}\`;`;

  if(!s.includes(oldRequest)) throw new Error(`${path}: requestText pattern not found`);
  s=s.replace(oldRequest,newRequest);

  const oldReturn=' return webSearchSources(data);';
  const newReturn=" return webSearchSources(data,{attachAllText:searchMode==='pricecharting'});";
  if(!s.includes(oldReturn)) throw new Error(`${path}: webSearchSources return pattern not found`);
  s=s.replace(oldReturn,newReturn);

  const oldRate=`async function fetchUsdEurRate(fetcher){
 try{
  const r=await fetcher('https://api.frankfurter.dev/v2/providers/ecb/rate/usd/eur',{signal:AbortSignal.timeout(10000)});
  if(!r.ok)return null;
  const data=await r.json();
  const rate=Number(data?.rate);
  return Number.isFinite(rate)&&rate>0?rate:null;
 }catch{return null}
}`;
  const newRate=`async function fetchUsdEurRate(fetcher){
 const attempts=[
  ['https://api.frankfurter.dev/v2/providers/ecb/rate/usd/eur',data=>Number(data?.rate)],
  ['https://api.frankfurter.app/latest?from=USD&to=EUR',data=>Number(data?.rates?.EUR)]
 ];
 for(const [url,read] of attempts){
  try{
   const r=await fetcher(url,{signal:AbortSignal.timeout(10000)});
   if(!r.ok)continue;
   const rate=read(await r.json());
   if(Number.isFinite(rate)&&rate>0)return rate;
  }catch{}
 }
 return null;
}`;
  if(!s.includes(oldRate)) throw new Error(`${path}: rate pattern not found`);
  s=s.replace(oldRate,newRate);

  fs.writeFileSync(path,s);
}

const testPath='tests/core.mjs';
let t=fs.readFileSync(testPath,'utf8');
const anchor=`assert.equal(publicListings[1].price,30);\n`;
if(!t.includes(anchor)) throw new Error('tests anchor not found');
const regression=`\n// PriceCharting realista: el resultado web puede traer URL/título sin precio y dejar\n// el importe únicamente en el texto final del modelo. Ese precio no puede perderse.\nlet pcPrompt='';\nconst pcTextOnlyFetch=async(_url,init)=>{\n pcPrompt=String(JSON.parse(init.body).messages?.[0]?.content||'');\n return new Response(JSON.stringify({content:[\n  {type:'web_search_tool_result',content:[{type:'web_search_result',title:'Eomer #1982 Prices | Funko POP Movies',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982'}]},\n  {type:'text',text:'PriceCharting · Eomer #1982 · Out of Box $11.05 · In Box $16.00 · New $18.75',citations:[]}\n ]}),{status:200,headers:{'content-type':'application/json'}});\n};\nconst pcTextOnlySources=await deepseekWebSearch('Eomer 1982',{key:'test',fetcher:pcTextOnlyFetch,searchMode:'pricecharting'});\nassert.equal(pcTextOnlySources.length,1);\nassert.match(pcTextOnlySources[0].description,/\\$16\\.00/);\nassert.match(pcPrompt,/Busca EXCLUSIVAMENTE en PriceCharting/);\nassert.match(pcPrompt,/Eomer 1982/);\nconst pcTextOnlyListings=parsePublicListings(pcTextOnlySources,{USD_EUR:.9});\nassert.equal(pcTextOnlyListings.length,3);\nassert.equal(pcTextOnlyListings[1].price,14.4);\n`;
t=t.replace(anchor,anchor+regression);
fs.writeFileSync(testPath,t);
console.log('Live PriceCharting parsing fix applied');
