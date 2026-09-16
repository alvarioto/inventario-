from pathlib import Path

# ---- inventory.ts: adaptive photo compression, never reject a normal photo just for size ----
p = Path('src/lib/inventory.ts')
s = p.read_text()
s = s.replace("const TARGET_PHOTO_BYTES = 80 * 1024;", "const TARGET_PHOTO_BYTES = 92 * 1024;")
s = s.replace("const url = await compressPhotoToDataUrl(file, TARGET_PHOTO_BYTES, 1280);", "const url = await compressPhotoToDataUrl(file, TARGET_PHOTO_BYTES, 1600);")
old = '''async function compressPhotoToDataUrl(file: File, targetBytes: number, maxDimension: number) {
  let loaded: LoadedImage | null = null;
  try {
    loaded = await loadImage(file);
    const scale = Math.min(1, maxDimension / Math.max(loaded.width, loaded.height));
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la foto');
    ctx.drawImage(loaded.source, 0, 0, width, height);

    let quality = 0.82;
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    while (blob && blob.size > targetBytes && quality > 0.34) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }
    if (!blob) throw new Error('No se pudo comprimir la foto');

    // Segundo escalado si la escena es especialmente compleja.
    if (blob.size > targetBytes * 1.25) {
      const shrink = Math.max(0.45, Math.sqrt(targetBytes / blob.size));
      const smaller = document.createElement('canvas');
      smaller.width = Math.max(420, Math.round(width * shrink));
      smaller.height = Math.max(420, Math.round(height * shrink));
      const sctx = smaller.getContext('2d');
      if (sctx) {
        sctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
        blob = await canvasToBlob(smaller, 'image/jpeg', 0.62) || blob;
      }
    }

    // Una foto en base64 crece aproximadamente un 33 %. Este margen mantiene las
    // cinco imágenes dentro del límite de Firestore junto con el resto de la ficha.
    if (blob.size > 120 * 1024) {
      throw new Error('La foto sigue siendo demasiado grande para guardarla. Hazla de nuevo con algo menos de detalle.');
    }

    return blobToDataUrl(blob);
  } finally {
    loaded?.close();
  }
}
'''
new = '''async function compressPhotoToDataUrl(file: File, targetBytes: number, maxDimension: number) {
  let loaded: LoadedImage | null = null;
  try {
    loaded = await loadImage(file);
    const initialScale = Math.min(1, maxDimension / Math.max(loaded.width, loaded.height));
    let width = Math.max(1, Math.round(loaded.width * initialScale));
    let height = Math.max(1, Math.round(loaded.height * initialScale));

    let canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    let ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la foto');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(loaded.source, 0, 0, width, height);

    // Primero conservamos la máxima resolución posible y bajamos calidad muy poco.
    // Solo cuando hace falta reducimos dimensiones gradualmente. Así una foto de un
    // iPhone de muchos megapíxeles nunca se rechaza por pesar demasiado.
    let quality = 0.9;
    let blob: Blob | null = null;
    for (let pass = 0; pass < 18; pass++) {
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (!blob) throw new Error('No se pudo comprimir la foto');
      if (blob.size <= targetBytes) return blobToDataUrl(blob);

      if (quality > 0.68) {
        quality = Math.max(0.68, quality - 0.055);
        continue;
      }

      const ratio = Math.min(0.9, Math.max(0.72, Math.sqrt(targetBytes / blob.size) * 0.96));
      const nextWidth = Math.max(420, Math.round(width * ratio));
      const nextHeight = Math.max(420, Math.round(height * ratio));
      if (nextWidth === width && nextHeight === height) {
        quality = Math.max(0.42, quality - 0.06);
        continue;
      }

      const smaller = document.createElement('canvas');
      smaller.width = nextWidth;
      smaller.height = nextHeight;
      const smallerCtx = smaller.getContext('2d');
      if (!smallerCtx) throw new Error('No se pudo redimensionar la foto');
      smallerCtx.imageSmoothingEnabled = true;
      smallerCtx.imageSmoothingQuality = 'high';
      smallerCtx.drawImage(canvas, 0, 0, nextWidth, nextHeight);
      canvas = smaller;
      ctx = smallerCtx;
      width = nextWidth;
      height = nextHeight;
      quality = 0.82;
    }

    // Último salvavidas: incluso una imagen extremadamente compleja se adapta en vez
    // de impedir el guardado del artículo.
    const finalScale = Math.min(1, 720 / Math.max(width, height));
    if (finalScale < 1) {
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = Math.max(360, Math.round(width * finalScale));
      finalCanvas.height = Math.max(360, Math.round(height * finalScale));
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) throw new Error('No se pudo adaptar la foto');
      finalCtx.imageSmoothingEnabled = true;
      finalCtx.imageSmoothingQuality = 'high';
      finalCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);
      blob = await canvasToBlob(finalCanvas, 'image/jpeg', 0.58);
    }
    if (!blob) throw new Error('No se pudo preparar la foto para guardar.');
    return blobToDataUrl(blob);
  } finally {
    loaded?.close();
  }
}
'''
if old not in s:
    raise SystemExit('compression block not found')
s = s.replace(old, new)
p.write_text(s)

# ---- App.tsx: gallery upload in scanner/form + explicit save confirmation ----
p = Path('src/App.tsx')
s = p.read_text()

s = s.replace("  const [toast, setToast] = useState('');", "  const [toast, setToast] = useState('');\n  const [saveNotice, setSaveNotice] = useState('');")
old = """          onSaved={() => { showToast('Guardado'); setFormItem(undefined); setFormSeed(undefined); setFormPhotos([]); }}"""
new = """          onSaved={() => { setFormItem(undefined); setFormSeed(undefined); setFormPhotos([]); setSaveNotice('El artículo y sus fotos se han guardado correctamente.'); }}"""
if old not in s:
    raise SystemExit('App onSaved block not found')
s = s.replace(old, new)
old = """      {toast && <div className=\"toast\"><Check size={17} />{toast}</div>}
    </div>"""
new = """      {toast && <div className=\"toast\"><Check size={17} />{toast}</div>}
      {saveNotice && <div className=\"result-modal-backdrop\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Guardado correctamente\"><div className=\"result-modal success\"><div className=\"result-modal-icon\"><Check/></div><h3>Guardado correctamente</h3><p>{saveNotice}</p><button className=\"primary wide\" onClick={() => setSaveNotice('')}>Aceptar</button></div></div>}
    </div>"""
if old not in s:
    raise SystemExit('App toast block not found')
s = s.replace(old, new)

# Scanner: separate camera and gallery inputs, support several uploaded images.
s = s.replace("  const inputRef = useRef<HTMLInputElement | null>(null);", "  const cameraInputRef = useRef<HTMLInputElement | null>(null);\n  const uploadInputRef = useRef<HTMLInputElement | null>(null);\n  const [photoBusy, setPhotoBusy] = useState(false);")
old = '''  async function addPicked(next: File | null) {
    if (!next) return;
    if (files.length >= photoLimit) {
      showToast(`Puedes usar hasta ${photoLimit} fotos por artículo.`);
      return;
    }
    setResult(null);
    const prepared = await prepareImage(next);
    const preview = await fileToDataUrl(prepared);
    setFiles((current) => [...current, prepared]);
    setPreviews((current) => [...current, preview]);
    const code = await tryReadBarcode(prepared);
    if (code) setBarcode((current) => current || code);
    if (inputRef.current) inputRef.current.value = '';
  }
'''
new = '''  async function addPicked(picked: File[]) {
    if (!picked.length || photoBusy) return;
    const room = Math.max(0, photoLimit - files.length);
    const selected = picked.filter((file) => !file.type || file.type.startsWith('image/')).slice(0, room);
    if (!selected.length) {
      if (files.length >= photoLimit) showToast(`Puedes usar hasta ${photoLimit} fotos por artículo.`);
      return;
    }
    setPhotoBusy(true);
    setResult(null);
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
'''
if old not in s:
    raise SystemExit('Scanner addPicked block not found')
s = s.replace(old, new)
old = '''          <input ref={inputRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => addPicked(e.target.files?.[0] || null)} />'''
new = '''          <input ref={cameraInputRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />
          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />'''
if old not in s:
    raise SystemExit('Scanner input block not found')
s = s.replace(old, new)
s = s.replace("onClick={() => inputRef.current?.click()}><ImagePlus/><span>Otra foto</span>", "onClick={() => cameraInputRef.current?.click()}><Camera/><span>Otra foto</span>")
old = '''          <div className="camera-actions"><button className="secondary" onClick={() => inputRef.current?.click()} disabled={files.length >= photoLimit}><Camera size={19}/>{files.length ? 'Hacer otra foto' : 'Abrir cámara'}</button><button className="ai-button" onClick={identify} disabled={!files.length || busy}><WandSparkles size={19}/>{busy ? 'Analizando…' : `Identificar con IA${files.length > 1 ? ` · ${files.length} fotos` : ''}`}</button></div>'''
new = '''          <div className="camera-actions"><button className="secondary" onClick={() => cameraInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy}><Camera size={19}/>{files.length ? 'Hacer otra foto' : 'Abrir cámara'}</button><button className="secondary" onClick={() => uploadInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy}><Upload size={19}/>{photoBusy ? 'Preparando…' : 'Subir fotos'}</button><button className="ai-button" onClick={identify} disabled={!files.length || busy || photoBusy}><WandSparkles size={19}/>{busy ? 'Analizando…' : `Identificar con IA${files.length > 1 ? ` · ${files.length} fotos` : ''}`}</button></div>'''
if old not in s:
    raise SystemExit('Scanner actions block not found')
s = s.replace(old, new)

# Item form: camera and gallery are separate; errors during save get a modal.
s = s.replace("  const [photoError, setPhotoError] = useState('');", "  const [photoError, setPhotoError] = useState('');\n  const [saveErrorModal, setSaveErrorModal] = useState('');")
s = s.replace("  const photoRef = useRef<HTMLInputElement | null>(null);", "  const cameraRef = useRef<HTMLInputElement | null>(null);\n  const galleryRef = useRef<HTMLInputElement | null>(null);")
s = s.replace("      if (photoRef.current) photoRef.current.value = '';", "      if (cameraRef.current) cameraRef.current.value = '';\n      if (galleryRef.current) galleryRef.current.value = '';")
old = '''    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'No se pudo guardar el artículo.');
    } finally { setBusy(false); }
'''
new = '''    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el artículo.';
      setPhotoError(message);
      setSaveErrorModal(message);
    } finally { setBusy(false); }
'''
if old not in s:
    raise SystemExit('submit catch block not found')
s = s.replace(old, new, 1)
old = '''          <section className="photo-section"><div className="photo-strip">{previews.map((url,i)=><div className="photo-thumb" key={`${url.slice(0,25)}-${i}`}><img src={url}/></div>)}<button type="button" className="add-photo" disabled={photoPreparing || previews.length >= maxCloudPhotos()} onClick={()=>photoRef.current?.click()}><ImagePlus/><span>{photoPreparing ? 'Procesando…' : 'Foto'}</span></button></div><input ref={photoRef} hidden type="file" accept="image/*" capture="environment" multiple onChange={(e)=>addPhotos(e.target.files)}/>{photoPreparing && <small className="muted">Preparando las fotos para guardarlas en Firebase…</small>}{photoError && <div className="error-box">{photoError}</div>}</section>'''
new = '''          <section className="photo-section"><div className="photo-strip">{previews.map((url,i)=><div className="photo-thumb" key={`${url.slice(0,25)}-${i}`}><img src={url}/></div>)}<button type="button" className="add-photo" disabled={photoPreparing || previews.length >= maxCloudPhotos()} onClick={()=>cameraRef.current?.click()}><Camera/><span>{photoPreparing ? 'Procesando…' : 'Cámara'}</span></button><button type="button" className="add-photo" disabled={photoPreparing || previews.length >= maxCloudPhotos()} onClick={()=>galleryRef.current?.click()}><Upload/><span>Subir fotos</span></button></div><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(e)=>addPhotos(e.target.files)}/><input ref={galleryRef} hidden type="file" accept="image/*" multiple onChange={(e)=>addPhotos(e.target.files)}/>{photoPreparing && <small className="muted">Adaptando resolución y peso de las fotos automáticamente…</small>}{photoError && <div className="error-box">{photoError}</div>}</section>'''
if old not in s:
    raise SystemExit('ItemForm photo section not found')
s = s.replace(old, new)
old = '''      </form>
    </div>'''
new = '''      </form>
      {saveErrorModal && <div className="result-modal-backdrop nested" role="dialog" aria-modal="true" aria-label="Error al guardar" onMouseDown={(event) => event.stopPropagation()}><div className="result-modal error"><div className="result-modal-icon"><X/></div><h3>No se ha podido guardar</h3><p>{saveErrorModal}</p><button className="secondary wide" type="button" onClick={() => setSaveErrorModal('')}>Volver y reintentar</button></div></div>}
    </div>'''
# Replace only ItemForm's closing pair; it is the first exact occurrence after ItemForm in current source.
pos = s.find('function ItemForm(')
idx = s.find(old, pos)
if idx < 0:
    raise SystemExit('ItemForm closing block not found')
s = s[:idx] + s[idx:].replace(old, new, 1)
p.write_text(s)

# ---- CSS: confirmation modal and better photo action layout ----
p = Path('src/styles.css')
s = p.read_text()
extra = '''\n/* Save feedback + photo upload UX */\n.result-modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(3,7,16,.76);backdrop-filter:blur(7px);display:grid;place-items:center;padding:22px}.result-modal-backdrop.nested{z-index:1001}.result-modal{width:min(420px,100%);background:#11192a;border:1px solid var(--border);border-radius:20px;padding:26px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.48)}.result-modal-icon{width:58px;height:58px;border-radius:18px;margin:0 auto 15px;display:grid;place-items:center}.result-modal.success .result-modal-icon{background:rgba(71,215,163,.12);color:var(--green);border:1px solid rgba(71,215,163,.26)}.result-modal.error .result-modal-icon{background:rgba(255,102,128,.12);color:var(--red);border:1px solid rgba(255,102,128,.26)}.result-modal h3{font-family:'Space Grotesk';font-size:21px;margin:0 0 8px}.result-modal p{color:var(--muted);line-height:1.55;margin:0 0 20px}.photo-strip{align-items:stretch}.add-photo{min-width:92px}.camera-actions{flex-wrap:wrap}@media(max-width:700px){.camera-actions>button{flex:1 1 calc(50% - 8px)}.camera-actions>.ai-button{flex-basis:100%}.result-modal{padding:22px}}\n'''
if '/* Save feedback + photo upload UX */' not in s:
    s += extra
p.write_text(s)
