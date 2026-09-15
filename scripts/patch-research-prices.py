from pathlib import Path

# Improve public price extraction and fallback price search.
p = Path('src/lib/ai-core.mjs')
s = p.read_text()

old = '''export function parsePublicListings(sources){
 const listings=[];
 for(const source of sources){
  const marketplace=marketplaceName(source.url);
  if(!marketplace)continue;
  const prices=extractEuroPrices(`${source.title} ${source.snippet}`);
  if(!prices.length)continue;
  listings.push({
   id:`market-${listings.length}`,
   title:source.title,
   url:source.url,
   price:prices[0],
   currency:'EUR',
   shipping:null,
   condition:`Precio anunciado · ${marketplace}`
  });
 }
 return listings;
}
'''
new = '''export function parsePublicListings(sources){
 const listings=[];
 const seen=new Set();
 for(const source of sources){
  const prices=extractEuroPrices(`${source.title} ${source.snippet}`);
  if(!prices.length)continue;
  const marketplace=marketplaceName(source.url);
  const host=hostOf(source.url);
  for(const price of prices.slice(0,2)){
   const key=`${source.url}|${price}`;
   if(seen.has(key))continue;
   seen.add(key);
   listings.push({
    id:`market-${listings.length}`,
    title:source.title,
    url:source.url,
    price,
    currency:'EUR',
    shipping:null,
    condition:marketplace?`Precio anunciado · ${marketplace}`:`Precio público detectado · ${host||'web'}`
   });
  }
 }
 return listings;
}

function uniqueSources(rows){
 const byUrl=new Map();
 for(const row of rows){
  if(!row?.url)continue;
  const current=byUrl.get(row.url);
  if(!current){byUrl.set(row.url,row);continue;}
  byUrl.set(row.url,{
   ...current,
   title:(current.title&&current.title!=='Fuente web')?current.title:row.title,
   snippet:[current.snippet,row.snippet].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim().slice(0,2200)
  });
 }
 return [...byUrl.values()];
}
'''
if old not in s:
    raise SystemExit('parsePublicListings block not found')
s = s.replace(old, new)

old_prompt = '''    content:`Investiga precios REALES y actuales en Internet público para este artículo de colección: ${query}.\\n\\nBusca el producto exacto, no solo la franquicia. Prioriza España y la UE. Necesito: (1) anuncios actuales comparables en eBay España, Wallapop, TodoColeccion, Catawiki, Vinted o Cardmarket cuando aplique; (2) precios actuales de tiendas si aún está a la venta; (3) PVP oficial o precio de lanzamiento únicamente cuando exista una fuente que lo respalde.\\n\\nPara cada precio útil escribe explícitamente el importe en EUR junto al nombre de la tienda o marketplace y cita esa fuente. Descarta lotes, accesorios, cajas vacías, reproducciones y variantes distintas. No inventes precios, no conviertas un precio sin fuente y no llames "vendido" a un anuncio activo.`
'''
new_prompt = '''    content:`Investiga precios REALES y actuales en Internet público para este artículo de colección: ${query}.\\n\\nBusca el producto exacto, no solo la franquicia. Prioriza España y la UE. Necesito: (1) anuncios actuales comparables en eBay España, Wallapop, TodoColeccion, Catawiki, Vinted o Cardmarket cuando aplique; (2) precios actuales de CUALQUIER tienda pública si aún está a la venta; (3) PVP oficial o precio de lanzamiento únicamente cuando exista una fuente que lo respalde.\\n\\nMUY IMPORTANTE: para cada precio útil escribe el importe explícitamente en EUR en una frase separada y cita en ESA MISMA frase una sola fuente. No agrupes varios precios con varias citas en una misma frase. Si una página coincide con el producto pero no muestra precio, sigue buscando otra que sí lo muestre. Descarta lotes, accesorios, cajas vacías, reproducciones y variantes distintas. No inventes precios, no conviertas un precio sin fuente y no llames "vendido" a un anuncio activo.`
'''
if old_prompt not in s:
    raise SystemExit('deepseekWebSearch prompt not found')
s = s.replace(old_prompt, new_prompt)

old_research = ''' sources.push(...webSources);
 listings.push(...parsePublicListings(webSources));
 for(const listing of listings){
'''
new_research = ''' // Si encontramos el artículo pero los resultados no exponen precios, hacemos una
 // segunda pasada mucho más específica antes de concluir que no hay precios útiles.
 let initialListings=parsePublicListings(webSources);
 if(!initialListings.length&&webSources.length&&config.key){
  try{
   const priceQuery=`${identity} comprar precio EUR € tienda stock eBay Wallapop España`.trim();
   const extra=normalizeSources(await deepseekWebSearch(priceQuery,config),'web-price');
   webSources=uniqueSources([...webSources,...extra]);
   initialListings=parsePublicListings(webSources);
  }catch(error){
   warnings.push(error instanceof Error?`Búsqueda adicional de precios: ${error.message}`:'No se pudo completar la búsqueda adicional de precios.');
  }
 }

 sources.push(...webSources);
 listings.push(...initialListings);
 for(const listing of listings){
'''
if old_research not in s:
    raise SystemExit('research source/listing block not found')
s = s.replace(old_research, new_research)

old_warn = ''' if(!listings.length){
  warnings.push('No se han podido extraer precios comparables verificables de marketplaces públicos; se mantienen las fuentes y enlaces encontrados para revisión.');
 }
'''
new_warn = ''' if(!listings.length){
  warnings.push(`Se localizaron ${webSources.length} páginas coincidentes, pero ninguna expuso un precio en EUR legible en el resultado público. Se mantienen las páginas encontradas para revisión manual.`);
 }
'''
if old_warn not in s:
    raise SystemExit('no-listings warning not found')
s = s.replace(old_warn, new_warn)

old_fallback = '''   summary='Se han encontrado '+sources.length+' fuente'+(sources.length===1?'':'s')+' pública'+(sources.length===1?'':'s')+' y '+listings.length+' anuncio'+(listings.length===1?'':'s')+' con precio. El resumen automático de DeepSeek no llegó en un JSON válido, así que FrikiVault conserva los datos verificables encontrados en vez de cancelar la investigación.';
   facts=comparables.slice(0,8).map(listing=>({label:'Precio anunciado',value:euro(listing.price)+' · '+listing.condition,sourceId:listing.id}));
   warnings.push('Resumen IA: '+(error instanceof Error?error.message:'respuesta no estructurada')+'. Se ha aplicado un filtro local conservador y se mantienen las fuentes para revisión.');
'''
new_fallback = '''   const uniquePageCount=new Set(sources.map(source=>source.url)).size;
   summary=`Se localizaron ${uniquePageCount} páginas coincidentes. ${listings.length} precio${listings.length===1?'':'s'} pudieron extraerse automáticamente y ${comparables.length} pasaron el filtro local de coincidencia exacta. FrikiVault conserva estos datos verificables aunque el resumen automático no pudiera estructurarse.`;
   facts=comparables.slice(0,8).map(listing=>({label:'Precio público',value:euro(listing.price)+' · '+listing.condition,sourceId:listing.id}));
   warnings.push('El resumen automático no pudo estructurarse; se ha aplicado el filtro local de coincidencia y se mantienen las fuentes para revisión.');
'''
if old_fallback not in s:
    raise SystemExit('fallback summary block not found')
s = s.replace(old_fallback, new_fallback)

p.write_text(s)

# Make the UI expose the research pipeline clearly.
p = Path('src/App.tsx')
s = p.read_text()
old_ui = '''{research && <div className="research-result"><p>{research.summary}</p><div className="market-summary"><div><span>Anuncios comparables</span><b>{research.asking.count || '—'}</b></div><div><span>Mediana solicitada</span><b>{research.asking.median == null ? '—' : money(research.asking.median)}</b></div><div><span>Ventas cerradas</span><b>{research.sold.available ? 'Disponible' : 'No disponible'}</b></div></div><div className="research-facts">'''
new_ui = '''{research && <div className="research-result"><p>{research.summary}</p><div className="market-summary"><div><span>Páginas coincidentes</span><b>{new Set(research.sources.map((source) => source.url)).size || '—'}</b></div><div><span>Precios detectados</span><b>{research.listings.length || '—'}</b></div><div><span>Comparables usados</span><b>{research.comparables.length || '—'}</b></div><div><span>Mediana solicitada</span><b>{research.asking.median == null ? '—' : money(research.asking.median)}</b></div><div><span>Ventas cerradas</span><b>{research.sold.available ? 'Disponible' : 'No verificadas'}</b></div></div><div className="research-facts">'''
if old_ui not in s:
    raise SystemExit('research UI block not found')
s = s.replace(old_ui, new_ui)
p.write_text(s)

# Regression tests.
p = Path('tests/core.mjs')
s = p.read_text()
needle = "assert.equal(publicListings[1].price,30);\n"
addition = '''assert.equal(publicListings[1].price,30);\n\n// También aprovechamos precios públicos de tiendas que no son marketplaces conocidos.\nconst shopListings=parsePublicListings([{id:'shop-1',kind:'web',title:'Funko Pop Éomer #1982 - 29,95 €',url:'https://tienda-ejemplo.es/product/eomer-1982',snippet:'En stock · precio 29,95 €'}]);\nassert.equal(shopListings.length,1);\nassert.equal(shopListings[0].price,29.95);\nassert.match(shopListings[0].condition,/Precio público detectado/i);\n'''
if needle not in s:
    raise SystemExit('test insertion point not found')
s = s.replace(needle, addition)
p.write_text(s)
