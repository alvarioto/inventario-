import { readFileSync, writeFileSync } from 'node:fs';

function once(text, oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`No se encontró: ${label}`);
  return text.replace(oldValue, newValue);
}

const corePath='src/lib/ai-core.mjs';
let core=readFileSync(corePath,'utf8');

core=once(core,
`export async function research(input,config){
 let {item}=researchSchema.parse(input);
 const isFunko=item.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(\`${'${item.title||\'\'}'} ${'${item.manufacturer||\'\'}'} ${'${item.line||\'\'}'}\`);
 let identity=buildResearchIdentity(item)||String(item.title||'').trim();`,
`export async function research(input,config){
 let {item}=researchSchema.parse(input);
 const isFunko=item.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(\`${'${item.title||\'\'}'} ${'${item.manufacturer||\'\'}'} ${'${item.line||\'\'}'}\`);
 // Antes de construir la consulta, vuelve a derivar los campos Funko. Esto recupera
 // el número Pop desde un título como "Éomer #1982" aunque una ficha antigua no
 // tenga todavía popNumber guardado.
 if(isFunko)item=deriveFunkoFields({...item,type:'funko'});
 let identity=buildResearchIdentity(item)||String(item.title||'').trim();`,
'research deriva número Funko');

core=once(core,
`   const exactQuery=identity.trim();
   let hasExactVisiblePrice=priceChartingListings.length>0;`,
`   // PriceCharting responde mejor sin adornos de marca. Conservamos la identidad
   // visible, pero la consulta externa para Funko es SIEMPRE nombre + número + variante.
   // También quitamos tildes para no degradar el buscador de PriceCharting.
   const exactQuery=(isFunko?identity.normalize('NFD').replace(/[\\u0300-\\u036f]/g,''):identity).trim();
   let hasExactVisiblePrice=priceChartingListings.length>0;`,
'consulta externa Funko');

core=once(core,
` const specialistInstruction=searchMode==='identity'?'\\n\\nMODO IDENTIDAD: NO tasar todavía. Localiza el PRODUCTO EXACTO usando prioritariamente referencia/SKU/Item No., EAN/UPC, fabricante y texto literal de la caja. Busca páginas de producto concretas y devuelve citas donde aparezca el nombre comercial real. No describas la fotografía (dorso, caja, etiqueta, código de barras) como si fuera el nombre del producto.':searchMode==='pricecharting'?'\\n\\nMODO PRICECHARTING: busca primero y de forma prioritaria una ficha INDIVIDUAL del producto exacto en pricecharting.com. Devuelve cualquier precio público visible (Loose/OOB, CIB/In Box, New) con su importe explícito y cita esa ficha. No uses hobbyDB ni páginas con CAPTCHA, acceso denegado o error. Si no hay una coincidencia exacta en PriceCharting, indícalo buscando otra ficha del mismo sitio antes de abandonar.':searchMode==='funko'?'\\n\\nMODO FUNKO: PriceCharting es la primera fuente especializada. Después contrasta únicamente con StockX y eBay vendidos/completados. No uses tiendas públicas, hobbyDB ni ningún otro dominio. Distingue OOB/loose, con caja/CIB y nuevo. Solo llames venta cerrada a una página que lo indique explícitamente. Evita lotes, accesorios y variantes distintas. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.': '';
 const requestText=searchMode==='identity'`,
` const specialistInstruction=searchMode==='identity'?'\\n\\nMODO IDENTIDAD: NO tasar todavía. Localiza el PRODUCTO EXACTO usando prioritariamente referencia/SKU/Item No., EAN/UPC, fabricante y texto literal de la caja. Busca páginas de producto concretas y devuelve citas donde aparezca el nombre comercial real. No describas la fotografía (dorso, caja, etiqueta, código de barras) como si fuera el nombre del producto.':searchMode==='pricecharting'?'\\n\\nMODO PRICECHARTING: busca primero y de forma prioritaria una ficha INDIVIDUAL del producto exacto en pricecharting.com. Devuelve cualquier precio público visible (Loose/OOB, CIB/In Box, New) con su importe explícito y cita esa ficha. No uses hobbyDB ni páginas con CAPTCHA, acceso denegado o error. Si no hay una coincidencia exacta en PriceCharting, indícalo buscando otra ficha del mismo sitio antes de abandonar.':searchMode==='funko'?'\\n\\nMODO FUNKO: PriceCharting es la primera fuente especializada. Después contrasta únicamente con StockX y eBay vendidos/completados. No uses tiendas públicas, hobbyDB ni ningún otro dominio. Distingue OOB/loose, con caja/CIB y nuevo. Solo llames venta cerrada a una página que lo indique explícitamente. Evita lotes, accesorios y variantes distintas. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.': '';
 const exactQuery=String(query||'').replace(/\\s+/g,' ').trim();
 const queryHasNumber=/\\b\\d{1,5}\\b/.test(exactQuery);
 const forcedQueryInstruction=queryHasNumber
  ?\`\\n\\nCONSULTA OBLIGATORIA: usa exactamente "${'${exactQuery}'}". El número forma parte de la identidad del Funko y NO puedes quitarlo ni buscar solo el nombre. Ejemplo: si recibes "Eomer 1982", la consulta debe ser "Eomer 1982", nunca "Eomer" ni "Eomer Funko Pop".\`
  :'';
 const priceChartingExact=searchMode==='pricecharting'
  ?\`\\n\\nPRICECHARTING EXACTO: consulta específicamente esta búsqueda y no la reformules: https://www.pricecharting.com/search-products?type=prices&q=${'${encodeURIComponent(exactQuery)}'}\`
  :'';
 const requestText=searchMode==='identity'`,
'forzar consulta exacta');

core=once(core,
`  :\`Busca precios actuales para: ${'${query}'}. Consulta EXCLUSIVAMENTE estas tres fuentes: PriceCharting (pricecharting.com), StockX (stockx.com) y eBay (ebay.*). NO uses tiendas, blogs, hobbyDB, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio. Haz como máximo TRES búsquedas internas: una para PriceCharting, una para StockX y una para eBay. En cada sitio parte exactamente del nombre corto recibido; no lo amplíes con EAN, SKU, franquicia, año o edición salvo que ya formen parte literal de ese nombre. Devuelve cada precio en un párrafo separado con una única cita, para poder asociar importe y fuente sin ambigüedad. Para cada precio útil conserva importe, moneda, título y URL. En eBay distingue vendido/completado de anuncio activo solo si la página lo indica. Descarta lotes, accesorios, cajas vacías y variantes claramente distintas. Si una de las tres fuentes no tiene coincidencia, continúa con las otras dos sin buscar una cuarta.${'${specialistInstruction}'}\`;`,
`  :\`Busca precios actuales para: ${'${exactQuery}'}. Consulta EXCLUSIVAMENTE estas tres fuentes: PriceCharting (pricecharting.com), StockX (stockx.com) y eBay (ebay.*). NO uses tiendas, blogs, hobbyDB, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio. Haz como máximo TRES búsquedas internas: una para PriceCharting, una para StockX y una para eBay. En cada sitio parte exactamente del nombre corto recibido; no lo amplíes con EAN, SKU, franquicia, año o edición salvo que ya formen parte literal de ese nombre. Devuelve cada precio en un párrafo separado con una única cita, para poder asociar importe y fuente sin ambigüedad. Para cada precio útil conserva importe, moneda, título y URL. En eBay distingue vendido/completado de anuncio activo solo si la página lo indica. Descarta lotes, accesorios, cajas vacías y variantes claramente distintas. Si una de las tres fuentes no tiene coincidencia, continúa con las otras dos sin buscar una cuarta.${'${forcedQueryInstruction}'}${'${priceChartingExact}'}${'${specialistInstruction}'}\`;`,
'prompt exacto');

core=once(core,
`    max_uses:searchMode==='pricecharting'?2:3,`,
`    max_uses:searchMode==='pricecharting'?1:3,`,
'una sola consulta PriceCharting');

core=once(core,
`  {role:'system',content:system},
  {role:'user',content:makeContent(rows)}`,
`  {role:'system',content:system+' En Funko revisa expresamente TODAS las fotos para localizar el número Pop. Si aparece un número Pop visible, popNumber no puede quedar vacío. No lo confundas con Item No./SKU.'},
  {role:'user',content:makeContent(rows)}`,
'identificación número Pop');

writeFileSync(corePath,core);

const appPath='src/App.tsx';
let app=readFileSync(appPath,'utf8');
app=once(app,
`      popNumber: result.popNumber,`,
`      popNumber: result.popNumber || result.title.match(/#\\s*(\\d{1,5})\\b/)?.[1] || '',`,
'fallback número en seed');
writeFileSync(appPath,app);

const testsPath='tests/core.mjs';
let tests=readFileSync(testsPath,'utf8');
const marker="// Regresión realista: si DeepSeek devuelve primero una página genérica de PriceCharting\n";
const regression=`// La consulta REAL enviada al buscador de PriceCharting debe conservar nombre + número,\n// incluso si popNumber no venía guardado pero sí aparece en el título.\nlet exactPcPrompt='';\nconst exactPcQueryFetch=async(url,init)=>{\n if(String(url).includes('/anthropic/v1/messages')){\n  const body=JSON.parse(init.body);\n  exactPcPrompt=String(body.messages?.[0]?.content||'');\n  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[]}]}),{status:200,headers:{'content-type':'application/json'}});\n }\n if(String(url).includes('frankfurter.dev'))return new Response('{}',{status:404});\n return new Response('{}',{status:404,headers:{'content-type':'application/json'}});\n};\nconst exactPcQueryResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies'}},{key:'test',fetcher:exactPcQueryFetch});\nassert.equal(exactPcQueryResearch.searchIdentity,'Éomer 1982');\nassert.match(exactPcPrompt,/Eomer 1982/);\nassert.match(exactPcPrompt,/NO puedes quitarlo ni buscar solo el nombre/);\nassert.match(exactPcPrompt,/q=Eomer%201982/);\nassert.doesNotMatch(exactPcPrompt,/Eomer Funko Pop/);\n\n`;
if(!tests.includes(regression)){
 if(!tests.includes(marker))throw new Error('No se encontró marcador de tests');
 tests=tests.replace(marker,regression+marker);
}
writeFileSync(testsPath,tests);
console.log('Exact Funko name+number search patch applied');
