import { readFileSync, writeFileSync } from 'node:fs';

function rx(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`No se encontró: ${label}`);
  return text.replace(pattern, replacement);
}
function once(text, oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`No se encontró: ${label}`);
  return text.replace(oldValue, newValue);
}

// ---------- pricing/search core ----------
const aiPath='src/lib/ai-core.mjs';
let ai=readFileSync(aiPath,'utf8');

const newIdentity=`export function buildResearchIdentity(item){
 const title=!isGenericProductTitle(item?.title)?String(item.title).trim():'';
 const character=String(item?.character||'').trim();
 const sku=String(item?.sku||'').trim();
 const barcode=String(item?.barcode||'').replace(/\\s/g,'');
 const isFunko=item?.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(\`${'${title}'} ${'${item?.manufacturer||\'\'}'} ${'${item?.line||\'\'}'}\`);
 if(isFunko){
  if(character)return \`${'${character}'} Funko Pop\`.replace(/\\s+/g,' ').trim();
  if(title){
   const parts=title.split(/\\s+[–—-]\\s+/).filter(Boolean);
   let short=(parts.length>1?parts[parts.length-1]:title)
    .replace(/#\\s*\\d{1,6}\\b/g,' ')
    .replace(/\\bfunko\\b|\\bpop!?\\b|\\bmovies?\\b|\\btelevision\\b|\\btv\\b|\\bvinyl\\b|\\bfigure\\b|\\bfigura\\b/gi,' ')
    .replace(/[|:]+/g,' ')
    .replace(/\\s+/g,' ').trim();
   if(short)return \`${'${short}'} Funko Pop\`.replace(/\\s+/g,' ').trim();
  }
  if(sku)return \`Funko ${'${sku}'}\`;
  if(barcode)return \`Funko ${'${barcode}'}\`;
  return 'Funko Pop';
 }
 return (title||character||String(item?.manufacturer||'').trim()||String(item?.line||'').trim()).replace(/\\s+/g,' ').trim();
}`;
ai=rx(ai,/export function buildResearchIdentity\(item\)\{[\s\S]*?\n\}\n\nfunction specificTitleScore/,newIdentity+'\n\nfunction specificTitleScore','buildResearchIdentity');

if(!ai.includes('function allowedPricingSource(source)')){
 ai=rx(ai,/function keepUsableSources\(rows\)\{[\s\S]*?\n\}/,m=>m+`\n\nfunction allowedPricingSource(source){\n const host=hostOf(source?.url);\n if(!host)return false;\n return host==='pricecharting.com'||host.endsWith('.pricecharting.com')\n  ||host==='stockx.com'||host.endsWith('.stockx.com')\n  ||/(^|\\.)ebay\\.[a-z.]+$/.test(host);\n}`,'allowedPricingSource');
}

ai=rx(ai,/:`Investiga precios REALES y actuales en Internet público para este artículo de colección:[\s\S]*?\$\{specialistInstruction\}`;/,":`Busca precios actuales para: ${query}. Consulta EXCLUSIVAMENTE estas tres fuentes: PriceCharting (pricecharting.com), StockX (stockx.com) y eBay (ebay.*). NO uses tiendas, blogs, hobbyDB, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio. Haz UNA sola búsqueda web, usando exactamente el nombre corto recibido; no lo amplíes con EAN, SKU, franquicia, año o edición salvo que ya formen parte literal de ese nombre. Para cada precio útil conserva importe, moneda, título y URL. En eBay distingue vendido/completado de anuncio activo solo si la página lo indica. Descarta lotes, accesorios, cajas vacías y variantes claramente distintas. Si una de las tres fuentes no tiene coincidencia, continúa con las otras dos sin buscar una cuarta.${specialistInstruction}`;",'prompt precios');
ai=once(ai,'    max_uses:3,','    max_uses:1,','max uses');
ai=rx(ai,/   const found=normalizeSources\(await deepseekWebSearch\(exactQuery,\{\.\.\.config,searchMode:isFunko\?'funko':'general'\}\),'price-search'\);\n   webSources=uniqueSources\(\[\.\.\.webSources,\.\.\.relevantSourcesForItem\(item,keepUsableSources\(found\)\)\]\);/,`   const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');\n   const allowed=keepUsableSources(found).filter(allowedPricingSource).slice(0,9);\n   webSources=uniqueSources([...webSources,...relevantSourcesForItem(item,allowed)]).slice(0,9);`,'filtro dominios');
ai=ai.replace(' const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,12);',' const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,9);');
ai=ai.replace(' const sources=uniqueSources(webSources).slice(0,12);',' const sources=uniqueSources(webSources).filter(allowedPricingSource).slice(0,9);');
writeFileSync(aiPath,ai);

// ---------- UI ----------
const appPath='src/App.tsx';
let app=readFileSync(appPath,'utf8');
app=once(app,'  const uploadInputRef = useRef<HTMLInputElement | null>(null);','  const uploadInputRef = useRef<HTMLInputElement | null>(null);\n  const barcodeScanRef = useRef<HTMLInputElement | null>(null);','barcode ref');
app=once(app,'  async function removePhoto(index: number) {',`  async function scanBarcodePhoto(file?: File) {\n    if (!file || busy || photoBusy) return;\n    setPhotoBusy(true);\n    try {\n      const prepared = await prepareImage(file);\n      const code = await tryReadBarcode(prepared);\n      if (code) { setBarcode(code); showToast(\`Código detectado: \${code}\`); }\n      else showToast('No se pudo leer el código. Acerca la cámara y evita reflejos.');\n    } catch (error) {\n      showToast(error instanceof Error ? error.message : 'No se pudo escanear el código.');\n    } finally {\n      setPhotoBusy(false);\n      if (barcodeScanRef.current) barcodeScanRef.current.value = '';\n    }\n  }\n\n  async function removePhoto(index: number) {`,'scan function');
app=once(app,'          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />','          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />\n          <input ref={barcodeScanRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => scanBarcodePhoto(e.target.files?.[0])} />','barcode input');
app=once(app,'<button className="secondary" onClick={() => uploadInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy || busy}><Upload size={19}/>{photoBusy ? \'Preparando…\' : \'Subir fotos\'}</button><button className="ai-button" onClick={analyzeAll}','<button className="secondary" onClick={() => uploadInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy || busy}><Upload size={19}/>{photoBusy ? \'Preparando…\' : \'Subir fotos\'}</button><button className="secondary" onClick={() => barcodeScanRef.current?.click()} disabled={photoBusy || busy}><QrCode size={19}/>Escanear código</button><button className="ai-button" onClick={analyzeAll}','scan button');
app=once(app,'  const [research] = useState<ResearchResult | undefined>(item?.research || seed?.research);','  const [research, setResearch] = useState<ResearchResult | undefined>(item?.research || seed?.research);\n  const [researchBusy, setResearchBusy] = useState(false);','research state');
app=once(app,'  function downloadQr() {',`  async function refreshResearch() {\n    if (!draft.title.trim() || researchBusy) return;\n    setResearchBusy(true);\n    setPhotoError('');\n    try {\n      const next = await investigate(draft);\n      setResearch(next);\n      setDraft((current) => ({ ...current, currentValue: next.asking.median != null ? Number(next.asking.median.toFixed(2)) : current.currentValue }));\n    } catch (error) {\n      setPhotoError(error instanceof Error ? error.message : 'No se pudo mejorar la investigación.');\n    } finally { setResearchBusy(false); }\n  }\n\n  function downloadQr() {`,'refresh research');
app=once(app,'{item && <section className="research-panel">','{draft.title.trim() && <section className="research-panel">','panel visibility');
app=once(app,'<div className="research-head"><div><h3 className="form-section-title"><Sparkles/> Análisis del artículo</h3><p className="muted">Identificación, referencias y valoración obtenidas en la misma captura inteligente.</p></div></div>','<div className="research-head"><div><h3 className="form-section-title"><Sparkles/> Análisis del artículo</h3><p className="muted">Identificación, referencias y valoración obtenidas en la misma captura inteligente.</p></div><button type="button" className="ai-button" onClick={refreshResearch} disabled={researchBusy || busy}><WandSparkles size={17}/>{researchBusy ? \'Mejorando…\' : \'Mejorar con IA\'}</button></div>','improve button');
writeFileSync(appPath,app);

// ---------- regression tests ----------
const testPath='tests/core.mjs';
let tests=readFileSync(testPath,'utf8');
tests=once(tests,'assert.match(cleanIdentity,/90310/);\nassert.match(cleanIdentity,/889698903105/);',`assert.doesNotMatch(cleanIdentity,/90310/);\nassert.doesNotMatch(cleanIdentity,/889698903105/);\nassert.equal(buildResearchIdentity({title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',sku:'90310',barcode:'889698903105'}),'Éomer Funko Pop');`,'identity tests');
const marker='assert.match(appSource,/initialPhotos\\.slice\\(0, maxCloudPhotos\\(\\)\\)\\.map\\(\\(file\\) => uploadItemImage\\(file\\)\\)/);';
tests=once(tests,marker,marker+'\nassert.match(appSource,/Escanear código/);\nassert.match(appSource,/Mejorar con IA/);','ui tests');
writeFileSync(testPath,tests);
console.log('Patch v2 aplicado');
