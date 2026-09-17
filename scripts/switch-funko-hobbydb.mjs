import fs from 'node:fs';

const coreFiles=['src/lib/ai-core.mjs','server/core.mjs'];

function replaceRequired(text, search, replacement, label){
  if(search instanceof RegExp){
    if(!search.test(text)) throw new Error(`No se encontró ${label}`);
    return text.replace(search,replacement);
  }
  if(!text.includes(search)) throw new Error(`No se encontró ${label}`);
  return text.replace(search,replacement);
}

for(const path of coreFiles){
  let s=fs.readFileSync(path,'utf8');

  s=replaceRequired(
    s,
    "const priceChartingSupported=isFunko||['game','card','comic','lego'].includes(item.type);",
    "const priceChartingSupported=!isFunko&&['game','card','comic','lego'].includes(item.type);",
    `${path}: excluir Funko de PriceCharting`
  );

  s=replaceRequired(
    s,
    /function allowedPricingSource\(source\)\{[\s\S]*?\n\}/,
    `function allowedPricingSource(source){\n const host=hostOf(source?.url);\n if(!host)return false;\n return host==='hobbydb.com'||host.endsWith('.hobbydb.com')\n  ||host==='pricecharting.com'||host.endsWith('.pricecharting.com')\n  ||host==='stockx.com'||host.endsWith('.stockx.com')\n  ||/(^|\\.)ebay\\.[a-z.]+$/.test(host);\n}`,
    `${path}: fuentes de precio`
  );

  if(!s.includes("if(host.includes('hobbydb.com')){")){
    s=replaceRequired(
      s,
      " if(host.includes('pricecharting.com')){",
      " if(host.includes('hobbydb.com')){\n  if(/\\/catalog_items\\/[^/?]+/.test(path))score+=40;\n  if(/\\/catalog_items\\/?$/.test(path))score-=15;\n }\n if(host.includes('pricecharting.com')){",
      `${path}: prioridad hobbyDB`
    );
  }

  s=replaceRequired(
    s,
    /function limitPricingSources\(rows,item=null\)\{[\s\S]*?\n\}/,
    `function limitPricingSources(rows,item=null){\n const counts={hobbydb:0,pricecharting:0,stockx:0,ebay:0};\n const ordered=item?prioritizePricingSources(item,rows):rows;\n return ordered.filter(allowedPricingSource).filter(source=>{\n  const host=hostOf(source.url);\n  const group=host.includes('hobbydb.com')?'hobbydb':host.includes('pricecharting.com')?'pricecharting':host.includes('stockx.com')?'stockx':'ebay';\n  const max=group==='ebay'?3:1;\n  if(counts[group]>=max)return false;\n  counts[group]++;\n  return true;\n }).slice(0,6);\n}`,
    `${path}: límites de fuentes`
  );

  const newWebSearch=`export async function deepseekWebSearch(query,{key,model='deepseek-flash',fetcher=fetch,searchMode='general'}){\n if(!key)throw new Error('Falta configurar DEEPSEEK_API_KEY en el servidor.');\n const exactQuery=String(query||'').replace(/\\s+/g,' ').trim();\n const queryHasNumber=/\\b\\d{1,5}\\b/.test(exactQuery);\n const forcedQueryInstruction=queryHasNumber\n  ?\\`\\n\\nCONSULTA OBLIGATORIA: usa exactamente "\\${exactQuery}". El número forma parte de la identidad del artículo y NO puedes quitarlo ni buscar solo el nombre.\\`\n  :'';\n const specialistInstruction=searchMode==='identity'\n  ?'\\n\\nMODO IDENTIDAD: NO tasar todavía. Localiza el PRODUCTO EXACTO usando prioritariamente referencia/SKU/Item No., EAN/UPC, fabricante y texto literal de la caja.'\n  :searchMode==='hobbydb'\n   ?'\\n\\nMODO HOBBYDB: busca una ficha INDIVIDUAL exacta en hobbydb.com/marketplaces/hobbydb/catalog_items. Si el Price Guide exige inicio de sesión, Premium o CAPTCHA, NO intentes saltarlo y NO inventes el valor; conserva la ficha exacta si la encuentras.'\n   :searchMode==='pricecharting'\n    ?'\\n\\nMODO PRICECHARTING: busca una ficha INDIVIDUAL exacta en pricecharting.com y conserva cualquier precio público visible.'\n    :searchMode==='funko'\n     ?'\\n\\nMODO FUNKO: usa SOLO hobbyDB/Pop Price Guide, eBay y StockX. Primero intenta localizar la ficha exacta en hobbyDB. Después busca precios verificables del MISMO Funko en eBay y StockX. Si hobbyDB oculta el precio tras login/Premium/CAPTCHA, continúa con eBay y StockX sin bloquear la valoración. Distingue Chase/Flocked/Glow/Metallic/etc. y descarta lotes, protectores, cajas vacías y variantes distintas.'\n     :'';\n let requestText;\n if(searchMode==='identity'){\n  requestText=\\`Identifica el nombre comercial exacto de este artículo de colección a partir de sus códigos y referencias: \\${exactQuery}. Necesito fuentes que permitan saber QUÉ PRODUCTO ES; todavía no busques una tasación.\\${specialistInstruction}\\`;\n }else if(searchMode==='hobbydb'){\n  const hobbyUrl='https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?filters%5Bq%5D%5B0%5D='+encodeURIComponent(exactQuery);\n  requestText=\\`Busca EXCLUSIVAMENTE en hobbyDB el producto "\\${exactQuery}". Empieza por esta búsqueda exacta: \\${hobbyUrl}. Devuelve la ficha individual exacta y cualquier precio visible que aparezca públicamente. Si el precio está protegido por login, Premium o CAPTCHA, no lo inventes.\\${forcedQueryInstruction}\\${specialistInstruction}\\`;\n }else if(searchMode==='pricecharting'){\n  const pcUrl='https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(exactQuery);\n  requestText=\\`Busca EXCLUSIVAMENTE en PriceCharting el producto "\\${exactQuery}". Empieza por \\${pcUrl}. Devuelve la ficha individual exacta y cualquier precio público visible.\\${forcedQueryInstruction}\\${specialistInstruction}\\`;\n }else if(searchMode==='funko'){\n  requestText=\\`Busca precios actuales para: \\${exactQuery}. Consulta SOLO estas fuentes: hobbyDB/Pop Price Guide (hobbydb.com), eBay (ebay.*) y StockX (stockx.com). Haz como máximo TRES búsquedas internas: una por fuente. Usa exactamente el nombre corto recibido; no añadas EAN, SKU, franquicia o edición salvo que ya estén en ese nombre. En hobbyDB prioriza la ficha individual exacta. En eBay prioriza vendidos/completados si aparecen y, si no hay suficientes, acepta anuncios activos del artículo exacto como referencia. Para cada precio útil conserva importe, moneda, título y URL. Devuelve cada precio junto a una sola cita. Si hobbyDB requiere login/Premium/CAPTCHA, sigue con eBay y StockX.\\${forcedQueryInstruction}\\${specialistInstruction}\\`;\n }else{\n  requestText=\\`Busca precios actuales para: \\${exactQuery}. Consulta EXCLUSIVAMENTE PriceCharting, StockX y eBay. Conserva importe, moneda, título y URL del producto exacto.\\${forcedQueryInstruction}\\`;\n }\n const response=await fetcher('https://api.deepseek.com/anthropic/v1/messages',{\n  method:'POST',\n  headers:{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'},\n  body:JSON.stringify({\n   model,\n   max_tokens:1600,\n   messages:[{role:'user',content:requestText}],\n   tools:[{\n    type:'web_search_20250305',\n    name:'web_search',\n    max_uses:searchMode==='hobbydb'||searchMode==='pricecharting'?1:3,\n    user_location:{type:'approximate',country:'ES',timezone:'Europe/Madrid'}\n   }],\n   tool_choice:{type:'auto'},\n   stream:false\n  }),\n  signal:AbortSignal.timeout(32000)\n });\n if(!response.ok){\n  const body=await response.text().catch(()=> '');\n  throw new Error(\\`Búsqueda pública HTTP \\${response.status}\\${body?\\`: \\${body.slice(0,220)}\\`:''}\\`);\n }\n const data=await response.json();\n return webSearchSources(data);\n}\n\n`;

  s=replaceRequired(
    s,
    /export async function deepseekWebSearch\(query,\{key,model='deepseek-flash',fetcher=fetch,searchMode='general'\}\)\{[\s\S]*?\n\}\n\nfunction parseDeepSeekJson/,
    newWebSearch+'function parseDeepSeekJson',
    `${path}: buscador DeepSeek`
  );

  const researchStart=s.indexOf(' // Para Funko no se dispersa la búsqueda:');
  if(researchStart<0) throw new Error(`No se encontró bloque de búsqueda en ${path}`);
  const researchEndMarker=" } else if(!priceChartingListings.length) warnings.push('No hay proveedor de búsqueda pública configurado.');";
  const researchEnd=s.indexOf(researchEndMarker,researchStart);
  if(researchEnd<0) throw new Error(`No se encontró final del bloque de búsqueda en ${path}`);
  const replacement=` // Para Funko hacemos UNA sola llamada de búsqueda: hobbyDB primero y eBay/StockX como respaldo.\n // Así evitamos cadenas de búsquedas que se contradigan entre sí y, si hobbyDB exige login,\n // la valoración puede seguir saliendo desde mercado público verificable.\n if(config.key){\n  try{\n   const exactQuery=(isFunko?identity.normalize('NFD').replace(/[\\u0300-\\u036f]/g,''):identity).trim();\n   const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');\n   const usable=keepUsableSources(found).filter(allowedPricingSource);\n   const relevant=prioritizePricingSources(item,relevantSourcesForItem(item,usable));\n   webSources=limitPricingSources(uniqueSources([...webSources,...relevant]),item);\n  }catch(error){\n   warnings.push(error instanceof Error?\\`Búsqueda de precios: \\${error.message}\\`:'No se pudo completar la búsqueda de precios.');\n  }\n } else if(!priceChartingListings.length) warnings.push('No hay proveedor de búsqueda pública configurado.');`;
  s=s.slice(0,researchStart)+replacement+s.slice(researchEnd+researchEndMarker.length);

  s=replaceRequired(
    s,
    "   ...(priceChartingSupported?{priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity)}:{}),\n   ...(isFunko?{stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)}:{})",
    "   ...(isFunko?{ppg:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?filters%5Bq%5D%5B0%5D='+encodeURIComponent(identity)}:priceChartingSupported?{priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity)}:{}),\n   ...(isFunko?{stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)}:{})",
    `${path}: enlace hobbyDB`
  );

  s=s.replace(/\(PriceCharting\|eBay\|StockX\|Amazon\|Wallapop\)/g,'(PriceCharting|hobbyDB|eBay|StockX|Amazon|Wallapop)');

  fs.writeFileSync(path,s);
}

// Mostrar hobbyDB/PPG en la ficha, sin eliminar PriceCharting para categorías no Funko.
{
  const path='src/App.tsx';
  let s=fs.readFileSync(path,'utf8');
  s=replaceRequired(
    s,
    `{research.links.priceCharting && <a href={research.links.priceCharting} target="_blank" rel="noreferrer">PriceCharting</a>}{research.links.stockx && <a href={research.links.stockx} target="_blank" rel="noreferrer">StockX</a>}`,
    `{research.links.ppg && <a href={research.links.ppg} target="_blank" rel="noreferrer">hobbyDB / PPG</a>}{research.links.priceCharting && <a href={research.links.priceCharting} target="_blank" rel="noreferrer">PriceCharting</a>}{research.links.stockx && <a href={research.links.stockx} target="_blank" rel="noreferrer">StockX</a>}`,
    'src/App.tsx: enlace hobbyDB'
  );
  fs.writeFileSync(path,s);
}

// Aclarar en ajustes que PriceCharting deja de intervenir en Funko.
{
  const path='src/components/DirectAiSettings.tsx';
  let s=fs.readFileSync(path,'utf8');
  s=replaceRequired(
    s,
    'FrikiVault consulta PriceCharting antes que la búsqueda web en categorías compatibles (Funko, videojuegos, cartas, cómics y LEGO) y usa el valor correspondiente a su estado como referencia principal.',
    'FrikiVault conserva PriceCharting solo como guía opcional para videojuegos, cartas, cómics y LEGO. Los Funko se investigan con hobbyDB/Pop Price Guide y se contrastan con eBay y StockX.',
    'DirectAiSettings: texto PriceCharting'
  );
  s=replaceRequired(
    s,
    'No intenta saltarse CAPTCHA de hobbyDB.',
    'hobbyDB puede exigir inicio de sesión, Premium o CAPTCHA para partes de su Price Guide; FrikiVault no intenta saltarse esas protecciones y usa mercado público como respaldo.',
    'DirectAiSettings: aviso hobbyDB'
  );
  fs.writeFileSync(path,s);
}

// Sustituir las regresiones que obligaban a Funko a usar PriceCharting por una prueba realista
// de hobbyDB + eBay: hobbyDB identifica la pieza y eBay garantiza una referencia de precio.
{
  const path='tests/core.mjs';
  let s=fs.readFileSync(path,'utf8');
  const re=/\/\/ La consulta REAL enviada al buscador de PriceCharting[\s\S]*?\/\/ Regresión: una respuesta JSON imperfecta/;
  if(!re.test(s)) throw new Error('No se encontró el bloque de regresión PriceCharting en tests/core.mjs');
  const replacement=`// Funko: una sola búsqueda usa hobbyDB como guía de identidad y eBay/StockX como respaldo de precio.\nlet funkoMarketPrompts=[];\nconst funkoMarketFetch=async(url,init)=>{\n if(String(url).includes('frankfurter.dev'))return new Response(JSON.stringify({rate:.9}),{status:200,headers:{'content-type':'application/json'}});\n if(String(url).includes('/anthropic/v1/messages')){\n  const prompt=String(JSON.parse(init.body).messages?.[0]?.content||'');\n  funkoMarketPrompts.push(prompt);\n  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[\n   {type:'web_search_result',title:'Éomer | Art Toys | hobbyDB',url:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/eomer-art-toys',cited_text:'Funko Pop! Movies The Lord of the Rings Éomer #1982'},\n   {type:'web_search_result',title:'Funko Pop Éomer #1982 - 29,95 EUR',url:'https://www.ebay.es/itm/eomer1982',cited_text:'Éomer #1982 · 29,95 EUR'},\n   {type:'web_search_result',title:'Funko Pop Eomer 1982',url:'https://stockx.com/funko-pop-eomer-1982',cited_text:'Eomer #1982'}\n  ]}]}),{status:200,headers:{'content-type':'application/json'}});\n }\n return new Response('{}',{status:404,headers:{'content-type':'application/json'}});\n};\nconst funkoMarketResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies',popNumber:'1982',hasBox:true}},{key:'test',fetcher:funkoMarketFetch,priceChartingToken:'a'.repeat(40)});\nassert.equal(funkoMarketPrompts.length,1);\nassert.equal(funkoMarketResearch.searchIdentity,'Éomer 1982');\nassert.match(funkoMarketPrompts[0],/hobbyDB\/Pop Price Guide/);\nassert.match(funkoMarketPrompts[0],/Eomer 1982/);\nassert.doesNotMatch(funkoMarketPrompts[0],/Consulta SOLO estas fuentes: PriceCharting/);\nassert.ok(funkoMarketResearch.asking.median>0);\nassert.equal(funkoMarketResearch.asking.median,29.95);\nassert.ok(funkoMarketResearch.sources.some(source=>source.url.includes('hobbydb.com')));\nassert.ok(funkoMarketResearch.comparables.some(row=>row.url.includes('ebay.es')));\nassert.match(funkoMarketResearch.links.ppg,/hobbydb\\.com/);\nassert.equal(funkoMarketResearch.links.priceCharting,undefined);\n\n// Regresión: una respuesta JSON imperfecta`;
  s=s.replace(re,replacement);
  fs.writeFileSync(path,s);
}

console.log('Funko pricing switched to hobbyDB + eBay/StockX without removing other working categories.');
