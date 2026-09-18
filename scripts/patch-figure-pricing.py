from pathlib import Path

core=Path('src/lib/ai-core.mjs')
text=core.read_text(encoding='utf-8')

# 1) Identity for physical figures: manufacturer + line + exact commercial title + SKU/EAN.
anchor=""" if(isFunko){
  const {row,name,popNumber,variant}=funkoMatchParts({...item,type:'funko'});
  const special=/^(normal|standard|regular|classic)$/i.test(variant)?'':variant;
  const category=String(row.funkoCategory||'').trim();
  const categoryHint=/kinder|promotional/i.test(category)?'Kinder':/bitty/i.test(category)?'Bitty':/pocket/i.test(category)?'Pocket':/mystery minis?/i.test(category)?'Mystery Minis':/soda/i.test(category)?'Funko Soda':(!category||/pop!? regular/i.test(category)?'':category);
  const concise=[name,popNumber,categoryHint,special].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
  if(concise)return concise;
  const sku=String(item?.sku||'').trim();
  const barcode=String(item?.barcode||'').replace(/\\s/g,'');
  if(sku)return `Funko ${sku}`;
  if(barcode)return `Funko ${barcode}`;
  return 'Funko';
 }
 return (title||String(item?.character||'').trim()||String(item?.manufacturer||'').trim()||String(item?.line||'').trim()).replace(/\\s+/g,' ').trim();
}"""
replacement=""" if(isFunko){
  const {row,name,popNumber,variant}=funkoMatchParts({...item,type:'funko'});
  const special=/^(normal|standard|regular|classic)$/i.test(variant)?'':variant;
  const category=String(row.funkoCategory||'').trim();
  const categoryHint=/kinder|promotional/i.test(category)?'Kinder':/bitty/i.test(category)?'Bitty':/pocket/i.test(category)?'Pocket':/mystery minis?/i.test(category)?'Mystery Minis':/soda/i.test(category)?'Funko Soda':(!category||/pop!? regular/i.test(category)?'':category);
  const concise=[name,popNumber,categoryHint,special].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
  if(concise)return concise;
  const sku=String(item?.sku||'').trim();
  const barcode=String(item?.barcode||'').replace(/\\s/g,'');
  if(sku)return `Funko ${sku}`;
  if(barcode)return `Funko ${barcode}`;
  return 'Funko';
 }
 if(item?.type==='figure'){
  const manufacturer=String(item?.manufacturer||'').trim();
  const line=String(item?.line||'').trim();
  const sku=String(item?.sku||'').trim();
  const barcode=String(item?.barcode||'').replace(/\\s/g,'');
  const cleanedTitle=title
   .replace(/\\bmarvel\\s+comics\\b/gi,' ')
   .replace(/\\bdc\\s+comics\\b/gi,' ')
   .replace(/\\s+/g,' ').trim();
  const identity=[manufacturer,line,cleanedTitle||String(item?.character||'').trim(),sku||barcode]
   .filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
  if(identity)return identity;
 }
 return (title||String(item?.character||'').trim()||String(item?.manufacturer||'').trim()||String(item?.line||'').trim()).replace(/\\s+/g,' ').trim();
}"""
if anchor not in text: raise SystemExit('buildResearchIdentity anchor not found')
text=text.replace(anchor,replacement,1)

# 2) Allow Idealo as a current-price source for physical figures.
anchor="""  ||host==='stockx.com'||host.endsWith('.stockx.com')
  ||/(^|\\.)ebay\\.[a-z.]+$/.test(host);"""
replacement="""  ||host==='stockx.com'||host.endsWith('.stockx.com')
  ||host==='idealo.es'||host.endsWith('.idealo.es')
  ||/(^|\\.)ebay\\.[a-z.]+$/.test(host);"""
if anchor not in text: raise SystemExit('allowedPricingSource anchor not found')
text=text.replace(anchor,replacement,1)

# 3) Figure-specific web-search instructions: exact SKU/EAN, reject comics/books.
anchor=""" const specialistInstruction=searchMode==='identity'?'\\n\\nMODO IDENTIDAD: NO tasar todavía. Localiza el PRODUCTO EXACTO usando prioritariamente referencia/SKU/Item No., EAN/UPC, fabricante y texto literal de la caja. Busca páginas de producto concretas y devuelve citas donde aparezca el nombre comercial real. No describas la fotografía (dorso, caja, etiqueta, código de barras) como si fuera el nombre del producto.':searchMode==='pricecharting'?"""
replacement=""" const specialistInstruction=searchMode==='identity'?'\\n\\nMODO IDENTIDAD: NO tasar todavía. Localiza el PRODUCTO EXACTO usando prioritariamente referencia/SKU/Item No., EAN/UPC, fabricante y texto literal de la caja. Busca páginas de producto concretas y devuelve citas donde aparezca el nombre comercial real. No describas la fotografía (dorso, caja, etiqueta, código de barras) como si fuera el nombre del producto.':searchMode==='figure'?'\\n\\nMODO FIGURA DE ACCIÓN: el objeto es una FIGURA física, no un cómic/libro aunque el embalaje use logos como MARVEL COMICS o X-MEN. Si la consulta contiene SKU/Item No./EAN/UPC, ese código es OBLIGATORIO para aceptar una coincidencia. Prioriza páginas de producto exactas y ofertas de la misma figura; descarta cómics, TPB, omnibus, novelas, pósteres, accesorios y variantes diferentes. Busca precios actuales en eBay e Idealo cuando existan.':searchMode==='pricecharting'?"""
if anchor not in text: raise SystemExit('specialistInstruction anchor not found')
text=text.replace(anchor,replacement,1)

# 4) New request mode for figures, ahead of generic search.
anchor=""" const requestText=searchMode==='identity'
  ?`Identifica el nombre comercial exacto de este artículo de colección a partir de sus códigos y referencias: ${query}. Busca coincidencias literales de SKU/Item No./EAN/UPC y fabricante. Necesito fuentes que permitan saber QUÉ PRODUCTO ES; todavía no busques una tasación. Si una página solo describe una caja, etiqueta o fotografía, no la uses como nombre del producto.${specialistInstruction}`
  :searchMode==='pricecharting'"""
replacement=""" const requestText=searchMode==='identity'
  ?`Identifica el nombre comercial exacto de este artículo de colección a partir de sus códigos y referencias: ${query}. Busca coincidencias literales de SKU/Item No./EAN/UPC y fabricante. Necesito fuentes que permitan saber QUÉ PRODUCTO ES; todavía no busques una tasación. Si una página solo describe una caja, etiqueta o fotografía, no la uses como nombre del producto.${specialistInstruction}`
  :searchMode==='figure'
   ?`Busca precios actuales de la FIGURA DE ACCIÓN exacta: ${exactQuery}. Si hay SKU/Item No./EAN/UPC en la consulta, úsalo literalmente y descarta cualquier resultado que no corresponda a ese código. Busca primero eBay y después Idealo España. Devuelve únicamente páginas de producto/ofertas de la figura física exacta con precio visible. No aceptes cómics, libros, omnibus, revistas ni resultados que solo compartan el nombre del personaje. Conserva importe, moneda, título y URL en citas separadas.${specialistInstruction}`
  :searchMode==='pricecharting'"""
if anchor not in text: raise SystemExit('requestText anchor not found')
text=text.replace(anchor,replacement,1)

# 5) Route figures into the figure mode.
anchor="""const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');"""
replacement="""const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':item.type==='figure'?'figure':'general'}),'price-search');"""
if anchor not in text: raise SystemExit('research searchMode anchor not found')
text=text.replace(anchor,replacement,1)

core.write_text(text,encoding='utf-8')

# Tests.
tests=Path('tests/core.mjs')
t=tests.read_text(encoding='utf-8')
anchor="""assert.equal(buildResearchIdentity({...kinderMax,funkoVariant:'Upside Down'}),'Max Mayfield Kinder Upside Down');"""
extra=r"""

// Figuras físicas: la búsqueda debe usar fabricante/línea/SKU y no dejar que
// el arte "MARVEL COMICS" arrastre los resultados hacia publicaciones.
const weaponXFigure={
 title:'Marvel Comics X-Men Weapon X Wolverine (Weapon X)',
 type:'figure',manufacturer:'Hasbro',line:'Marvel Legends',character:'Wolverine',sku:'G0644'
};
assert.equal(buildResearchIdentity(weaponXFigure),'Hasbro Marvel Legends X-Men Weapon X Wolverine (Weapon X) G0644');
"""
if anchor not in t: raise SystemExit('test anchor not found')
t=t.replace(anchor,anchor+extra,1)
tests.write_text(t,encoding='utf-8')
print('Figure identity and pricing mode applied')
