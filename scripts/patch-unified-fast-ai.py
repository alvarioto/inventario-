from pathlib import Path
import re

app=Path('src/App.tsx')
core=Path('src/lib/ai-core.mjs')
tests=Path('tests/core.mjs')

s=app.read_text()

scanner=r'''function Scanner({ onCreate, showToast }: { onCreate: (seed?: Partial<InventoryDraft>, photos?: File[]) => void; showToast: (m: string) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [barcode, setBarcode] = useState('');
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoLimit = maxCloudPhotos();

  async function addPicked(picked: File[]) {
    if (!picked.length || photoBusy) return;
    const room = Math.max(0, photoLimit - files.length);
    const selected = picked.filter((file) => !file.type || file.type.startsWith('image/')).slice(0, room);
    if (!selected.length) {
      if (files.length >= photoLimit) showToast(`Puedes usar hasta ${photoLimit} fotos por artículo.`);
      return;
    }
    setPhotoBusy(true);
    try {
      const prepared = await Promise.all(selected.map((file) => prepareImage(file)));
      const previewRows = await Promise.all(prepared.map(fileToDataUrl));
      setFiles((current) => [...current, ...prepared].slice(0, photoLimit));
      setPreviews((current) => [...current, ...previewRows].slice(0, photoLimit));
      const codes = await Promise.all(prepared.map(tryReadBarcode));
      const code = codes.find(Boolean);
      if (code) setBarcode((current) => current || code || '');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudieron preparar las fotos.');
    } finally {
      setPhotoBusy(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }

  async function removePhoto(index: number) {
    const remaining = files.filter((_, i) => i !== index);
    setFiles(remaining);
    setPreviews((current) => current.filter((_, i) => i !== index));
    setBarcode('');
    for (const photo of remaining) {
      const code = await tryReadBarcode(photo);
      if (code) { setBarcode(code); break; }
    }
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    setFiles((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setPreviews((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function identificationSeed(result: AiIdentification): InventoryDraft {
    return {
      ...EMPTY_DRAFT,
      title: result.title,
      type: result.type,
      status: 'collection',
      currency: 'EUR',
      condition: result.condition || 'like-new',
      franchise: result.franchise,
      character: result.character,
      manufacturer: result.manufacturer,
      line: result.line,
      edition: result.edition,
      issueNumber: result.issueNumber,
      volume: result.volume,
      setName: result.setName,
      cardNumber: result.cardNumber,
      rarity: result.rarity,
      platform: result.platform,
      year: result.year,
      barcode: result.barcode || barcode,
      isbn: result.isbn,
      sku: result.sku,
      country: result.country,
      language: result.language,
      hasBox: result.hasBox ?? false,
      sealed: result.sealed ?? false,
      signed: result.signed ?? false,
      graded: result.graded ?? false,
      gradingCompany: result.gradingCompany,
      grade: result.grade,
      tags: result.tags,
      aiConfidence: result.confidence,
      aiExplanation: result.explanation,
      identificationConfirmed: true
    };
  }

  async function analyzeAll() {
    if (!files.length || busy) return;
    setBusy(true);
    setStage('Identificando el artículo…');
    try {
      const identified = await identifyWithAi(files);
      let seed = identificationSeed(identified);
      setStage('Buscando precio y referencias…');
      try {
        const research = await investigate(seed);
        seed = {
          ...seed,
          ...(research.resolvedIdentity?.title ? {
            title: research.resolvedIdentity.title,
            manufacturer: seed.manufacturer || research.resolvedIdentity.manufacturer || '',
            line: seed.line || research.resolvedIdentity.line || '',
            character: seed.character || research.resolvedIdentity.character || '',
            franchise: seed.franchise || research.resolvedIdentity.franchise || '',
            sku: seed.sku || research.resolvedIdentity.sku || '',
            barcode: seed.barcode || research.resolvedIdentity.barcode || ''
          } : {}),
          research,
          currentValue: research.asking.median != null ? Number(research.asking.median.toFixed(2)) : null
        };
      } catch (error) {
        showToast(error instanceof Error ? `Identificado, pero sin tasación: ${error.message}` : 'Identificado, pero no se pudo obtener la tasación.');
      }
      onCreate(seed, files);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo analizar el artículo.');
    } finally {
      setStage('');
      setBusy(false);
    }
  }

  async function useBarcode() {
    if (!barcode.trim()) return;
    setBusy(true);
    try {
      const book = await lookupIsbn(barcode.trim());
      if (book) onCreate({ title: book.title, year: book.year, isbn: book.isbn, barcode: book.isbn, manufacturer: book.manufacturer, type: 'comic' }, files);
      else onCreate({ barcode: barcode.trim() }, files);
    } finally { setBusy(false); }
  }

  return (
    <section className="scan-page">
      <div className="page-heading"><div><span className="eyebrow">CAPTURA INTELIGENTE</span><h1>Escanear objeto</h1><p>Una sola acción identifica la pieza, busca referencias y calcula su valor estimado antes de abrir la ficha.</p></div></div>
      <div className="scan-layout">
        <div className="camera-card">
          <input ref={cameraInputRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />
          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />
          {previews.length ? <>
            <img className="scan-preview" src={previews[0]} alt="Vista principal del objeto"/>
            <div className="scan-photo-strip">
              {previews.map((preview, index) => <div className={`scan-photo-thumb ${index === 0 ? 'primary-photo' : ''}`} key={`${preview.slice(0, 30)}-${index}`}>
                <img src={preview} alt={`Foto ${index + 1}`}/><span>{index === 0 ? 'Principal' : `Foto ${index + 1}`}</span>
                <div className="scan-photo-controls"><button type="button" title="Mover a la izquierda" disabled={index === 0 || busy} onClick={() => movePhoto(index, -1)}>←</button><button type="button" title="Mover a la derecha" disabled={index === previews.length - 1 || busy} onClick={() => movePhoto(index, 1)}>→</button><button type="button" title="Eliminar foto" disabled={busy} onClick={() => removePhoto(index)}><X size={14}/></button></div>
              </div>)}
              {files.length < photoLimit && <button type="button" className="scan-add-photo" disabled={busy} onClick={() => cameraInputRef.current?.click()}><Camera/><span>Otra foto</span></button>}
            </div>
            <p className="scan-photo-help"><b>{files.length}/{photoLimit} fotos.</b> La primera es la referencia principal; las demás solo aportan códigos, trasera, caja y detalles.</p>
          </> : <div className="camera-placeholder"><div className="scan-frame"><ScanLine/></div><h2>Fotografía el artículo</h2><p>Empieza por el frontal. Si añades más fotos, úsalas para la trasera, etiquetas o código de barras.</p></div>}
          <div className="camera-actions"><button className="secondary" onClick={() => cameraInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy || busy}><Camera size={19}/>{files.length ? 'Hacer otra foto' : 'Abrir cámara'}</button><button className="secondary" onClick={() => uploadInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy || busy}><Upload size={19}/>{photoBusy ? 'Preparando…' : 'Subir fotos'}</button><button className="ai-button" onClick={analyzeAll} disabled={!files.length || busy || photoBusy}><WandSparkles size={19}/>{busy ? (stage || 'Analizando…') : `Analizar artículo${files.length > 1 ? ` · ${files.length} fotos` : ''}`}</button></div>
        </div>
        <div className="scan-side">
          <div className="panel scan-result"><div className="panel-head"><h2><Sparkles size={19}/> Análisis unificado</h2></div><div className="placeholder-copy"><Sparkles/><p>Al pulsar <b>Analizar artículo</b>, FrikiVault identifica el producto exacto, busca precios públicos comparables y abre directamente la ficha ya rellenada.</p>{busy && <p className="hint"><b>{stage}</b></p>}</div></div>
          <div className="panel barcode-box"><div className="panel-head"><h2><QrCode size={19}/> Código / ISBN</h2></div><p>FrikiVault intenta leer el código de cualquiera de las fotos. También puedes escribirlo.</p><div className="inline-field"><input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="EAN / UPC / ISBN"/><button onClick={useBarcode} disabled={busy || !barcode}>Buscar</button></div></div>
        </div>
      </div>
    </section>
  );
}
'''

s2,n=re.subn(r'function Scanner\([\s\S]*?\n}\n\nfunction Stats', scanner+'\nfunction Stats', s, count=1)
if n!=1: raise SystemExit('Scanner block not found')
s=s2

s=s.replace("const [research, setResearch] = useState<ResearchResult | undefined>(item?.research);", "const [research] = useState<ResearchResult | undefined>(item?.research || seed?.research);")
s=re.sub(r"\n  const \[researchBusy, setResearchBusy\] = useState\(false\);\n  const \[researchError, setResearchError\] = useState\(''\);",'',s)
s=re.sub(r"\n  async function researchItem\(\) \{[\s\S]*?\n  \}\n\n  function downloadQr", "\n\n  function downloadQr", s, count=1)

# Replace research panel with read-only analysis results: no second IA button.
panel=r'''          {item && <section className="research-panel">
            <div className="research-head"><div><h3 className="form-section-title"><Sparkles/> Análisis del artículo</h3><p className="muted">Identificación, referencias y valoración obtenidas en la misma captura inteligente.</p></div></div>
            {research ? <div className="research-result">
              {research.searchIdentity && <p className="muted"><b>Producto buscado:</b> {research.searchIdentity}</p>}
              {research.resolvedIdentity?.title && <p className="muted"><b>Producto resuelto:</b> {research.resolvedIdentity.title}</p>}
              {research.asking.median != null ? <div className="valuation-highlight"><span className="valuation-kicker">VALOR ESTIMADO ACTUAL</span><strong>{money(research.asking.median, research.asking.currency || 'EUR')}</strong><div className="valuation-range">Rango observado: {money(research.asking.min, research.asking.currency || 'EUR')} – {money(research.asking.max, research.asking.currency || 'EUR')}</div><small>{research.asking.label}</small></div> : <div className="valuation-highlight empty"><span className="valuation-kicker">VALOR ESTIMADO</span><strong>Sin precio automático todavía</strong><small>No se encontró un precio suficientemente exacto para esta pieza.</small></div>}
              <p>{research.summary}</p>
              <div className="market-summary"><div><span>Páginas útiles</span><b>{new Set(research.sources.map((source) => source.url)).size || '—'}</b></div><div><span>Precios detectados</span><b>{research.listings.length || '—'}</b></div><div><span>Comparables usados</span><b>{research.comparables.length || '—'}</b></div><div><span>Mediana</span><b>{research.asking.median == null ? '—' : money(research.asking.median)}</b></div><div><span>Ventas cerradas</span><b>{research.sold.available ? `${research.sold.count || 1}${research.sold.median != null ? ` · ${money(research.sold.median)}` : ''}` : 'No verificadas'}</b></div></div>
              {research.comparables.length > 0 && <div className="comparable-prices"><h4>Precios usados para el baremo</h4>{research.comparables.slice(0,8).map((listing) => <a className="comparable-price" key={listing.id} href={listing.url} target="_blank" rel="noreferrer"><span><b>{listing.title}</b><small>{listing.condition}</small></span><strong>{money(listing.price, listing.currency)}</strong></a>)}</div>}
              <div className="research-facts">{research.facts.slice(0, 8).map((fact) => <div key={`${fact.label}-${fact.sourceId}`}><b>{fact.label}</b><span>{fact.value}</span></div>)}</div>
              <div className="source-list"><a href={research.links.ebay} target="_blank" rel="noreferrer">eBay</a><a href={research.links.sold} target="_blank" rel="noreferrer">eBay vendidos</a>{research.links.priceCharting && <a href={research.links.priceCharting} target="_blank" rel="noreferrer">PriceCharting</a>}{research.links.stockx && <a href={research.links.stockx} target="_blank" rel="noreferrer">StockX</a>}{research.sources.slice(0,6).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>
              {research.warnings.map((warning) => <small className="warning-line" key={warning}>{warning}</small>)}
            </div> : <p className="muted">Este artículo no tiene análisis unificado porque no se creó desde el escáner inteligente.</p>}
          </section>}'''
s2,n=re.subn(r'          \{item && <section className="research-panel">[\s\S]*?          </section>\}',panel,s,count=1)
if n!=1: raise SystemExit('Research panel not found')
s=s2
app.write_text(s)

c=core.read_text()

# Keep the search string short and deterministic.
c2,n=re.subn(r"export function buildResearchIdentity\(item\)\{[\s\S]*?\n\}",r'''export function buildResearchIdentity(item){
 const title=!isGenericProductTitle(item?.title)?String(item.title).trim():'';
 const manufacturer=String(item?.manufacturer||'').trim();
 const line=String(item?.line||'').trim();
 const character=String(item?.character||'').trim();
 const sku=String(item?.sku||'').trim();
 const barcode=String(item?.barcode||'').replace(/\s/g,'');
 const isbn=String(item?.isbn||'').trim();
 const fallback=[item?.type==='funko'?'Funko':'',manufacturer,line,character].filter(Boolean).join(' ');
 return [title||fallback,sku?`ref ${sku}`:'',barcode?`EAN ${barcode}`:'',isbn?`ISBN ${isbn}`:''].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}''',c,count=1)
if n!=1: raise SystemExit('buildResearchIdentity not found')
c=c2

# Force non-thinking for OpenAI-format chat calls.
c=c.replace("body:JSON.stringify({model,messages,response_format:{type:'json_object'},max_tokens:maxTokens,stream:false})", "body:JSON.stringify({model,messages,response_format:{type:'json_object'},max_tokens:maxTokens,stream:false,thinking:{type:'disabled'},reasoning_effort:'none'})")
# Force non-thinking for Anthropic-format web search and reduce search fanout.
c=c.replace("max_tokens:2600,", "max_tokens:1400,\n   reasoning:{effort:'none'},")
c=c.replace("max_uses:searchMode==='identity'?5:8,", "max_uses:5,")
c=c.replace("signal:AbortSignal.timeout(90000)", "signal:AbortSignal.timeout(50000)")

# One multimodal call for all photos. First photo is the anchor; extras only supplement.
identify=r'''export async function identify(input,config){
 const images=(Array.isArray(input)?input:[input]).filter(x=>typeof x==='string'&&x.startsWith('data:image/')).slice(0,5);
 if(!images.length)throw new Error('Añade al menos una foto válida del artículo.');
 const content=[
  {type:'text',text:`Identifica UN único artículo de colección usando ${images.length} foto(s). La FOTO 1 es la vista PRINCIPAL y manda para el nombre comercial. Las fotos 2-${images.length} son solo evidencia complementaria para trasera, códigos, caja, edición y detalles. Nunca sustituyas un nombre comercial visible/identificable en la foto principal por una descripción de una foto trasera como “caja”, “dorso”, “barcode”, “código de barras” o “Item No.”. En Funko, Item No./Item Number pertenece a sku; el número Pop # solo se usa si está respaldado. Devuelve la ficha exacta y no inventes datos.`},
  ...images.map((url,index)=>({type:'image_url',image_url:{url},detail:index===0?'high':'auto'}))
 ];
 const result=await deepseek([
  {role:'system',content:`Devuelve SOLO JSON con title,type,franchise,character,manufacturer,line,edition,issueNumber,volume,setName,cardNumber,rarity,platform,year,barcode,isbn,sku,country,language,condition,hasBox,sealed,signed,graded,gradingCompany,grade,confidence,explanation,tags. type: ${itemTypes.join(',')}. title debe ser el nombre comercial/canónico real, jamás una descripción de la fotografía. Datos desconocidos: cadena vacía; booleanos desconocidos: null; year null. confidence 0..1. No inventes precios ni datos personales.`},
  {role:'user',content}
 ],{...config,maxTokens:1200,timeoutMs:35000,retries:1});
 return finalizeIdentification(result,[result]);
}'''
c2,n=re.subn(r"export async function identify\(input,config\)\{[\s\S]*?\n\}\n\nexport async function research", identify+'\n\nexport async function research',c,count=1)
if n!=1: raise SystemExit('identify not found')
c=c2

# Helper to keep only exact/relevant pages and derive a canonical title without another AI call.
insert=r'''
function relevantSourcesForItem(item,rows){
 const stop=new Set(['the','and','for','with','from','funko','pop','movies','movie','figure','figura','edition','edicion','price','prices','buy','shop']);
 const titleTokens=normalizeComparableText(!isGenericProductTitle(item?.title)?item.title:`${item?.manufacturer||''} ${item?.line||''} ${item?.character||''}`).split(' ').filter(x=>x.length>=3&&!stop.has(x)&&!/^\d+$/.test(x));
 const ids=[item?.sku,item?.barcode,item?.isbn,item?.cardNumber,item?.issueNumber,...(String(item?.title||'').match(/\d{2,}/g)||[])].filter(Boolean).map(normalizeComparableText);
 return rows.filter(source=>{
  const hay=normalizeComparableText(`${source.title||''} ${source.snippet||''}`);
  if(ids.some(id=>id&&hay.includes(id)))return true;
  const hits=titleTokens.filter(token=>hay.includes(token)).length;
  return titleTokens.length<=1?hits===titleTokens.length&&hits>0:hits>=2&&hits/titleTokens.length>=.45;
 }).slice(0,10);
}

function canonicalTitleFromSources(item,sources){
 if(!isGenericProductTitle(item?.title))return String(item.title).trim();
 const ids=[item?.sku,item?.barcode,item?.isbn].filter(Boolean).map(normalizeComparableText);
 const candidates=sources.map(source=>{
  const title=String(source.title||'').replace(/\s*[|–—-]\s*(PriceCharting|eBay|StockX|Amazon|Wallapop).*$/i,'').replace(/\s+/g,' ').trim();
  const hay=normalizeComparableText(`${source.title||''} ${source.snippet||''}`);
  let score=specificTitleScore(title);
  if(ids.some(id=>id&&hay.includes(id)))score+=12;
  if(/funko\s*pop|pop!/i.test(title))score+=3;
  if(/€|\$|\bEUR\b|\bUSD\b/.test(title))score-=2;
  return {title,score};
 }).filter(row=>row.title&&!isGenericProductTitle(row.title)&&row.title.length<=180).sort((a,b)=>b.score-a.score);
 return candidates[0]?.score>=4?candidates[0].title:'';
}
'''
marker='function conservativeFallbackComparables(item,listings,sources){'
if marker not in c: raise SystemExit('marker missing')
c=c.replace(marker,insert+'\n'+marker,1)

research=r'''export async function research(input,config){
 let {item}=researchSchema.parse(input);
 const isFunko=item.type==='funko'||/\bfunko\b|\bpop!?\b/i.test(`${item.title||''} ${item.manufacturer||''} ${item.line||''}`);
 let identity=buildResearchIdentity(item)||String(item.title||'').trim();
 const fetcher=config.fetcher||fetch;
 const warnings=[];
 const priceChartingSupported=isFunko||['game','card','comic','lego'].includes(item.type);
 let webSources=[];
 let priceChartingListings=[];
 let usdEurRate=null;

 // PriceCharting API, si existe token, es una petición HTTP directa: no añade otra llamada de IA.
 if(config.priceChartingToken&&priceChartingSupported){
  usdEurRate=await fetchUsdEurRate(fetcher);
  try{
   const pc=await fetchPriceChartingGuide(item,config.priceChartingToken,fetcher,usdEurRate);
   webSources.push(...pc.sources);
   priceChartingListings.push(...pc.listings);
  }catch{}
 }

 // UNA sola búsqueda web de precios. El nombre/referencia se pasa literalmente y no se
 // vuelve a ampliar con consultas distintas para cada marketplace.
 if(config.key){
  try{
   const exactQuery=`${identity} precio PriceCharting StockX eBay sold completed`.trim();
   const found=normalizeSources(await deepseekWebSearch(exactQuery,{...config,searchMode:isFunko?'funko':'general'}),'price-search');
   webSources=uniqueSources([...webSources,...relevantSourcesForItem(item,keepUsableSources(found))]);
  }catch(error){
   warnings.push(error instanceof Error?`Búsqueda de precios: ${error.message}`:'No se pudo completar la búsqueda de precios.');
  }
 } else if(!priceChartingListings.length) warnings.push('No hay proveedor de búsqueda pública configurado.');

 // Si la visión dejó un título genérico pero los códigos llevan a una página exacta,
 // tomamos el nombre comercial de esa evidencia SIN hacer otra llamada de IA.
 const canonical=canonicalTitleFromSources(item,webSources);
 let resolvedIdentity;
 if(canonical&&canonical!==item.title){
  item={...item,title:canonical};
  identity=buildResearchIdentity(item)||canonical;
  resolvedIdentity={title:canonical,manufacturer:item.manufacturer||'',line:item.line||'',character:item.character||'',franchise:item.franchise||'',sku:item.sku||'',barcode:item.barcode||''};
 }

 if(usdEurRate==null&&webSources.some(source=>/\$|\bUSD\b/i.test(`${source.title} ${source.snippet}`)))usdEurRate=await fetchUsdEurRate(fetcher);
 const listings=[...parsePublicListings(webSources.filter(source=>source.kind!=='pricecharting-api'),{USD_EUR:usdEurRate}),...priceChartingListings];
 const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,12);
 const asking=summarizeListings(comparables);
 const sources=uniqueSources(webSources).slice(0,12);

 if(!listings.length)warnings.push('No se encontró un precio visible para el producto exacto; se han descartado páginas bloqueadas, ambiguas o sin importe.');
 else if(!comparables.length)warnings.push('Se detectaron precios, pero ninguno coincide con suficiente precisión con esta referencia/edición.');

 let summary;
 let facts=[];
 if(asking.count){
  const range=asking.min===asking.max?euro(asking.min):`${euro(asking.min)} – ${euro(asking.max)}`;
  const baremo=`${range}; mediana ${euro(asking.median)} con ${asking.count} comparable${asking.count===1?'':'s'} exacto${asking.count===1?'':'s'}.`;
  summary=`Valoración calculada localmente a partir de precios públicos del producto exacto. ${baremo}`;
  facts=[{label:'Baremo de mercado',value:baremo,sourceId:comparables[0].id},...comparables.slice(0,6).map(row=>({label:'Precio comparable',value:`${euro(row.price)} · ${row.condition}`,sourceId:row.id}))];
 }else{
  summary=`Se buscaron precios usando una única identidad: “${identity}”. ${sources.length} página${sources.length===1?'':'s'} útil${sources.length===1?'':'es'} y ${listings.length} precio${listings.length===1?'':'s'} detectado${listings.length===1?'':'s'}; ninguno permite todavía un baremo suficientemente exacto.`;
 }

 const soldRows=comparables.filter(x=>x.sourceType==='sold'&&x.currency==='EUR');
 const soldSummary=summarizeListings(soldRows);
 return {
  checkedAt:new Date().toISOString(),
  searchIdentity:identity,
  resolvedIdentity,
  summary,
  facts,
  sources,
  listings,
  comparables,
  asking,
  sold:{available:soldRows.length>0,count:soldRows.length,median:soldSummary.median,reason:soldRows.length?'Ventas cerradas detectadas entre los comparables exactos.':'No se detectó una venta cerrada verificable entre los comparables exactos.'},
  warnings,
  links:{
   ebay:'https://www.ebay.es/sch/i.html?_nkw='+encodeURIComponent(identity),
   sold:'https://www.ebay.es/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw='+encodeURIComponent(identity),
   web:'https://www.google.com/search?q='+encodeURIComponent(identity+' precio'),
   ...(priceChartingSupported?{priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity)}:{}),
   ...(isFunko?{stockx:'https://stockx.com/search?s='+encodeURIComponent(identity)}:{})
  }
 };
}'''
c2,n=re.subn(r"export async function research\(input,config\)\{[\s\S]*?\n\}\s*$",research+'\n',c,count=1)
if n!=1: raise SystemExit('research not found')
c=c2
core.write_text(c)

# Replace tests that encoded the old N+1 visual-call architecture, and add unified-flow regressions.
t=tests.read_text()
start=t.index('// Con varias fotos: una consulta visual por foto + una fusión textual final.')
end=t.index('const noSources=await research', start)
newtests=r'''// Con varias fotos: UNA sola llamada multimodal. La primera foto es principal y las demás complementarias.
let unifiedIdentifyCalls=0;
let unifiedImages=0;
const unifiedIdentifyFetch=async(_url,init)=>{
 unifiedIdentifyCalls++;
 const body=JSON.parse(init.body);
 assert.equal(body.thinking?.type,'disabled');
 assert.equal(body.reasoning_effort,'none');
 unifiedImages=body.messages[1].content.filter(block=>block.type==='image_url').length;
 const result={title:'Funko Pop! Éomer #1982',type:'funko',franchise:'The Lord of the Rings',character:'Éomer',manufacturer:'Funko',line:'Pop! Movies',sku:'90310',confidence:.99,explanation:'Frontal como vista principal; trasera usada solo para la referencia'};
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'content-type':'application/json'}});
};
const mergedIdentification=await identify(['data:image/jpeg;base64,AAAA','data:image/jpeg;base64,BBBB','data:image/jpeg;base64,CCCC'],{key:'test',fetcher:unifiedIdentifyFetch});
assert.equal(unifiedIdentifyCalls,1);
assert.equal(unifiedImages,3);
assert.equal(mergedIdentification.title,'Funko Pop! Éomer #1982');
assert.equal(mergedIdentification.sku,'90310');

'''
t=t[:start]+newtests+t[end:]
# Old malformed-summary test expected a second chat-completion. Research no longer asks the IA to summarize.
t=t.replace("assert.equal(fallbackChatCalls,1);", "assert.equal(fallbackChatCalls,0);")
t=t.replace("assert.match(fallbackResearch.summary,/conserva los datos verificables/i);\nassert.ok(fallbackResearch.warnings.some(x=>/Resumen IA/i.test(x)));", "assert.match(fallbackResearch.summary,/Valoración calculada localmente|única identidad/i);")
# Add source-level assertions for the unified UX and no second research button.
t=t.replace("assert.match(appSource,/valuation-highlight/);", "assert.match(appSource,/valuation-highlight/);\nassert.match(appSource,/Analizar artículo/);\nassert.doesNotMatch(appSource,/Confirmar e investigar|Actualizar investigación/);")
t=t.replace("assert.match(currentCoreSource,/PRIMERA FUENTE: API oficial de PriceCharting/);", "assert.match(currentCoreSource,/UNA sola búsqueda web de precios/);\nassert.match(currentCoreSource,/thinking:\{type:'disabled'\}/);")
tests.write_text(t)
