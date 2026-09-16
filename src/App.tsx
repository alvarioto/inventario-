import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Archive,
  BarChart3,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileJson,
  Filter,
  Gamepad2,
  Heart,
  ImagePlus,
  Layers3,
  LibraryBig,
  LogOut,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  QrCode,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  WandSparkles,
  X
} from 'lucide-react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import { auth, demoMode, isFirebaseConfigured } from './lib/firebase';
import {
  fileToDataUrl,
  identifyWithAi,
  lookupIsbn,
  prepareImage,
  removeItem,
  saveItem,
  subscribeItems,
  tryReadBarcode,
  uploadItemImage,
  maxCloudPhotos
} from './lib/inventory';
import { investigate } from './lib/api';
import { DirectAiSettings } from './components/DirectAiSettings';
import { importDemo } from './lib/demo';
import QRCode from 'qrcode';
import type { AiIdentification, InventoryDraft, InventoryItem, ItemStatus, ItemType, ResearchResult } from './types';
import { CONDITION_LABELS, ITEM_TYPE_LABELS, STATUS_LABELS } from './types';

type Tab = 'home' | 'collection' | 'scan' | 'wishlist' | 'stats' | 'settings';

const EMPTY_DRAFT: InventoryDraft = {
  title: '',
  type: 'figure',
  status: 'collection',
  currency: 'EUR',
  condition: 'like-new',
  sealed: false,
  hasBox: false,
  signed: false,
  graded: false,
  favorite: false,
  tags: [],
  imageUrls: [],
  imagePaths: []
};

const TYPE_ICONS: Record<ItemType, string> = {
  figure: '🦸', comic: '📚', manga: '📖', card: '🃏', game: '🎮', funko: '🧸', lego: '🧱', plush: '🐻',
  replica: '⚔️', movie: '🎬', merch: '🏆', other: '📦'
};

function money(value?: number | null, currency = 'EUR') {
  if (value == null || Number.isNaN(value)) return '—';
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}

function normalizeText(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(demoMode);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [tab, setTab] = useState<Tab>('home');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all');
  const [formItem, setFormItem] = useState<InventoryItem | null | undefined>(undefined);
  const [formSeed, setFormSeed] = useState<Partial<InventoryDraft> | undefined>();
  const [formPhotos, setFormPhotos] = useState<File[]>([]);
  const [toast, setToast] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  useEffect(() => {
    if (demoMode || !auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!demoMode && !user) return;
    return subscribeItems(setItems, (error) => showToast(`Error de Firebase: ${error.message}`));
  }, [user]);

  useEffect(() => {
    const itemId = new URLSearchParams(window.location.search).get('item');
    if (!itemId || formItem !== undefined) return;
    const found = items.find((item) => item.id === itemId);
    if (!found) return;
    window.history.replaceState({}, '', window.location.pathname);
    setFormItem(found);
  }, [items, formItem]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }

  if (!authReady) return <Splash />;
  if (!demoMode && !user) return <LoginScreen />;

  const openNew = (seed?: Partial<InventoryDraft>, photos: File[] = []) => {
    setFormSeed(seed);
    setFormPhotos(photos);
    setFormItem(null);
  };

  return (
    <div className="app-shell">
      <Sidebar tab={tab} setTab={setTab} count={items.length} />
      <div className="main-shell">
        <Topbar
          query={query}
          setQuery={setQuery}
          onAdd={() => openNew()}
          user={user}
          onSettings={() => setTab('settings')}
        />
        {demoMode && (
          <div className="demo-banner">
            <Sparkles size={16} /> <b>Modo demo local.</b> La interfaz funciona ya; al conectar tu proyecto Firebase se sincroniza en la nube y se activa la IA real.
          </div>
        )}
        <main className="content">
          {tab === 'home' && <Dashboard items={items} setTab={setTab} onEdit={(item) => setFormItem(item)} onAdd={openNew} />}
          {tab === 'collection' && (
            <Collection
              items={items.filter((x) => x.status === 'collection')}
              query={query}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              onEdit={(item) => setFormItem(item)}
              onAdd={openNew}
            />
          )}
          {tab === 'wishlist' && (
            <Collection
              items={items.filter((x) => x.status === 'wishlist')}
              query={query}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              onEdit={(item) => setFormItem(item)}
              onAdd={(seed) => openNew({ ...seed, status: 'wishlist' })}
              title="Wishlist"
              subtitle="Lo que te falta por cazar."
            />
          )}
          {tab === 'scan' && <Scanner onCreate={openNew} showToast={showToast} />}
          {tab === 'stats' && <Stats items={items} />}
          {tab === 'settings' && <SettingsPage items={items} user={user} showToast={showToast} />}
        </main>
        <MobileNav tab={tab} setTab={setTab} onScan={() => setTab('scan')} />
      </div>

      {formItem !== undefined && (
        <ItemForm
          item={formItem}
          seed={formSeed}
          initialPhotos={formPhotos}
          onClose={() => { setFormItem(undefined); setFormSeed(undefined); setFormPhotos([]); }}
          onSaved={() => { setFormItem(undefined); setFormSeed(undefined); setFormPhotos([]); setTab('home'); setQuery(''); requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })); setSaveNotice('El artículo y sus fotos se han guardado correctamente.'); }}
          onDeleted={() => { showToast('Eliminado'); setFormItem(undefined); setFormSeed(undefined); setFormPhotos([]); }}
        />
      )}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
      {saveNotice && <div className="result-modal-backdrop" role="dialog" aria-modal="true" aria-label="Guardado correctamente"><div className="result-modal success"><div className="result-modal-icon"><Check/></div><h3>Guardado correctamente</h3><p>{saveNotice}</p><button className="primary wide" onClick={() => setSaveNotice('')}>Aceptar</button></div></div>}
    </div>
  );
}

function Splash() {
  return <div className="splash"><div className="brand-mark"><Archive /></div><h1>FrikiVault</h1><span>Cargando tu colección…</span></div>;
}

function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function loginGoogle() {
    if (!auth) return;
    try {
      setBusy(true); setError('');
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión'); }
    finally { setBusy(false); }
  }
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand-mark large"><Archive /></div>
        <span className="eyebrow">TU COLECCIÓN, EN EL BOLSILLO</span>
        <h1>FrikiVault</h1>
        <p>Figuras, cómics, cartas, videojuegos y cualquier cosa friki. Foto, IA y guardado en la nube sin servicios Firebase de pago obligatorios.</p>
        <button className="primary wide" onClick={loginGoogle} disabled={busy}><UserRound size={19}/> Entrar con Google</button>
        {error && <div className="error-box">{error}</div>}
        <div className="secure-note"><ShieldCheck size={16}/> Tus objetos quedan ligados a tu cuenta.</div>
      </div>
    </div>
  );
}

function Sidebar({ tab, setTab, count }: { tab: Tab; setTab: (t: Tab) => void; count: number }) {
  const rows: Array<[Tab, React.ReactNode, string]> = [
    ['home', <Layers3 size={19}/>, 'Inicio'],
    ['collection', <LibraryBig size={19}/>, 'Colección'],
    ['scan', <ScanLine size={19}/>, 'Escanear'],
    ['wishlist', <Heart size={19}/>, 'Wishlist'],
    ['stats', <BarChart3 size={19}/>, 'Estadísticas'],
    ['settings', <Settings size={19}/>, 'Ajustes']
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="brand-mark"><Archive/></div><div><strong>FrikiVault</strong><small>Collector OS</small></div></div>
      <nav>{rows.map(([id, icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{icon}<span>{label}</span>{id === 'collection' && <em>{count}</em>}</button>)}</nav>
      <div className="sidebar-foot"><span>Spark Edition</span><small>v3.0</small></div>
    </aside>
  );
}

function Topbar({ query, setQuery, onAdd, user, onSettings }: { query: string; setQuery: (v: string) => void; onAdd: () => void; user: User | null; onSettings: () => void }) {
  return (
    <header className="topbar">
      <div className="mobile-brand"><div className="brand-mark"><Archive/></div><strong>FrikiVault</strong></div>
      <label className="search-box"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en toda tu colección…"/></label>
      <div className="top-actions">
        <button className="primary desktop-add" onClick={onAdd}><Plus size={18}/> Añadir</button>
        <button className="avatar" onClick={onSettings}>{user?.photoURL ? <img src={user.photoURL} alt=""/> : <UserRound/>}</button>
      </div>
    </header>
  );
}

function Dashboard({ items, setTab, onEdit, onAdd }: { items: InventoryItem[]; setTab: (t: Tab) => void; onEdit: (i: InventoryItem) => void; onAdd: (s?: Partial<InventoryDraft>) => void }) {
  const collection = items.filter((x) => x.status === 'collection');
  const wishlist = items.filter((x) => x.status === 'wishlist');
  const invested = collection.reduce((s, x) => s + (x.purchasePrice || 0), 0);
  const value = collection.reduce((s, x) => s + (x.currentValue || 0), 0);
  const recent = collection.slice(0, 6);
  const franchises = topGroups(collection, 'franchise').slice(0, 5);
  return (
    <>
      <section className="hero-panel">
        <div><span className="eyebrow">MI COLECCIÓN</span><h1>Todo lo friki, <span>bien controlado.</span></h1><p>Fotografía, identifica, organiza y valora tu colección desde el móvil.</p></div>
        <button className="scan-cta" onClick={() => setTab('scan')}><div><Camera size={26}/><Sparkles className="spark" size={17}/></div><span><b>Escanear objeto</b><small>Foto + identificación IA</small></span></button>
      </section>
      <section className="metric-grid">
        <Metric icon={<Package/>} label="En colección" value={String(collection.length)} note={`${new Set(collection.map(x => x.franchise).filter(Boolean)).size} franquicias`} />
        <Metric icon={<CircleDollarSign/>} label="Invertido" value={money(invested)} note="Precio de compra" />
        <Metric icon={<TrendingUp/>} label="Valor estimado" value={money(value)} note={value && invested ? `${value >= invested ? '+' : ''}${money(value - invested)} vs. coste` : 'Añade valoraciones'} positive={value >= invested} />
        <Metric icon={<Heart/>} label="Wishlist" value={String(wishlist.length)} note={wishlist.length ? 'Objetos pendientes' : 'Todo cazado'} />
      </section>
      <section className="two-col">
        <div className="panel">
          <PanelHeader title="Últimas incorporaciones" action="Ver colección" onAction={() => setTab('collection')} />
          {recent.length ? <div className="recent-grid">{recent.map((item) => <ItemCard key={item.id} item={item} onClick={() => onEdit(item)} compact />)}</div> : <EmptyState onAdd={() => onAdd()} />}
        </div>
        <div className="panel">
          <PanelHeader title="Franquicias" action="Estadísticas" onAction={() => setTab('stats')} />
          <div className="ranking">{franchises.length ? franchises.map(([name, count], idx) => <div key={name}><span className="rank">{idx + 1}</span><div><b>{name || 'Sin franquicia'}</b><small>{count} objetos</small></div><div className="rank-bar"><i style={{ width: `${Math.max(15, count / franchises[0][1] * 100)}%` }}/></div></div>) : <p className="muted">Añade objetos para ver tus franquicias principales.</p>}</div>
        </div>
      </section>
    </>
  );
}

function Metric({ icon, label, value, note, positive }: { icon: React.ReactNode; label: string; value: string; note: string; positive?: boolean }) {
  return <div className="metric"><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small className={positive ? 'positive' : ''}>{note}</small></div>;
}

function PanelHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="panel-head"><h2>{title}</h2>{action && <button onClick={onAction}>{action} <ExternalLink size={14}/></button>}</div>;
}

function Collection({ items, query, typeFilter, setTypeFilter, onEdit, onAdd, title = 'Mi colección', subtitle = 'Todo lo que ya tienes.' }: {
  items: InventoryItem[]; query: string; typeFilter: ItemType | 'all'; setTypeFilter: (v: ItemType | 'all') => void;
  onEdit: (i: InventoryItem) => void; onAdd: (s?: Partial<InventoryDraft>) => void; title?: string; subtitle?: string;
}) {
  const [statusSort, setStatusSort] = useState<'recent' | 'value' | 'name'>('recent');
  const filtered = useMemo(() => {
    const q = normalizeText(query);
    let rows = items.filter((item) => {
      const haystack = normalizeText([item.title, item.franchise, item.character, item.manufacturer, item.line, ...(item.tags || [])].join(' '));
      return (!q || haystack.includes(q)) && (typeFilter === 'all' || item.type === typeFilter);
    });
    if (statusSort === 'name') rows = [...rows].sort((a, b) => a.title.localeCompare(b.title));
    if (statusSort === 'value') rows = [...rows].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
    return rows;
  }, [items, query, typeFilter, statusSort]);

  return (
    <section>
      <div className="page-heading"><div><span className="eyebrow">INVENTARIO</span><h1>{title}</h1><p>{subtitle} <b>{items.length}</b> objetos.</p></div><button className="primary" onClick={() => onAdd()}><Plus size={18}/> Añadir</button></div>
      <div className="filter-row">
        <div className="type-pills"><button className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>Todo</button>{(['figure','comic','manga','card','game','funko','lego'] as ItemType[]).map((t) => <button key={t} className={typeFilter === t ? 'active' : ''} onClick={() => setTypeFilter(t)}>{TYPE_ICONS[t]} {ITEM_TYPE_LABELS[t]}</button>)}</div>
        <label className="select-wrap"><Filter size={16}/><select value={statusSort} onChange={(e) => setStatusSort(e.target.value as typeof statusSort)}><option value="recent">Más recientes</option><option value="name">Nombre A-Z</option><option value="value">Mayor valor</option></select><ChevronDown size={15}/></label>
      </div>
      {filtered.length ? <div className="inventory-grid">{filtered.map((item) => <ItemCard key={item.id} item={item} onClick={() => onEdit(item)} />)}</div> : <EmptyState onAdd={() => onAdd()} message={query ? 'No hay resultados con ese filtro.' : 'Todavía no hay objetos aquí.'}/>} 
    </section>
  );
}

function ItemCard({ item, onClick, compact = false }: { item: InventoryItem; onClick: () => void; compact?: boolean }) {
  return (
    <button className={`item-card ${compact ? 'compact' : ''}`} onClick={onClick}>
      <div className="item-media">{item.imageUrls?.[0] ? <img src={item.imageUrls[0]} alt=""/> : <span>{TYPE_ICONS[item.type]}</span>}{item.favorite && <i className="favorite"><Star size={13} fill="currentColor"/></i>}<em>{ITEM_TYPE_LABELS[item.type]}</em></div>
      <div className="item-body"><small>{item.franchise || item.manufacturer || 'Sin franquicia'}</small><h3>{item.title}</h3>{!compact && <div className="item-meta"><span>{item.character || item.line || item.edition || '—'}</span><b>{money(item.currentValue ?? item.purchasePrice, item.currency)}</b></div>}</div>
    </button>
  );
}

function EmptyState({ onAdd, message = 'Tu vitrina digital está vacía.' }: { onAdd: () => void; message?: string }) {
  return <div className="empty-state"><div><Package/></div><h3>{message}</h3><p>Empieza haciendo una foto o añadiendo un objeto manualmente.</p><button className="primary" onClick={onAdd}><Plus size={18}/> Añadir objeto</button></div>;
}

function Scanner({ onCreate, showToast }: { onCreate: (seed?: Partial<InventoryDraft>, photos?: File[]) => void; showToast: (m: string) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiIdentification | null>(null);
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

  async function removePhoto(index: number) {
    const remaining = files.filter((_, i) => i !== index);
    setFiles(remaining);
    setPreviews((current) => current.filter((_, i) => i !== index));
    setResult(null);
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
    setResult(null);
  }

  async function identify() {
    if (!files.length) return;
    setBusy(true);
    try { setResult(await identifyWithAi(files)); }
    catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo identificar'); }
    finally { setBusy(false); }
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

  const useResult = () => result && onCreate({
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
  }, files);

  return (
    <section className="scan-page">
      <div className="page-heading"><div><span className="eyebrow">CAPTURA INTELIGENTE</span><h1>Escanear objeto</h1><p>Haz varias fotos del mismo artículo. La IA analizará todas juntas para identificarlo con más precisión.</p></div></div>
      <div className="scan-layout">
        <div className="camera-card">
          <input ref={cameraInputRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />
          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPicked(e.target.files ? [...e.target.files] : [])} />
          {previews.length ? <>
            <img className="scan-preview" src={previews[0]} alt="Vista principal del objeto"/>
            <div className="scan-photo-strip">
              {previews.map((preview, index) => <div className={`scan-photo-thumb ${index === 0 ? 'primary-photo' : ''}`} key={`${preview.slice(0, 30)}-${index}`}>
                <img src={preview} alt={`Foto ${index + 1}`}/>
                <span>{index === 0 ? 'Principal' : `Foto ${index + 1}`}</span>
                <div className="scan-photo-controls">
                  <button type="button" title="Mover a la izquierda" disabled={index === 0} onClick={() => movePhoto(index, -1)}>←</button>
                  <button type="button" title="Mover a la derecha" disabled={index === previews.length - 1} onClick={() => movePhoto(index, 1)}>→</button>
                  <button type="button" title="Eliminar foto" onClick={() => removePhoto(index)}><X size={14}/></button>
                </div>
              </div>)}
              {files.length < photoLimit && <button type="button" className="scan-add-photo" onClick={() => cameraInputRef.current?.click()}><Camera/><span>Otra foto</span></button>}
            </div>
            <p className="scan-photo-help"><b>{files.length}/{photoLimit} fotos.</b> Haz frontal, trasera, caja, etiqueta o código de barras. Todas se envían juntas a la IA.</p>
          </> : <div className="camera-placeholder"><div className="scan-frame"><ScanLine/></div><h2>Fotografía el artículo desde varios ángulos</h2><p>Empieza por el frontal y añade después caja, parte trasera, etiquetas, texto o código de barras.</p></div>}
          <div className="camera-actions"><button className="secondary" onClick={() => cameraInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy}><Camera size={19}/>{files.length ? 'Hacer otra foto' : 'Abrir cámara'}</button><button className="secondary" onClick={() => uploadInputRef.current?.click()} disabled={files.length >= photoLimit || photoBusy}><Upload size={19}/>{photoBusy ? 'Preparando…' : 'Subir fotos'}</button><button className="ai-button" onClick={identify} disabled={!files.length || busy || photoBusy}><WandSparkles size={19}/>{busy ? 'Analizando…' : `Identificar con IA${files.length > 1 ? ` · ${files.length} fotos` : ''}`}</button></div>
        </div>
        <div className="scan-side">
          <div className="panel scan-result">
            <div className="panel-head"><h2><Sparkles size={19}/> Resultado IA</h2></div>
            {result ? <div className="ai-result"><span className="confidence">{Math.round(result.confidence * 100)}% confianza · {files.length} {files.length === 1 ? 'foto analizada' : 'fotos analizadas'}</span><h3>{result.title}</h3><dl><div><dt>Tipo</dt><dd>{ITEM_TYPE_LABELS[result.type]}</dd></div><div><dt>Franquicia</dt><dd>{result.franchise || '—'}</dd></div><div><dt>Personaje</dt><dd>{result.character || '—'}</dd></div><div><dt>Fabricante</dt><dd>{result.manufacturer || '—'}</dd></div><div><dt>Línea / edición</dt><dd>{result.line || result.edition || '—'}</dd></div></dl><p>{result.explanation}</p><button className="primary wide" onClick={useResult}><Check size={18}/> Sí, es este artículo</button><small className="muted">Las fotos se conservarán juntas en la ficha.</small></div> : <div className="placeholder-copy"><Sparkles/><p>Añade varias vistas y pulsa Identificar. DeepSeek recibirá todas las fotos del mismo artículo en una única consulta.</p></div>}
          </div>
          <div className="panel barcode-box"><div className="panel-head"><h2><QrCode size={19}/> Código / ISBN</h2></div><p>FrikiVault intenta leer el código de cualquiera de las fotos. También puedes escribirlo.</p><div className="inline-field"><input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="EAN / UPC / ISBN"/><button onClick={useBarcode} disabled={busy || !barcode}>Buscar</button></div></div>
        </div>
      </div>
    </section>
  );
}

function Stats({ items }: { items: InventoryItem[] }) {
  const collection = items.filter((x) => x.status === 'collection');
  const sold = items.filter((x) => x.status === 'sold');
  const invested = collection.reduce((s, x) => s + (x.purchasePrice || 0), 0);
  const value = collection.reduce((s, x) => s + (x.currentValue || 0), 0);
  const groups = topGroups(collection, 'type');
  const franchises = topGroups(collection, 'franchise').slice(0, 10);
  const max = Math.max(...groups.map(([, n]) => n), 1);
  return (
    <section><div className="page-heading"><div><span className="eyebrow">ANÁLISIS</span><h1>Estadísticas</h1><p>Qué tienes, cuánto te ha costado y cómo se reparte.</p></div></div>
      <div className="metric-grid"><Metric icon={<Package/>} label="Objetos" value={String(collection.length)} note={`${sold.length} vendidos`} /><Metric icon={<CircleDollarSign/>} label="Invertido" value={money(invested)} note="Coste acumulado"/><Metric icon={<TrendingUp/>} label="Valor actual" value={money(value)} note={`${value >= invested ? '+' : ''}${money(value-invested)} diferencia`} positive={value >= invested}/><Metric icon={<Tag/>} label="Valor medio" value={money(collection.length ? value/collection.length : 0)} note="Por objeto"/></div>
      <div className="two-col"><div className="panel"><PanelHeader title="Por tipo"/><div className="bars">{groups.map(([name,n]) => <div key={name}><span>{TYPE_ICONS[name as ItemType]} {ITEM_TYPE_LABELS[name as ItemType] || name}</span><div><i style={{width:`${n/max*100}%`}}/></div><b>{n}</b></div>)}</div></div><div className="panel"><PanelHeader title="Top franquicias"/><div className="simple-list">{franchises.map(([name,n],i)=><div key={name}><span>{i+1}</span><b>{name || 'Sin franquicia'}</b><em>{n}</em></div>)}</div></div></div>
    </section>
  );
}

function SettingsPage({ items, user, showToast }: { items: InventoryItem[]; user: User | null; showToast: (m: string) => void }) {
  const importRef = useRef<HTMLInputElement | null>(null);
  function download(filename: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
  function exportJson() { download(`frikivault-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(items, null, 2), 'application/json'); }
  function exportCsv() {
    const cols: Array<keyof InventoryItem> = ['title','type','status','franchise','character','manufacturer','line','edition','year','barcode','condition','purchasePrice','currentValue','room','furniture','shelf','notes'];
    const esc=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
    download('frikivault.csv', [cols.join(','), ...items.map(i => cols.map(c => esc(i[c])).join(','))].join('\n'), 'text/csv;charset=utf-8');
  }
  async function importJson(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as InventoryItem[];
      if (!Array.isArray(parsed)) throw new Error('Formato incorrecto');
      if (demoMode) importDemo(parsed);
      else {
        for (const item of parsed) {
          const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = item;
          await saveItem(draft);
        }
      }
      showToast(`Importados ${parsed.length} objetos`);
    } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo importar'); }
  }
  return (
    <section><div className="page-heading"><div><span className="eyebrow">CONFIGURACIÓN</span><h1>Ajustes y copias</h1><p>Tu colección es tuya. Puedes sacarla completa cuando quieras.</p></div></div>
      <div className="settings-grid">
        <div className="panel account-panel"><div className="user-block">{user?.photoURL ? <img src={user.photoURL}/> : <div className="user-fallback"><UserRound/></div>}<div><b>{user?.displayName || (demoMode ? 'Modo local' : 'Usuario')}</b><small>{user?.email || (demoMode ? 'Sin cuenta Firebase todavía' : '')}</small></div></div>{!demoMode && auth && <button className="danger-link" onClick={() => signOut(auth!)}><LogOut size={17}/> Cerrar sesión</button>}</div>
        <div className="panel"><PanelHeader title="Copia de seguridad"/><p className="muted">JSON conserva todos los campos. CSV abre bien en Excel.</p><div className="button-stack"><button className="secondary wide" onClick={exportJson}><FileJson size={18}/> Exportar JSON</button><button className="secondary wide" onClick={exportCsv}><Download size={18}/> Exportar CSV</button><button className="secondary wide" onClick={() => importRef.current?.click()}><Upload size={18}/> Importar JSON</button><input ref={importRef} hidden type="file" accept="application/json" onChange={(e)=>importJson(e.target.files?.[0])}/></div></div>
        <DirectAiSettings/>
        <div className="panel"><PanelHeader title="Estado Firebase"/><div className="status-list"><div><span className={isFirebaseConfigured ? 'dot ok':'dot warn'}/><b>Configuración web</b><em>{isFirebaseConfigured ? 'Conectada' : 'Pendiente'}</em></div><div><span className={demoMode ? 'dot warn':'dot ok'}/><b>Base de datos</b><em>{demoMode ? 'Local demo' : 'Cloud Firestore'}</em></div></div></div>
        <div className="panel"><PanelHeader title="Privacidad"/><p className="muted">Authentication y Firestore limitan la colección a tu usuario. Las fotos se comprimen y se guardan dentro de Firestore; en modo directo, tu clave se guarda en este navegador y se envía únicamente a DeepSeek. eBay se consulta mediante fuentes públicas, sin iniciar sesión.</p><div className="secure-note"><ShieldCheck size={17}/> IA directa funciona desde este dispositivo sin un servidor propio. Firebase sirve la web, autentica tu cuenta y sincroniza tus objetos.</div></div>
      </div>
    </section>
  );
}

function ItemForm({ item, seed, initialPhotos = [], onClose, onSaved, onDeleted }: { item: InventoryItem | null; seed?: Partial<InventoryDraft>; initialPhotos?: File[]; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const itemDraft: Partial<InventoryDraft> = item ? (() => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = item;
    return rest;
  })() : {};
  const initial: InventoryDraft = { ...EMPTY_DRAFT, ...itemDraft, ...(seed || {}), tags: item?.tags || seed?.tags || [], imageUrls: item?.imageUrls || seed?.imageUrls || [], imagePaths: item?.imagePaths || seed?.imagePaths || [] };
  const [draft, setDraft] = useState<InventoryDraft>(initial);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>(initialPhotos);
  const [previews, setPreviews] = useState<string[]>(initial.imageUrls || []);
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [saveErrorModal, setSaveErrorModal] = useState('');
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
        setPendingPhotos([]);
      })
      .catch((error) => { if (active) setPhotoError(error instanceof Error ? error.message : 'No se pudieron preparar las fotos para guardar.'); })
      .finally(() => { if (active) setPhotoPreparing(false); });
    return () => { active = false; };
  }, [initialPhotos]);
  useEffect(() => {
    if (!item?.id) return;
    const target = `${window.location.origin}${window.location.pathname}?item=${encodeURIComponent(item.id)}`;
    QRCode.toDataURL(target, { width: 280, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [item?.id]);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(Boolean(item));
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const set = <K extends keyof InventoryDraft>(key: K, value: InventoryDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function addPhotos(files: FileList | null) {
    if (!files || photoPreparing) return;
    const existing = (draft.imageUrls || []).length + pendingPhotos.length;
    const limit = maxCloudPhotos();
    const raw = [...files].slice(0, Math.max(0, limit - existing));
    if (!raw.length) return;
    setPhotoPreparing(true);
    setPhotoError('');
    try {
      const prepared = await Promise.all(raw.map((file) => prepareImage(file)));
      setPendingPhotos((current) => [...current, ...prepared].slice(0, limit));
      const uploaded = await Promise.all(prepared.map((file) => uploadItemImage(file)));
      const urls = uploaded.map((x) => x.url).filter(Boolean);
      const paths = uploaded.map((x) => x.path).filter(Boolean);
      setDraft((current) => ({
        ...current,
        imageUrls: [...(current.imageUrls || []), ...urls].slice(0, limit),
        imagePaths: [...(current.imagePaths || []), ...paths]
      }));
      setPreviews((current) => [...current, ...urls].slice(0, limit));
      setPendingPhotos([]);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'No se pudieron preparar las fotos para guardar.');
    } finally {
      setPhotoPreparing(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setBusy(true);
    try {
      const baseDraft: InventoryDraft = {
        ...draft,
        title: draft.title.trim(),
        tags: (draft.tags || []).map((x) => x.trim()).filter(Boolean)
      };
      if (photoPreparing) throw new Error('Espera a que terminen de prepararse las fotos.');
      let finalDraft: InventoryDraft = { ...baseDraft, research };
      if (pendingPhotos.length) {
        setPhotoError('');
        const room = Math.max(0, maxCloudPhotos() - (baseDraft.imageUrls || []).length);
        const uploaded = await Promise.all(pendingPhotos.slice(0, room).map((file) => uploadItemImage(file)));
        finalDraft = {
          ...finalDraft,
          imageUrls: [...(baseDraft.imageUrls || []), ...uploaded.map((x) => x.url).filter(Boolean)].slice(0, maxCloudPhotos()),
          imagePaths: [...(baseDraft.imagePaths || []), ...uploaded.map((x) => x.path).filter(Boolean)]
        };
      }
      await saveItem(finalDraft, item?.id);
      setPendingPhotos([]);
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el artículo.';
      setPhotoError(message);
      setSaveErrorModal(message);
    } finally { setBusy(false); }
  }

  async function researchItem() {
    if (!item?.id || !draft.title.trim()) return;
    setResearchBusy(true); setResearchError('');
    try {
      const result = await investigate({ ...draft, identificationConfirmed: true });
      setResearch(result);
      if (result.asking.median != null && draft.currentValue == null) {
        set('currentValue', Number(result.asking.median.toFixed(2)));
      }
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : 'No se pudo investigar el artículo.');
    } finally { setResearchBusy(false); }
  }

  function downloadQr() {
    if (!qrDataUrl || !item?.id) return;
    const link = document.createElement('a'); link.href = qrDataUrl; link.download = `${item.id}-qr.png`; link.click();
  }

  function printQr() {
    if (!qrDataUrl || !item) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=420,height=520');
    if (!popup) return;
    popup.document.write(`<title>Etiqueta ${item.title}</title><style>body{font-family:Arial;text-align:center;padding:28px}img{width:260px;max-width:100%}h2{font-size:18px}small{color:#666}</style><h2>${escapeHtml(item.title)}</h2><img src="${qrDataUrl}" alt="Código QR"><p>${escapeHtml(item.id)}</p><small>FrikiVault</small><script>window.onload=()=>window.print()<\/script>`);
    popup.document.close();
  }

  async function destroy() {
    if (!item || !confirm(`¿Eliminar “${item.title}”?`)) return;
    setBusy(true); try { await removeItem(item.id); onDeleted(); } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.currentTarget === e.target && onClose()}>
      <form className="item-sheet" onSubmit={submit}>
        <div className="sheet-head"><div><span className="eyebrow">{item ? 'EDITAR OBJETO' : 'NUEVO OBJETO'}</span><h2>{item ? item.title : 'Añadir a FrikiVault'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X/></button></div>
        <div className="sheet-scroll">
          <section className="photo-section"><div className="photo-strip">{previews.map((url,i)=><div className="photo-thumb" key={`${url.slice(0,25)}-${i}`}><img src={url}/></div>)}<button type="button" className="add-photo" disabled={photoPreparing || previews.length >= maxCloudPhotos()} onClick={()=>cameraRef.current?.click()}><Camera/><span>{photoPreparing ? 'Procesando…' : 'Cámara'}</span></button><button type="button" className="add-photo" disabled={photoPreparing || previews.length >= maxCloudPhotos()} onClick={()=>galleryRef.current?.click()}><Upload/><span>Subir fotos</span></button></div><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(e)=>addPhotos(e.target.files)}/><input ref={galleryRef} hidden type="file" accept="image/*" multiple onChange={(e)=>addPhotos(e.target.files)}/>{photoPreparing && <small className="muted">Adaptando resolución y peso de las fotos automáticamente…</small>}{photoError && <div className="error-box">{photoError}</div>}</section>

          <div className="form-grid">
            <Field label="Nombre *" wide><input required value={draft.title} onChange={(e)=>set('title',e.target.value)} placeholder="Ej. S.H.Figuarts Son Goku"/></Field>
            <Field label="Tipo"><select value={draft.type} onChange={(e)=>set('type',e.target.value as ItemType)}>{Object.entries(ITEM_TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{TYPE_ICONS[k as ItemType]} {v}</option>)}</select></Field>
            <Field label="Estado"><select value={draft.status} onChange={(e)=>set('status',e.target.value as ItemStatus)}>{Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Franquicia"><input value={draft.franchise || ''} onChange={(e)=>set('franchise',e.target.value)} placeholder="Pokémon, Marvel…"/></Field>
            <Field label="Personaje"><input value={draft.character || ''} onChange={(e)=>set('character',e.target.value)} placeholder="Pikachu, Batman…"/></Field>
            <Field label="Fabricante / editorial"><input value={draft.manufacturer || ''} onChange={(e)=>set('manufacturer',e.target.value)} placeholder="Bandai, Hasbro, DC…"/></Field>
            <Field label="Línea / colección"><input value={draft.line || ''} onChange={(e)=>set('line',e.target.value)} placeholder="S.H.Figuarts, Marvel Legends…"/></Field>
          </div>

          <button type="button" className="advanced-toggle" onClick={()=>setAdvanced(!advanced)}><MoreHorizontal/> {advanced ? 'Ocultar detalles' : 'Más detalles'} <ChevronDown className={advanced ? 'rotated':''}/></button>
          {advanced && <div className="advanced-block form-grid">
            {(draft.type === 'comic' || draft.type === 'manga') && <><Field label="Número"><input value={draft.issueNumber || ''} onChange={(e)=>set('issueNumber',e.target.value)}/></Field><Field label="Volumen"><input value={draft.volume || ''} onChange={(e)=>set('volume',e.target.value)}/></Field><Field label="Edición"><input value={draft.edition || ''} onChange={(e)=>set('edition',e.target.value)}/></Field><Field label="ISBN"><input value={draft.isbn || ''} onChange={(e)=>set('isbn',e.target.value)}/></Field></>}
            {draft.type === 'card' && <><Field label="Set"><input value={draft.setName || ''} onChange={(e)=>set('setName',e.target.value)}/></Field><Field label="Número de carta"><input value={draft.cardNumber || ''} onChange={(e)=>set('cardNumber',e.target.value)}/></Field><Field label="Rareza"><input value={draft.rarity || ''} onChange={(e)=>set('rarity',e.target.value)}/></Field><Field label="Grado"><input value={draft.grade || ''} onChange={(e)=>set('grade',e.target.value)} placeholder="PSA 9…"/></Field></>}
            {draft.type === 'game' && <Field label="Plataforma"><input value={draft.platform || ''} onChange={(e)=>set('platform',e.target.value)} placeholder="PS5, Switch…"/></Field>}
            <Field label="Año"><input type="number" value={draft.year ?? ''} onChange={(e)=>set('year',e.target.value ? Number(e.target.value) : null)}/></Field>
            <Field label="Código EAN / UPC"><input value={draft.barcode || ''} onChange={(e)=>set('barcode',e.target.value)}/></Field>
            <Field label="SKU / referencia"><input value={draft.sku || ''} onChange={(e)=>set('sku',e.target.value)} placeholder="Referencia del fabricante"/></Field>
            <Field label="País / mercado de la edición"><input value={draft.country || ''} onChange={(e)=>set('country',e.target.value)} placeholder="España, Japón, USA…"/></Field>
            <Field label="Idioma de la edición"><input value={draft.language || ''} onChange={(e)=>set('language',e.target.value)} placeholder="Español, inglés, japonés…"/></Field>
            {draft.graded && <Field label="Empresa de graduación"><input value={draft.gradingCompany || ''} onChange={(e)=>set('gradingCompany',e.target.value)} placeholder="PSA, CGC…"/></Field>}
            {draft.graded && draft.type !== 'card' && <Field label="Grado"><input value={draft.grade || ''} onChange={(e)=>set('grade',e.target.value)} placeholder="9.8, 9.5…"/></Field>}
            <Field label="Estado físico"><select value={draft.condition || 'like-new'} onChange={(e)=>set('condition',e.target.value as InventoryDraft['condition'])}>{Object.entries(CONDITION_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Etiquetas"><input value={(draft.tags || []).join(', ')} onChange={(e)=>set('tags',e.target.value.split(','))} placeholder="pokemon, japon, edición limitada"/></Field>
            <div className="checks wide"><Toggle label="Con caja" checked={!!draft.hasBox} onChange={(v)=>set('hasBox',v)}/><Toggle label="Precintado" checked={!!draft.sealed} onChange={(v)=>set('sealed',v)}/><Toggle label="Firmado" checked={!!draft.signed} onChange={(v)=>set('signed',v)}/><Toggle label="Graduado" checked={!!draft.graded} onChange={(v)=>set('graded',v)}/><Toggle label="Favorito" checked={!!draft.favorite} onChange={(v)=>set('favorite',v)}/><Toggle label="Identificación confirmada" checked={!!draft.identificationConfirmed} onChange={(v)=>set('identificationConfirmed',v)}/></div>
          </div>}

          <h3 className="form-section-title"><CircleDollarSign/> Dinero</h3>
          <div className="form-grid"><Field label="Precio pagado"><input inputMode="decimal" type="number" step="0.01" value={draft.purchasePrice ?? ''} onChange={(e)=>set('purchasePrice',e.target.value ? Number(e.target.value) : null)}/></Field><Field label="Valor actual"><input inputMode="decimal" type="number" step="0.01" value={draft.currentValue ?? ''} onChange={(e)=>set('currentValue',e.target.value ? Number(e.target.value) : null)}/></Field><Field label="Tienda / origen"><input value={draft.store || ''} onChange={(e)=>set('store',e.target.value)} placeholder="Pokémon Center Tokyo…"/></Field><Field label="Fecha de compra"><input type="date" value={draft.purchaseDate || ''} onChange={(e)=>set('purchaseDate',e.target.value)}/></Field></div>

          <h3 className="form-section-title"><Archive/> Ubicación física</h3>
          <div className="form-grid"><Field label="Habitación"><input value={draft.room || ''} onChange={(e)=>set('room',e.target.value)} placeholder="Despacho"/></Field><Field label="Mueble / vitrina"><input value={draft.furniture || ''} onChange={(e)=>set('furniture',e.target.value)} placeholder="Vitrina 1"/></Field><Field label="Balda"><input value={draft.shelf || ''} onChange={(e)=>set('shelf',e.target.value)} placeholder="Balda 3"/></Field><Field label="Caja"><input value={draft.box || ''} onChange={(e)=>set('box',e.target.value)} placeholder="Caja A"/></Field></div>
          <Field label="Notas" wide><textarea rows={4} value={draft.notes || ''} onChange={(e)=>set('notes',e.target.value)} placeholder="Detalles, defectos, procedencia, firma…"/></Field>

          {item && <section className="research-panel">
            <div className="research-head"><div><h3 className="form-section-title"><Sparkles/> Investigación inteligente</h3><p className="muted">Solo se consulta después de confirmar que esta es la pieza correcta.</p></div><button type="button" className="ai-button" onClick={researchItem} disabled={researchBusy || !draft.identificationConfirmed}>{researchBusy ? 'Investigando…' : research ? 'Actualizar investigación' : 'Confirmar e investigar'}</button></div>
            {!draft.identificationConfirmed && <p className="hint">Confirma los datos del escáner o marca la identificación como correcta para activar la consulta.</p>}
            {researchError && <div className="error-box">{researchError}</div>}
            {research && <div className="research-result">
              {research.asking.median != null ? <div className="valuation-highlight">
                <span className="valuation-kicker">VALOR ESTIMADO ACTUAL</span>
                <strong>{money(research.asking.median, research.asking.currency || 'EUR')}</strong>
                <div className="valuation-range">Rango observado: {money(research.asking.min, research.asking.currency || 'EUR')} – {money(research.asking.max, research.asking.currency || 'EUR')}</div>
                <small>{research.asking.label}</small>
              </div> : <div className="valuation-highlight empty"><span className="valuation-kicker">VALOR ESTIMADO</span><strong>Sin precio automático todavía</strong><small>PriceCharting y las fuentes públicas no han devuelto aún una coincidencia valorable; las páginas rotas o ambiguas se omiten.</small></div>}
              <p>{research.summary}</p>
              <div className="market-summary"><div><span>Páginas coincidentes</span><b>{new Set(research.sources.map((source) => source.url)).size || '—'}</b></div><div><span>Precios detectados</span><b>{research.listings.length || '—'}</b></div><div><span>Comparables usados</span><b>{research.comparables.length || '—'}</b></div><div><span>Mediana</span><b>{research.asking.median == null ? '—' : money(research.asking.median)}</b></div><div><span>Fuentes especializadas</span><b>{research.sources.filter((source) => source.kind.includes('funko-specialist') || source.kind.includes('pricecharting-api')).length || '—'}</b></div><div><span>Ventas cerradas</span><b>{research.sold.available ? `${research.sold.count || 1}${research.sold.median != null ? ` · ${money(research.sold.median)}` : ''}` : 'No verificadas'}</b></div></div>
              {research.comparables.length > 0 && <div className="comparable-prices"><h4>Precios usados para el baremo</h4>{research.comparables.slice(0,8).map((listing) => <a className="comparable-price" key={listing.id} href={listing.url} target="_blank" rel="noreferrer"><span><b>{listing.title}</b><small>{listing.condition}</small></span><strong>{money(listing.price, listing.currency)}</strong></a>)}</div>}
              <div className="research-facts">{research.facts.slice(0, 8).map((fact) => <div key={`${fact.label}-${fact.sourceId}`}><b>{fact.label}</b><span>{fact.value}</span></div>)}</div>
              <div className="source-list"><a href={research.links.ebay} target="_blank" rel="noreferrer">Buscar artículo en eBay</a><a href={research.links.sold} target="_blank" rel="noreferrer">Revisar ventas cerradas</a>{research.links.priceCharting && <a href={research.links.priceCharting} target="_blank" rel="noreferrer">PriceCharting</a>}{research.links.stockx && <a href={research.links.stockx} target="_blank" rel="noreferrer">StockX</a>}{research.sources.filter((source) => !source.url.includes('hobbydb.com') && (source.kind.includes('pricecharting') || research.listings.some((listing) => listing.url === source.url))).slice(0, 8).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.kind.includes('pricecharting-api') ? 'PriceCharting API' : source.kind.startsWith('ebay') ? 'eBay público' : 'Fuente con precio'} · {source.title}</a>)}</div>
              {research.warnings.map((warning) => <small className="warning-line" key={warning}>{warning}</small>)}
            </div>}
          </section>}

          {item && <section className="qr-panel"><div><h3 className="form-section-title"><QrCode/> Etiqueta de la pieza</h3><p className="muted">Escanéala para abrir directamente esta ficha. La ubicación puede cambiar sin cambiar el código.</p><div className="qr-actions"><button type="button" className="secondary" onClick={downloadQr} disabled={!qrDataUrl}><Download size={17}/> Descargar QR</button><button type="button" className="secondary" onClick={printQr} disabled={!qrDataUrl}><Eye size={17}/> Imprimir etiqueta</button></div></div>{qrDataUrl ? <img className="qr-image" src={qrDataUrl} alt={`Código QR de ${item.title}`}/> : <div className="qr-placeholder"><QrCode/></div>}</section>}
        </div>
        <div className="sheet-foot">{item ? <button type="button" className="danger" onClick={destroy} disabled={busy}><Trash2 size={18}/> Eliminar</button> : <span/>}<div><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy || photoPreparing || !draft.title.trim()}><Check size={18}/>{busy ? 'Guardando…' : photoPreparing ? 'Preparando fotos…' : 'Guardar'}</button></div></div>
      </form>
      {saveErrorModal && <div className="result-modal-backdrop nested" role="dialog" aria-modal="true" aria-label="Error al guardar" onMouseDown={(event) => event.stopPropagation()}><div className="result-modal error"><div className="result-modal-icon"><X/></div><h3>No se ha podido guardar</h3><p>{saveErrorModal}</p><button className="secondary wide" type="button" onClick={() => setSaveErrorModal('')}>Volver y reintentar</button></div></div>}
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={`field ${wide ? 'wide':''}`}><span>{label}</span>{children}</label>; }
function Toggle({ label, checked, onChange }: { label:string;checked:boolean;onChange:(v:boolean)=>void }) { return <label className="toggle"><input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)}/><i/><span>{label}</span></label>; }

function MobileNav({ tab, setTab, onScan }: { tab: Tab; setTab: (t: Tab) => void; onScan: () => void }) {
  return <nav className="mobile-nav"><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><Layers3/><span>Inicio</span></button><button className={tab==='collection'?'active':''} onClick={()=>setTab('collection')}><LibraryBig/><span>Colección</span></button><button className="scan-fab" onClick={onScan}><ScanLine/></button><button className={tab==='wishlist'?'active':''} onClick={()=>setTab('wishlist')}><Heart/><span>Wishlist</span></button><button className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}><Settings/><span>Ajustes</span></button></nav>;
}

function topGroups(items: InventoryItem[], key: keyof InventoryItem): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const item of items) {
    const raw = item[key];
    const name = typeof raw === 'string' && raw.trim() ? raw.trim() : key === 'type' ? String(raw || 'other') : 'Sin especificar';
    map.set(name, (map.get(name) || 0) + 1);
  }
  return [...map.entries()].sort((a,b)=>b[1]-a[1]);
}

export default App;
