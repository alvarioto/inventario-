import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(text, oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`No se encontró: ${label}`);
  return text.replace(oldValue, newValue);
}

const aiPath='src/lib/ai-core.mjs';
let ai=readFileSync(aiPath,'utf8');

const oldIdentity=`export function buildResearchIdentity(item){
 const title=!isGenericProductTitle(item?.title)?String(item.title).trim():'';
 const manufacturer=String(item?.manufacturer||'').trim();
 const line=String(item?.line||'').trim();
 const character=String(item?.character||'').trim();
 const sku=String(item?.sku||'').trim();
 const barcode=String(item?.barcode||'').replace(/\s/g,'');
 const isbn=String(item?.isbn||'').trim();
 const fallback=[item?.type==='funko'?'Funko':'',manufacturer,line,character].filter(Boolean).join(' ');
 return [title||fallback,sku?\`ref \${sku}\`:'',barcode?\`EAN \${barcode}\`:'',isbn?\`ISBN \${isbn}\`:''].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}`;
const newIdentity=`export function buildResearchIdentity(item){
 const title=!isGenericProductTitle(item?.title)?String(item.title).trim():'';
 const character=String(item?.character||'').trim();
 const sku=String(item?.sku||'').trim();
 const barcode=String(item?.barcode||'').replace(/\s/g,'');
 const isFunko=item?.type==='funko'||/\bfunko\b|\bpop!?\b/i.test(\`${'${title}'} ${'${item?.manufacturer||\'\'}'} ${'${item?.line||\'\'}'}\`);
 if(isFunko){
  if(character)return \`${'${character}'} Funko Pop\`.replace(/\s+/g,' ').trim();
  if(title){
   const parts=title.split(/\s+[–—-]\s+/).filter(Boolean);
   let short=(parts.length>1?parts[parts.length-1]:title)
    .replace(/#\s*\d{1,6}\b/g,' ')
    .replace(/\bfunko\b|\bpop!?\b|\bmovies?\b|\btelevision\b|\btv\b|\bvinyl\b|\bfigure\b|\bfigura\b/gi,' ')
    .replace(/[|:]+/g,' ')
    .replace(/\s+/g,' ').trim();
   if(short)return \`${'${short}'} Funko Pop\`.replace(/\s+/g,' ').trim();
  }
  if(sku)return \`Funko ${'${sku}'}\`;
  if(barcode)return \`Funko ${'${barcode}'}\`;
  return 'Funko Pop';
 }
 return (title||character||String(item?.manufacturer||'').trim()||String(item?.line||'').trim()).replace(/\s+/g,' ').trim();
}`;
ai=replaceOnce(ai,oldIdentity,newIdentity,'buildResearchIdentity');

const usable=`function keepUsableSources(rows){
 return rows.filter(source=>source?.url&&!sourceLooksBroken(source));
}
`;
ai=replaceOnce(ai,usable,usable+`
function allowedPricingSource(source){
 const host=hostOf(source?.url);
 if(!host)return false;
 return host==='pricecharting.com'||host.endsWith('.pricecharting.com')
  ||host==='stockx.com'||host.endsWith('.stockx.com')
  ||/(^|\.)ebay\.[a-z.]+$/.test(host);
}
`,'allowedPricingSource');

const promptPattern=/:`Investiga precios REALES y actuales en Internet público para este artículo de colección:[\s\S]*?\$\{specialistInstruction\}`;/;
if(!promptPattern.test(ai))throw new Error('No se encontró prompt de precios');
const concisePrompt=":`Busca precios actuales para: ${query}. Consulta EXCLUSIVAMENTE estas tres fuentes: PriceCharting (pricecharting.com), StockX (stockx.com) y eBay (ebay.*). NO uses tiendas, blogs, hobbyDB, Wallapop, TodoColeccion, Catawiki, Vinted, Amazon ni ningún otro dominio. Haz UNA sola búsqueda web, usando exactamente el nombre corto recibido; no lo amplíes con EAN, SKU, franquicia, año o edición salvo que ya formen parte literal de ese nombre. Para cada precio útil conserva importe, moneda, título y URL. En eBay distingue vendido/completado de anuncio activo solo si la página lo indica. Descarta lotes, accesorios, cajas vacías y variantes claramente distintas. Si una de las tres fuentes no tiene coincidencia, continúa con las otras dos sin buscar una cuarta.${specialistInstruction}`;";
ai=ai.replace(promptPattern,concisePrompt);
ai=replaceOnce(ai,'    max_uses:3,','    max_uses:1,','max_uses');

const oldFound=`   const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');
   webSources=uniqueSources([...webSources,...relevantSourcesForItem(item,keepUsableSources(found))]);`;
const newFound=`   const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');
   const allowed=keepUsableSources(found).filter(allowedPricingSource).slice(0,9);
   webSources=uniqueSources([...webSources,...relevantSourcesForItem(item,allowed)]).slice(0,9);`;
ai=replaceOnce(ai,oldFound,newFound,'filtro de fuentes');
ai=replaceOnce(ai," const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,12);"," const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,9);",'comparables limit');
ai=replaceOnce(ai," const sources=uniqueSources(webSources).slice(0,12);"," const sources=uniqueSources(webSources).filter(allowedPricingSource).slice(0,9);",'sources limit');
writeFileSync(aiPath,ai);

const appPath='src/App.tsx';
let app=readFileSync(appPath,'utf8');
app=replaceOnce(app,
`  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);`,
`  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeScanRef = useRef<HTMLInputElement | null>(null);`,'barcodeScanRef');

app=replaceOnce(app,'  async function removePhoto(index: number) {',`  async function scanBarcodePhoto(file?: File) {
    if (!file || busy || photoBusy) return;
    setPhotoBusy(true);
    try {
      const prepared = await prepareImage(file);
      const code = await tryReadBarcode(prepared);
      if (code) {
        setBarcode(code);
        showToast(\`Código detectado: \${code}\`);
      } else {
        showToast('No se pudo leer el código. Acerca la cámara y evita reflejos.');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo escanear el código.');
    } finally {
      setPhotoBusy(false);
      if (barcodeScanRef.current) barcodeScanRef.current.value = '';
    }
  }

  async function removePhoto(index: number) {`,'scanBarcodePhoto');

app=replaceOnce(app,
`          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />`,
`          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />
          <input ref={barcodeScanRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => scanBarcodePhoto(e.target.files?.[0])} />`,'input escáner');

app=replaceOnce(app,
`<button className="secondary" onClick={() => uploadInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy || busy}><Upload size={19}/>{photoBusy ? 'Preparando…' : 'Subir fotos'}</button><button className="ai-button" onClick={analyzeAll}`,
`<button className="secondary" onClick={() => uploadInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy || busy}><Upload size={19}/>{photoBusy ? 'Preparando…' : 'Subir fotos'}</button><button className="secondary" onClick={() => barcodeScanRef.current?.click()} disabled={photoBusy || busy}><QrCode size={19}/>Escanear código</button><button className="ai-button" onClick={analyzeAll}`,'botón escanear');

app=replaceOnce(app,
`  const [research] = useState<ResearchResult | undefined>(item?.research || seed?.research);`,
`  const [research, setResearch] = useState<ResearchResult | undefined>(item?.research || seed?.research);
  const [researchBusy, setResearchBusy] = useState(false);`,'research state');

app=replaceOnce(app,'  function downloadQr() {',`  async function refreshResearch() {
    if (!draft.title.trim() || researchBusy) return;
    setResearchBusy(true);
    setPhotoError('');
    try {
      const next = await investigate(draft);
      setResearch(next);
      setDraft((current) => ({
        ...current,
        currentValue: next.asking.median != null ? Number(next.asking.median.toFixed(2)) : current.currentValue
      }));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'No se pudo mejorar la investigación.');
    } finally {
      setResearchBusy(false);
    }
  }

  function downloadQr() {`,'refreshResearch');

app=replaceOnce(app,'{item && <section className="research-panel">','{draft.title.trim() && <section className="research-panel">','research panel');
app=replaceOnce(app,
`<div className="research-head"><div><h3 className="form-section-title"><Sparkles/> Análisis del artículo</h3><p className="muted">Identificación, referencias y valoración obtenidas en la misma captura inteligente.</p></div></div>`,
`<div className="research-head"><div><h3 className="form-section-title"><Sparkles/> Análisis del artículo</h3><p className="muted">Identificación, referencias y valoración obtenidas en la misma captura inteligente.</p></div><button type="button" className="ai-button" onClick={refreshResearch} disabled={researchBusy || busy}><WandSparkles size={17}/>{researchBusy ? 'Mejorando…' : 'Mejorar con IA'}</button></div>`,'botón mejorar IA');
writeFileSync(appPath,app);

const testPath='tests/core.mjs';
let tests=readFileSync(testPath,'utf8');
tests=replaceOnce(tests,
`assert.match(cleanIdentity,/90310/);
assert.match(cleanIdentity,/889698903105/);`,
`assert.doesNotMatch(cleanIdentity,/90310/);
assert.doesNotMatch(cleanIdentity,/889698903105/);
assert.equal(buildResearchIdentity({title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',sku:'90310',barcode:'889698903105'}),'Éomer Funko Pop');`,'identity tests');
const assertion=`assert.match(appSource,/initialPhotos\\.slice\\(0, maxCloudPhotos\\(\\)\\)\\.map\\(\\(file\\) => uploadItemImage\\(file\\)\\)/);`;
tests=replaceOnce(tests,assertion,assertion+`\nassert.match(appSource,/Escanear código/);\nassert.match(appSource,/Mejorar con IA/);`,'UI tests');
writeFileSync(testPath,tests);

console.log('Patch aplicado');
