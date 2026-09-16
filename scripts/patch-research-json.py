from pathlib import Path

core_path = Path('src/lib/ai-core.mjs')
core = core_path.read_text()

old_context = "   const context=citations.length===1?String(block.text||''):'';"
new_context = "   const context=citations.length?String(block.text||''):'';"
if old_context not in core:
    raise SystemExit('No se encontró el contexto de citas web')
core = core.replace(old_context, new_context, 1)

old_uses = "    max_uses:searchMode==='pricecharting'?2:3,"
new_uses = "    max_uses:searchMode==='pricecharting'?1:3,"
if old_uses not in core:
    raise SystemExit('No se encontró max_uses de PriceCharting')
core = core.replace(old_uses, new_uses, 1)

old_instruction = "MODO PRICECHARTING: busca primero y de forma prioritaria una ficha INDIVIDUAL del producto exacto en pricecharting.com. Devuelve cualquier precio público visible (Loose/OOB, CIB/In Box, New) con su importe explícito y cita esa ficha. No uses hobbyDB ni páginas con CAPTCHA, acceso denegado o error. Si no hay una coincidencia exacta en PriceCharting, indícalo buscando otra ficha del mismo sitio antes de abandonar."
new_instruction = "MODO PRICECHARTING: haz UNA sola búsqueda y devuelve prioritariamente UNA ficha INDIVIDUAL del producto exacto en pricecharting.com. Usa exactamente el nombre corto recibido. Devuelve cualquier precio público visible (Loose/OOB, CIB/In Box, New) con su importe explícito y cita esa ficha. No uses hobbyDB, páginas genéricas de búsqueda ni páginas con CAPTCHA, acceso denegado o error. Si no hay coincidencia exacta, indícalo sin lanzar búsquedas adicionales."
if old_instruction not in core:
    raise SystemExit('No se encontró instrucción PriceCharting')
core = core.replace(old_instruction, new_instruction, 1)

core_path.write_text(core)

tests_path = Path('tests/core.mjs')
tests = tests_path.read_text()

anchor = "assert.equal(publicListings[1].price,30);\n"
extra = r'''

// DeepSeek puede poner el precio en el bloque de texto citado y no en cited_text.
// Incluso con varias citas, FrikiVault debe conservar ese contexto para extraer el precio.
const citedTextFetch=async()=>new Response(JSON.stringify({content:[
 {type:'web_search_tool_result',content:[
  {type:'web_search_result',title:'Eomer #1982 Prices | Funko POP Movies',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982',cited_text:'Price guide for Eomer #1982'},
  {type:'web_search_result',title:'PriceCharting Search Products',url:'https://www.pricecharting.com/search-products?type=prices&q=Eomer+1982',cited_text:'Search results'}
 ]},
 {type:'text',text:'Eomer #1982 · In Box $16.00',citations:[
  {title:'Eomer #1982 Prices | Funko POP Movies',url:'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982'},
  {title:'PriceCharting Search Products',url:'https://www.pricecharting.com/search-products?type=prices&q=Eomer+1982'}
 ]}
]}),{status:200,headers:{'content-type':'application/json'}});
const citedSources=await deepseekWebSearch('Éomer 1982',{key:'test',fetcher:citedTextFetch,searchMode:'pricecharting'});
const citedExact=citedSources.find(x=>x.url.includes('/game/funko-pop-movies/eomer-1982'));
assert.ok(citedExact);
const citedPrices=parsePublicListings([citedExact],{USD_EUR:1});
assert.equal(citedPrices[0].price,16);
'''
if 'const citedTextFetch=' not in tests:
    if anchor not in tests:
        raise SystemExit('No se encontró ancla de webSources')
    tests = tests.replace(anchor, anchor + extra, 1)

source_anchor = "assert.match(currentCoreSource,/PriceCharting va primero/);"
source_extra = "\nassert.match(currentCoreSource,/max_uses:searchMode==='pricecharting'\\?1:3/);\nassert.match(directAiSource,/priceChartingToken: ''/);"
if "max_uses:searchMode==='pricecharting'\\?1:3" not in tests:
    if source_anchor not in tests:
        raise SystemExit('No se encontró ancla de regresión PriceCharting')
    tests = tests.replace(source_anchor, source_anchor + source_extra, 1)

tests_path.write_text(tests)
print('browser pricing extraction patch applied')
