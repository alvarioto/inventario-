import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(text, oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`No se encontró: ${label}`);
  return text.replace(oldValue, newValue);
}

// ---- ai-core ----
const aiPath = 'src/lib/ai-core.mjs';
let ai = readFileSync(aiPath, 'utf8');

const oldIdentity = `export function buildResearchIdentity(item){\n const title=!isGenericProductTitle(item?.title)?String(item.title).trim():'';\n const manufacturer=String(item?.manufacturer||'').trim();\n const line=String(item?.line||'').trim();\n const character=String(item?.character||'').trim();\n const sku=String(item?.sku||'').trim();\n const barcode=String(item?.barcode||'').replace(/\\s/g,'');\n const isbn=String(item?.isbn||'').trim();\n const fallback=[item?.type==='funko'?'Funko':'',manufacturer,line,character].filter(Boolean).join(' ');\n return [title||fallback,sku?\`ref \${sku}\`:'',barcode?\`EAN \${barcode}\`:'',isbn?\`ISBN \${isbn}\`:''].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();\n}`;
const newIdentity = `export function buildResearchIdentity(item){\n const title=!isGenericProductTitle(item?.title)?String(item.title).trim():'';\n const character=String(item?.character||'').trim();\n const sku=String(item?.sku||'').trim();\n const barcode=String(item?.barcode||'').replace(/\\s/g,'');\n const isFunko=item?.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(\`${'${title}'} ${'${item?.manufacturer||\'\'}'} ${'${item?.line||\'\'}'}\`);\n if(isFunko){\n  if(character)return \`${'${character}'} Funko Pop\`.replace(/\\s+/g,' ').trim();\n  if(title){\n   const parts=title.split(/\\s+[–—-]\\s+/).filter(Boolean);\n   let short=(parts.length>1?parts[parts.length-1]:title)\n    .replace(/#\\s*\\d{1,6}\\b/g,' ')\n    .replace(/\\bfunko\\b|\\bpop!?\\b|\\bmovies?\\b|\\btelevision\\b|\\btv\\b|\\bvinyl\\b|\\bfigure\\b|\\bfigura\\b/gi,' ')\n    .replace(/[|:]+/g,' ')\n    .replace(/\\s+/g,' ').trim();\n   if(short)return \`${'${short}'} Funko Pop\`.replace(/\\s+/g,' ').trim();\n  }\n  if(sku)return \`Funko ${'${sku}'}\`;\n  if(barcode)return \`Funko ${'${barcode}'}\`;\n  return 'Funko Pop';\n }\n return (title||character||String(item?.manufacturer||'').trim()||String(item?.line||'').trim()).replace(/\\s+/g,' ').trim();\n}`;
ai = replaceOnce(ai, oldIdentity, newIdentity, 'buildResearchIdentity');

const usableAnchor = `function keepUsableSources(rows){\n return rows.filter(source=>source?.url&&!sourceLooksBroken(source));\n}\n`;
const usableReplacement = `${usableAnchor}\nfunction allowedPricingSource(source){\n const host=hostOf(source?.url);\n if(!host)return false;\n return host==='pricecharting.com'||host.endsWith('.pricecharting.com')\n  ||host==='stockx.com'||host.endsWith('.stockx.com')\n  ||/(^|\\.)ebay\\.[a-z.]+$/.test(host);\n}\n`;
ai = replaceOnce(ai, usableAnchor, usableReplacement, 'allowedPricingSource');

const oldPrompt = `:``Investiga precios REALES y actuales en Internet público para este artículo de colección: \${query}.\\n\\nBusca el producto exacto, no solo la franquicia. Prioriza España y la UE. Necesito: (1) anuncios actuales comparables en eBay España, Wallapop, TodoColeccion, Catawiki, Vinted o Cardmarket cuando aplique; (2) precios actuales de CUALQUIER tienda pública si aún está a la venta; (3) PVP oficial o precio de lanzamiento únicamente cuando exista una fuente que lo respalde.\\n\\nMUY IMPORTANTE: para cada precio útil escribe el importe explícitamente en EUR en una frase separada y cita en ESA MISMA frase una sola fuente. No agrupes varios precios con varias citas en una misma frase. Si una página coincide con el producto pero no muestra precio, sigue buscando otra que sí lo muestre. Descarta lotes, accesorios, cajas vacías, reproducciones y variantes distintas. No inventes precios, no conviertas un precio sin fuente y no llames \\\"vendido\\\" a un anuncio activo.\${specialistInstruction}``;
const newPrompt = `:``Busca precios actuales para: \${query}. Consulta EXCLUSIVAMENTE estas tres fuentes: PriceCharting (pricecharting.com), StockX (stockx.com) y eBay (ebay.*). NO uses tiendas, blogs, hobbyDB, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio. Haz UNA sola búsqueda web, usando exactamente el nombre corto recibido; no lo amplíes con EAN, SKU, franquicia, año o edición salvo que ya formen parte literal de ese nombre. Para cada precio útil conserva importe, moneda, título y URL. En eBay distingue vendido/completado de anuncio activo solo si la página lo indica. Descarta lotes, accesorios, cajas vacías y variantes claramente distintas. Si una de las tres fuentes no tiene coincidencia, continúa con las otras dos sin buscar una cuarta.\${specialistInstruction}``;
ai = replaceOnce(ai, oldPrompt, newPrompt, 'prompt de precios');
ai = ai.replace("    max_uses:3,", "    max_uses:1,");

const oldFound = `   const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');\n   webSources=uniqueSources([...webSources,...relevantSourcesForItem(item,keepUsableSources(found))]);`;
const newFound = `   const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');\n   const allowed=keepUsableSources(found).filter(allowedPricingSource).slice(0,9);\n   webSources=uniqueSources([...webSources,...relevantSourcesForItem(item,allowed)]).slice(0,9);`;
ai = replaceOnce(ai, oldFound, newFound, 'filtro de fuentes');
ai = ai.replace(" const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,12);", " const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,9);");
ai = ai.replace(" const sources=uniqueSources(webSources).slice(0,12);", " const sources=uniqueSources(webSources).filter(allowedPricingSource).slice(0,9);");
writeFileSync(aiPath, ai);

// ---- App.tsx ----
const appPath = 'src/App.tsx';
let app = readFileSync(appPath, 'utf8');
app = replaceOnce(app,
`  const cameraInputRef = useRef<HTMLInputElement | null>(null);\n  const uploadInputRef = useRef<HTMLInputElement | null>(null);`,
`  const cameraInputRef = useRef<HTMLInputElement | null>(null);\n  const uploadInputRef = useRef<HTMLInputElement | null>(null);\n  const barcodeScanRef = useRef<HTMLInputElement | null>(null);`,
'barcodeScanRef');

const addPickedEnd = `  async function removePhoto(index: number) {`;
const scanFunction = `  async function scanBarcodePhoto(file?: File) {\n    if (!file || busy || photoBusy) return;\n    setPhotoBusy(true);\n    try {\n      const prepared = await prepareImage(file);\n      const code = await tryReadBarcode(prepared);\n      if (code) {\n        setBarcode(code);\n        showToast(\`Código detectado: \${code}\`);\n      } else {\n        showToast('No se pudo leer el código. Acerca la cámara y evita reflejos.');\n      }\n    } catch (error) {\n      showToast(error instanceof Error ? error.message : 'No se pudo escanear el código.');\n    } finally {\n      setPhotoBusy(false);\n      if (barcodeScanRef.current) barcodeScanRef.current.value = '';\n    }\n  }\n\n`;
app = replaceOnce(app, addPickedEnd, scanFunction + addPickedEnd, 'scanBarcodePhoto');

app = replaceOnce(app,
`          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />`,
`          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />\n          <input ref={barcodeScanRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => scanBarcodePhoto(e.target.files?.[0])} />`,
'input escáner');

app = replaceOnce(app,
`<button className="secondary" onClick={() => uploadInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy || busy}><Upload size={19}/>{photoBusy ? 'Preparando…' : 'Subir fotos'}</button><button className="ai-button" onClick={analyzeAll}`,
`<button className="secondary" onClick={() => uploadInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy || busy}><Upload size={19}/>{photoBusy ? 'Preparando…' : 'Subir fotos'}</button><button className="secondary" onClick={() => barcodeScanRef.current?.click()} disabled={photoBusy || busy}><QrCode size={19}/>Escanear código</button><button className="ai-button" onClick={analyzeAll}`,
'botón escanear código');

app = replaceOnce(app,
`  const [research] = useState<ResearchResult | undefined>(item?.research || seed?.research);`,
`  const [research, setResearch] = useState<ResearchResult | undefined>(item?.research || seed?.research);\n  const [researchBusy, setResearchBusy] = useState(false);`,
'estado research');

const beforeDownload = `  function downloadQr() {`;
const refreshResearch = `  async function refreshResearch() {\n    if (!draft.title.trim() || researchBusy) return;\n    setResearchBusy(true);\n    setPhotoError('');\n    try {\n      const next = await investigate(draft);\n      setResearch(next);\n      setDraft((current) => ({\n        ...current,\n        currentValue: next.asking.median != null ? Number(next.asking.median.toFixed(2)) : current.currentValue\n      }));\n    } catch (error) {\n      setPhotoError(error instanceof Error ? error.message : 'No se pudo mejorar la investigación.');\n    } finally {\n      setResearchBusy(false);\n    }\n  }\n\n`;
app = replaceOnce(app, beforeDownload, refreshResearch + beforeDownload, 'refreshResearch');
app = replaceOnce(app, `{item && <section className="research-panel">`, `{draft.title.trim() && <section className="research-panel">`, 'research panel visible');
app = replaceOnce(app,
`<div className="research-head"><div><h3 className="form-section-title"><Sparkles/> Análisis del artículo</h3><p className="muted">Identificación, referencias y valoración obtenidas en la misma captura inteligente.</p></div></div>`,
`<div className="research-head"><div><h3 className="form-section-title"><Sparkles/> Análisis del artículo</h3><p className="muted">Identificación, referencias y valoración obtenidas en la misma captura inteligente.</p></div><button type="button" className="ai-button" onClick={refreshResearch} disabled={researchBusy || busy}><WandSparkles size={17}/>{researchBusy ? 'Mejorando…' : 'Mejorar con IA'}</button></div>`,
'botón mejorar IA');
writeFileSync(appPath, app);

// ---- tests ----
const testPath = 'tests/core.mjs';
let tests = readFileSync(testPath, 'utf8');
tests = tests.replace(`assert.match(cleanIdentity,/90310/);\nassert.match(cleanIdentity,/889698903105/);`, `assert.doesNotMatch(cleanIdentity,/90310/);\nassert.doesNotMatch(cleanIdentity,/889698903105/);\nassert.equal(buildResearchIdentity({title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',sku:'90310',barcode:'889698903105'}),'Éomer Funko Pop');`);
const appAssertions = `assert.match(appSource,/initialPhotos\\.slice\\(0, maxCloudPhotos\\(\\)\\)\\.map\\(\\(file\\) => uploadItemImage\\(file\\)\\)/);`;
const extra = `${appAssertions}\nassert.match(appSource,/Escanear código/);\nassert.match(appSource,/Mejorar con IA/);`;
tests = replaceOnce(tests, appAssertions, extra, 'tests UI');
writeFileSync(testPath, tests);

console.log('Patch aplicado');
