import fs from 'node:fs';

const coreFiles=['src/lib/ai-core.mjs'];

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
    " return host==='pricecharting.com'||host.endsWith('.pricecharting.com')\n  ||host==='stockx.com'||host.endsWith('.stockx.com')\n  ||/(^|\\.)ebay\\.[a-z.]+$/.test(host);",
    " return host==='hobbydb.com'||host.endsWith('.hobbydb.com')\n  ||host==='pricecharting.com'||host.endsWith('.pricecharting.com')\n  ||host==='stockx.com'||host.endsWith('.stockx.com')\n  ||/(^|\\.)ebay\\.[a-z.]+$/.test(host);",
    `${path}: permitir hobbyDB`
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
    " const counts={pricecharting:0,stockx:0,ebay:0};",
    " const counts={hobbydb:0,pricecharting:0,stockx:0,ebay:0};",
    `${path}: contador hobbyDB`
  );
  s=replaceRequired(
    s,
    "  const group=host.includes('pricecharting.com')?'pricecharting':host.includes('stockx.com')?'stockx':'ebay';",
    "  const group=host.includes('hobbydb.com')?'hobbydb':host.includes('pricecharting.com')?'pricecharting':host.includes('stockx.com')?'stockx':'ebay';",
    `${path}: grupo hobbyDB`
  );
  s=replaceRequired(
    s,
    "  const max=group==='ebay'?2:1;",
    "  const max=group==='ebay'?3:1;",
    `${path}: hasta tres eBay`
  );
  s=replaceRequired(
    s,
    " }).slice(0,4);",
    " }).slice(0,6);",
    `${path}: límite total de comparables`
  );

  s=replaceRequired(
    s,
    "MODO FUNKO: PriceCharting es la primera fuente especializada. Después contrasta únicamente con StockX y eBay vendidos/completados. No uses tiendas públicas, hobbyDB ni ningún otro dominio. Distingue OOB/loose, con caja/CIB y nuevo. Solo llames venta cerrada a una página que lo indique explícitamente. Evita lotes, accesorios y variantes distintas. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.",
    "MODO FUNKO: hobbyDB/Pop Price Guide es la primera guía para identificar la pieza exacta. Después contrasta con eBay y StockX para obtener precios públicos del MISMO Funko. Si hobbyDB exige login, Premium o CAPTCHA para mostrar el Price Guide, no lo inventes ni intentes saltarlo: continúa con eBay y StockX para que la valoración no se quede vacía. Distingue Chase, Flocked, Glow, Metallic, Diamond y demás variantes. Evita lotes, accesorios, protectores y cajas vacías. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.",
    `${path}: modo Funko hobbyDB`
  );

  s=replaceRequired(
    s,
    "Consulta EXCLUSIVAMENTE estas tres fuentes: PriceCharting (pricecharting.com), StockX (stockx.com) y eBay (ebay.*).",
    "Consulta EXCLUSIVAMENTE estas tres fuentes: ${searchMode==='funko'?'hobbyDB/Pop Price Guide (hobbydb.com), StockX (stockx.com) y eBay (ebay.*)':'PriceCharting (pricecharting.com), StockX (stockx.com) y eBay (ebay.*)' }.",
    `${path}: dominios dinámicos`
  );
  s=replaceRequired(
    s,
    "NO uses tiendas, blogs, hobbyDB, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio.",
    "${searchMode==='funko'?'NO uses PriceCharting, tiendas, blogs, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio.':'NO uses tiendas, blogs, hobbyDB, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio.'}",
    `${path}: exclusiones dinámicas`
  );

  const oldPcBlock=`   if(isFunko&&!hasExactVisiblePrice){\n    const pcFound=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:'pricecharting'}),'pricecharting-public');\n    const pcUsable=keepUsableSources(pcFound).filter(allowedPricingSource);\n    const pcRelevant=prioritizePricingSources(item,relevantSourcesForItem(item,pcUsable));\n    webSources=uniqueSources([...webSources,...pcRelevant]);\n    hasExactVisiblePrice=parsePublicListings(pcRelevant).length>0;\n   }\n\n`;
  s=replaceRequired(s,oldPcBlock,'',`${path}: quitar búsqueda PriceCharting separada para Funko`);

  s=replaceRequired(
    s,
    "   ...(priceChartingSupported?{priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity)}:{}),\n   ...(isFunko?{stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)}:{})",
    "   ...(isFunko?{ppg:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?filters%5Bq%5D%5B0%5D='+encodeURIComponent(identity)}:priceChartingSupported?{priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity)}:{}),\n   ...(isFunko?{stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)}:{})",
    `${path}: enlace hobbyDB`
  );

  s=s.replace(/\(PriceCharting\|eBay\|StockX\|Amazon\|Wallapop\)/g,'(PriceCharting|hobbyDB|eBay|StockX|Amazon|Wallapop)');
  fs.writeFileSync(path,s);
}

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
    'hobbyDB puede exigir inicio de sesión, Premium o CAPTCHA para partes de su Price Guide; FrikiVault no intenta saltarse esas protecciones y usa eBay/StockX como respaldo automático.',
    'DirectAiSettings: aviso hobbyDB'
  );
  fs.writeFileSync(path,s);
}

{
  const path='tests/core.mjs';
  let s=fs.readFileSync(path,'utf8');
  const re=/\/\/ La consulta REAL enviada al buscador de PriceCharting[\s\S]*?\/\/ Regresión: una respuesta JSON imperfecta/;
  if(!re.test(s)) throw new Error('No se encontró el bloque de regresión PriceCharting en tests/core.mjs');
  const testLines=[
    '// Funko: una sola búsqueda usa hobbyDB como guía y eBay/StockX como respaldo de precio.',
    'let hobbyPrompts=[];',
    'const hobbyMarketFetch=async(url,init)=>{',
    " if(String(url).includes('frankfurter.dev'))return new Response(JSON.stringify({rate:.9}),{status:200,headers:{'content-type':'application/json'}});",
    " if(String(url).includes('/anthropic/v1/messages')){",
    "  const prompt=String(JSON.parse(init.body).messages?.[0]?.content||'');",
    '  hobbyPrompts.push(prompt);',
    "  return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[",
    "   {type:'web_search_result',title:'Éomer | Art Toys | hobbyDB',url:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/eomer-art-toys',cited_text:'Funko Pop Movies The Lord of the Rings Éomer #1982'},",
    "   {type:'web_search_result',title:'Funko Pop Éomer #1982 - 29,95 EUR',url:'https://www.ebay.es/itm/eomer1982',cited_text:'Éomer #1982 · 29,95 EUR'},",
    "   {type:'web_search_result',title:'Funko Pop Eomer 1982',url:'https://stockx.com/funko-pop-eomer-1982',cited_text:'Eomer #1982'}",
    "  ]}]}),{status:200,headers:{'content-type':'application/json'}});",
    ' }',
    " return new Response('{}',{status:404,headers:{'content-type':'application/json'}});",
    '};',
    "const hobbyResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies',popNumber:'1982',hasBox:true}},{key:'test',fetcher:hobbyMarketFetch,priceChartingToken:'a'.repeat(40)});",
    'assert.equal(hobbyPrompts.length,1);',
    "assert.equal(hobbyResearch.searchIdentity,'Éomer 1982');",
    'assert.match(hobbyPrompts[0],/hobbyDB\/Pop Price Guide/);',
    'assert.match(hobbyPrompts[0],/Eomer 1982/);',
    'assert.ok(hobbyResearch.asking.median>0);',
    'assert.equal(hobbyResearch.asking.median,29.95);',
    "assert.ok(hobbyResearch.sources.some(source=>source.url.includes('hobbydb.com')));",
    "assert.ok(hobbyResearch.comparables.some(row=>row.url.includes('ebay.es')));",
    'assert.match(hobbyResearch.links.ppg,/hobbydb\\.com/);',
    'assert.equal(hobbyResearch.links.priceCharting,undefined);',
    '',
    '// Regresión: una respuesta JSON imperfecta'
  ];
  s=s.replace(re,testLines.join('\n'));
  fs.writeFileSync(path,s);
}

console.log('Funko now uses hobbyDB/PPG with eBay and StockX fallback; other categories stay intact.');
