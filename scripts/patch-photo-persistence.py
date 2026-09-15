from pathlib import Path

# 1) Firestore: verify the document after saving photos.
p = Path('src/lib/inventory.ts')
text = p.read_text()
text = text.replace("  doc,\n  onSnapshot,", "  doc,\n  getDocFromServer,\n  onSnapshot,")
old = '''export async function saveItem(draft: InventoryDraft, id?: string) {
  if (demoMode || !db || !auth?.currentUser) return saveDemo(draft, id).id;
  const uid = auth.currentUser.uid;
  const payload = { ...draft, updatedAt: serverTimestamp() };
  if (id) {
    await setDoc(doc(db, 'users', uid, 'items', id), payload, { merge: true });
    return id;
  }
  const created = await addDoc(collection(db, 'users', uid, 'items'), {
    ...payload,
    createdAt: serverTimestamp()
  });
  return created.id;
}
'''
new = '''export async function saveItem(draft: InventoryDraft, id?: string) {
  if (demoMode || !db || !auth?.currentUser) return saveDemo(draft, id).id;
  const uid = auth.currentUser.uid;
  const payload = { ...draft, updatedAt: serverTimestamp() };
  let savedId = id;
  if (savedId) {
    await setDoc(doc(db, 'users', uid, 'items', savedId), payload, { merge: true });
  } else {
    const created = await addDoc(collection(db, 'users', uid, 'items'), {
      ...payload,
      createdAt: serverTimestamp()
    });
    savedId = created.id;
  }

  // No damos el guardado por bueno hasta comprobar desde el servidor que las fotos
  // realmente quedaron dentro del documento. Evita falsos "Guardado" en iOS/Safari.
  const expectedPhotos = (draft.imageUrls || []).filter(Boolean).length;
  if (expectedPhotos) {
    const stored = await getDocFromServer(doc(db, 'users', uid, 'items', savedId));
    const storedPhotos = Array.isArray(stored.data()?.imageUrls) ? stored.data()!.imageUrls.filter(Boolean).length : 0;
    if (storedPhotos != expectedPhotos) {
      throw new Error(`Firebase guardó ${storedPhotos} de ${expectedPhotos} fotos. No cierres la ficha y vuelve a intentarlo.`);
    }
  }
  return savedId;
}
'''
if old not in text:
    raise SystemExit('No se encontró saveItem esperado')
text = text.replace(old, new)
p.write_text(text)

# 2) UI: turn temporary camera Files into persistent data URLs immediately on entry.
p = Path('src/App.tsx')
text = p.read_text()
old_state = '''  const [draft, setDraft] = useState<InventoryDraft>(initial);
  const [photos, setPhotos] = useState<File[]>(initialPhotos);
  const [previews, setPreviews] = useState<string[]>(initial.imageUrls || []);
  const [research, setResearch] = useState<ResearchResult | undefined>(item?.research);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    if (!initialPhotos.length) return;
    let active = true;
    Promise.all(initialPhotos.map(fileToDataUrl)).then((urls) => { if (active) setPreviews((p) => [...p, ...urls]); });
    return () => { active = false; };
  }, []);
'''
new_state = '''  const [draft, setDraft] = useState<InventoryDraft>(initial);
  const [previews, setPreviews] = useState<string[]>(initial.imageUrls || []);
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const initialPhotosHandled = useRef(false);
  const [research, setResearch] = useState<ResearchResult | undefined>(item?.research);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    if (!initialPhotos.length || initialPhotosHandled.current) return;
    initialPhotosHandled.current = true;
    let active = true;
    setPhotoPreparing(true);
    setPhotoError('');
    Promise.all(initialPhotos.slice(0, maxCloudPhotos()).map((file) => uploadItemImage(file)))
      .then((uploaded) => {
        if (!active) return;
        const urls = uploaded.map((x) => x.url).filter(Boolean);
        const paths = uploaded.map((x) => x.path).filter(Boolean);
        setDraft((current) => ({
          ...current,
          imageUrls: [...(current.imageUrls || []), ...urls].slice(0, maxCloudPhotos()),
          imagePaths: [...(current.imagePaths || []), ...paths]
        }));
        setPreviews((current) => [...current, ...urls].slice(0, maxCloudPhotos()));
      })
      .catch((error) => { if (active) setPhotoError(error instanceof Error ? error.message : 'No se pudieron preparar las fotos para guardar.'); })
      .finally(() => { if (active) setPhotoPreparing(false); });
    return () => { active = false; };
  }, [initialPhotos]);
'''
if old_state not in text:
    raise SystemExit('No se encontró bloque de estado de fotos')
text = text.replace(old_state, new_state)

old_add = '''  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const existing = (draft.imageUrls || []).length;
    const limit = maxCloudPhotos();
    const raw = [...files].slice(0, Math.max(0, limit - existing - photos.length));
    const next = await Promise.all(raw.map((file) => prepareImage(file)));
    setPhotos((p) => [...p, ...next]);
    const nextPreviews = await Promise.all(next.map(fileToDataUrl));
    setPreviews((p) => [...p, ...nextPreviews]);
  }
'''
new_add = '''  async function addPhotos(files: FileList | null) {
    if (!files || photoPreparing) return;
    const existing = (draft.imageUrls || []).length;
    const limit = maxCloudPhotos();
    const raw = [...files].slice(0, Math.max(0, limit - existing));
    if (!raw.length) return;
    setPhotoPreparing(true);
    setPhotoError('');
    try {
      const prepared = await Promise.all(raw.map((file) => prepareImage(file)));
      const uploaded = await Promise.all(prepared.map((file) => uploadItemImage(file)));
      const urls = uploaded.map((x) => x.url).filter(Boolean);
      const paths = uploaded.map((x) => x.path).filter(Boolean);
      setDraft((current) => ({
        ...current,
        imageUrls: [...(current.imageUrls || []), ...urls].slice(0, limit),
        imagePaths: [...(current.imagePaths || []), ...paths]
      }));
      setPreviews((current) => [...current, ...urls].slice(0, limit));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'No se pudieron preparar las fotos para guardar.');
    } finally {
      setPhotoPreparing(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  }
'''
if old_add not in text:
    raise SystemExit('No se encontró addPhotos esperado')
text = text.replace(old_add, new_add)

old_submit = '''      // Primero procesamos TODAS las fotos y solo después escribimos la ficha.
      // Así nunca queda creado un artículo a medias sin sus imágenes si una compresión falla.
      const uploaded = await Promise.all(photos.map((file) => uploadItemImage(file)));
      const finalDraft: InventoryDraft = {
        ...baseDraft,
        research,
        imageUrls: [...(baseDraft.imageUrls || []), ...uploaded.map((x) => x.url)],
        imagePaths: [...(baseDraft.imagePaths || []), ...uploaded.map((x) => x.path).filter(Boolean)]
      };
      await saveItem(finalDraft, item?.id);
'''
new_submit = '''      if (photoPreparing) throw new Error('Espera a que terminen de prepararse las fotos.');
      if (photoError) throw new Error(photoError);
      const finalDraft: InventoryDraft = { ...baseDraft, research };
      await saveItem(finalDraft, item?.id);
'''
if old_submit not in text:
    raise SystemExit('No se encontró submit de fotos esperado')
text = text.replace(old_submit, new_submit)

old_photo_section = '''          <section className="photo-section"><div className="photo-strip">{previews.map((url,i)=><div className="photo-thumb" key={`${url.slice(0,25)}-${i}`}><img src={url}/></div>)}<button type="button" className="add-photo" onClick={()=>photoRef.current?.click()}><ImagePlus/><span>Foto</span></button></div><input ref={photoRef} hidden type="file" accept="image/*" capture="environment" multiple onChange={(e)=>addPhotos(e.target.files)}/></section>
'''
new_photo_section = '''          <section className="photo-section"><div className="photo-strip">{previews.map((url,i)=><div className="photo-thumb" key={`${url.slice(0,25)}-${i}`}><img src={url}/></div>)}<button type="button" className="add-photo" disabled={photoPreparing || previews.length >= maxCloudPhotos()} onClick={()=>photoRef.current?.click()}><ImagePlus/><span>{photoPreparing ? 'Procesando…' : 'Foto'}</span></button></div><input ref={photoRef} hidden type="file" accept="image/*" capture="environment" multiple onChange={(e)=>addPhotos(e.target.files)}/>{photoPreparing && <small className="muted">Preparando las fotos para guardarlas en Firebase…</small>}{photoError && <div className="error-box">{photoError}</div>}</section>
'''
if old_photo_section not in text:
    raise SystemExit('No se encontró photo-section esperado')
text = text.replace(old_photo_section, new_photo_section)

old_button = '''<button className="primary" disabled={busy || !draft.title.trim()}><Check size={18}/>{busy ? 'Guardando…':'Guardar'}</button>'''
new_button = '''<button className="primary" disabled={busy || photoPreparing || !!photoError || !draft.title.trim()}><Check size={18}/>{busy ? 'Guardando…' : photoPreparing ? 'Preparando fotos…' : 'Guardar'}</button>'''
if old_button not in text:
    raise SystemExit('No se encontró botón Guardar')
text = text.replace(old_button, new_button)
p.write_text(text)

# 3) Regression checks.
p = Path('tests/core.mjs')
tests = p.read_text()
start = tests.index('// Regresión: las fotos nuevas se procesan antes de guardar')
end = tests.index("\n\nconsole.log('core tests ok');", start)
replacement = '''// Regresión: las fotos se convierten a datos persistentes antes de pulsar Guardar.
const appSource=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const inventorySource=readFileSync(new URL('../src/lib/inventory.ts',import.meta.url),'utf8');
assert.match(appSource,/initialPhotos\.slice\(0, maxCloudPhotos\(\)\)\.map\(\(file\) => uploadItemImage\(file\)\)/);
assert.match(appSource,/prepared\.map\(\(file\) => uploadItemImage\(file\)\)/);
assert.match(appSource,/imageUrls: \[\.\.\.\(current\.imageUrls \|\| \[\]\), \.\.\.urls\]\.slice\(0, limit\)/);
assert.doesNotMatch(appSource,/const \[photos, setPhotos\]/);
assert.match(appSource,/disabled=\{busy \|\| photoPreparing \|\| !!photoError/);
assert.match(inventorySource,/getDocFromServer/);
assert.match(inventorySource,/Firebase guardó \$\{storedPhotos\} de \$\{expectedPhotos\} fotos/);
'''
tests = tests[:start] + replacement + tests[end:]
p.write_text(tests)
