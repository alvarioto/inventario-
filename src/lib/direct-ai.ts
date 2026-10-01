import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { deepseek, identify, research } from './ai-core.mjs';
import { FUNKO_STICKERS } from './funko-stickers';
import type { InventoryDraft } from '../types';

const storageKey = 'frikivault.deepseek.personal.v1';
function scopedKey() { return storageKey + ':' + (auth?.currentUser?.uid || 'local'); }
export function getPersonalKey(): string {
  return sessionStorage.getItem(scopedKey()) || localStorage.getItem(scopedKey()) || '';
}
export function savePersonalKey(value: string, remember = false) {
  const key = value.trim();
  if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) throw new Error('Introduce una clave de DeepSeek válida.');
  sessionStorage.removeItem(scopedKey());
  localStorage.removeItem(scopedKey());
  (remember ? localStorage : sessionStorage).setItem(scopedKey(), key);
}
export async function removePersonalKey() {
  if (auth?.currentUser && db) await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'deepseek'));
  sessionStorage.removeItem(scopedKey());
  localStorage.removeItem(scopedKey());
}

// One-time private activation. Fragments are not sent to Hosting.
if (location.hash.startsWith('#fv-activate=')) {
  const key = new URLSearchParams(location.hash.slice(1)).get('fv-activate') || '';
  history.replaceState(null, '', location.pathname + location.search);
  if (/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) sessionStorage.setItem(storageKey + ':activation', key);
}

export async function syncPersonalKey() {
  if (!auth?.currentUser || !db) throw new Error('Inicia sesión con Google para sincronizar tu clave.');
  const key = getPersonalKey();
  if (!key) throw new Error('Añade primero tu clave.');
  await setDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'deepseek'), {key});
}
export let keyReady: Promise<void> = Promise.resolve();
if (auth && db) {
  onAuthStateChanged(auth, user => {
    keyReady = (async () => {
      if (!user || !db) return;
      const pending = sessionStorage.getItem(storageKey + ':activation');
      if (pending) {
        savePersonalKey(pending);
        await syncPersonalKey();
        sessionStorage.removeItem(storageKey + ':activation');
      } else {
        const saved = await getDoc(doc(db, 'users', user.uid, 'settings', 'deepseek'));
        const key = saved.data()?.key;
        if (typeof key === 'string' && /^sk-[A-Za-z0-9_-]{16,}$/.test(key)) savePersonalKey(key);
      }
      window.dispatchEvent(new Event('frikivault-ai-ready'));
    })();
    keyReady.catch(() => { window.dispatchEvent(new Event('frikivault-ai-ready')); });
  });
}

const directFetch: typeof fetch = async (input, init) => { try { return await fetch(input, init); } catch (error) { if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new Error('DeepSeek ha tardado demasiado. Vuelve a intentarlo.'); throw new Error('No se pudo conectar directamente con DeepSeek.'); } };
function config() {
  const key = getPersonalKey();
  if (!key) throw new Error('Activa tu clave de DeepSeek en Ajustes → IA directa.');
  return { key, model: 'deepseek-flash', fetcher: directFetch,
    ...(import.meta.env.VITE_HOBBYDB_BROWSER_ENABLED === 'true' ? { hobbyDbReader: async (item: Partial<InventoryDraft>) => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Inicia sesión para consultar hobbyDB.');
      const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      const response = await fetch(base + '/api/hobbydb', { method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token}, body: JSON.stringify({item}), signal: AbortSignal.timeout(180000) });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('El servicio de navegación de hobbyDB no está desplegado.');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo abrir hobbyDB.');
      return result;
    }} : {})
  };
}

async function verifyFigureIdentityDirect(images: string[], initial: any) {
  const visibleImages = images.filter(image => typeof image === 'string' && image.startsWith('data:image/')).slice(0, 5);
  if (!visibleImages.length || initial?.type !== 'figure') return initial;

  const candidate = {
    title: initial.title || '',
    franchise: initial.franchise || '',
    character: initial.character || '',
    manufacturer: initial.manufacturer || '',
    line: initial.line || '',
    scale: initial.scale || '',
    wave: initial.wave || '',
    exclusive: initial.exclusive || '',
    edition: initial.edition || '',
    year: initial.year ?? null,
    sku: initial.sku || '',
    barcode: initial.barcode || ''
  };

  const content: any[] = [{
    type: 'text',
    text: `AUDITORÍA VISUAL INDEPENDIENTE DE UNA FIGURA. La identificación inicial puede estar EQUIVOCADA: no la aceptes por defecto. Compara la figura de las fotos con esta candidata: ${JSON.stringify(candidate)}. Examina únicamente rasgos realmente visibles y discriminantes: escultura de cabeza/cara, máscara/casco, pelo/barba, traje y patrones, colores, emblemas/logos, armadura, botas/guantes, accesorios/armas, capa, proporciones, daños/deco, base y cualquier texto o código legible del embalaje. No uses solo "se parece a" ni memoria vaga de una franquicia. Si dos lanzamientos comparten molde o no hay rasgos suficientes para distinguirlos, NO inventes una versión exacta: devuelve verdict="uncertain". Si ves una contradicción fuerte con la candidata, devuelve verdict="correct" y corrige SOLO con una identidad respaldada por al menos dos evidencias visuales independientes o por texto/código literal visible. Si la candidata encaja sin contradicciones fuertes, verdict="confirm". Devuelve SOLO JSON: {"verdict":"confirm|correct|uncertain","title":"","franchise":"","character":"","manufacturer":"","line":"","scale":"","wave":"","exclusive":"","edition":"","year":null,"sku":"","barcode":"","visualEvidence":["evidencia visible 1","evidencia visible 2"],"confidence":0.0}. visualEvidence debe describir rasgos observables breves, no razonamiento interno. Nunca inventes SKU, año, wave, exclusiva o edición si no son visibles o inequívocos.`
  }];
  for (const image of visibleImages) content.push({type:'image_url', image_url:{url:image, detail:'original'}});

  try {
    const audit: any = await (deepseek as any)([
      {role:'system', content:'Actúa como verificador visual conservador de figuras de colección. Tu trabajo principal es detectar falsos positivos entre figuras parecidas. No des por correcta la identificación previa. Si falta evidencia discriminante, marca uncertain en lugar de adivinar.'},
      {role:'user', content}
    ], {...config(), maxTokens:900, timeoutMs:42000, retries:0, jsonMode:false, thinking:'enabled', reasoningEffort:'high'});

    const verdict = String(audit?.verdict || '').toLowerCase();
    const confidence = Math.max(0, Math.min(1, Number(audit?.confidence) || 0));
    const evidence = Array.isArray(audit?.visualEvidence)
      ? audit.visualEvidence.map((value: unknown) => String(value || '').trim()).filter(Boolean).slice(0, 6)
      : [];

    if (verdict === 'uncertain') {
      return {
        ...initial,
        confidence: Math.min(Number(initial?.confidence) || 0.65, 0.68),
        explanation: `${initial?.explanation || ''} Verificación visual: no hay rasgos suficientes para distinguir con seguridad esta versión de otras figuras parecidas.`.trim()
      };
    }

    if (verdict !== 'correct' || confidence < 0.82 || evidence.length < 2 || !String(audit?.title || '').trim()) return initial;

    const corrected: any = {...initial};
    for (const key of ['title','franchise','character','manufacturer','line','scale','wave','exclusive','edition','sku','barcode']) {
      const value = String(audit?.[key] || '').trim();
      if (value) corrected[key] = value;
    }
    if (Number.isInteger(audit?.year) && audit.year >= 1800 && audit.year <= 2200) corrected.year = audit.year;
    corrected.confidence = confidence;
    corrected.explanation = `${initial?.explanation || ''} Verificación visual independiente corrigió la identidad por rasgos discriminantes visibles: ${evidence.join('; ')}.`.trim();
    return corrected;
  } catch {
    // Esta segunda opinión nunca debe romper la identificación principal.
    return initial;
  }
}

export const identifyDirect = async (images: string[]) => {
  const initial = await identify(images, config());
  return verifyFigureIdentityDirect(images, initial);
};
export const researchDirect = (item: Partial<InventoryDraft>) => research({confirmed: true, item}, config());

export async function inspectFunkoStickersDirect(images: string[]): Promise<{performed:boolean;stickerTexts:string[];confidence:number}> {
  const known = FUNKO_STICKERS.map(row => row.label).join(', ');
  const content: any[] = [{
    type: 'text',
    text: `Analiza SOLO las pegatinas visibles de la caja Funko. NO identifiques la figura ni deduzcas una variante por color, forma o apariencia. Transcribe literalmente el texto que puedas LEER en cada pegatina. Si una pegatina está borrosa, cortada o no puedes leer sus palabras, NO adivines: omítela. Puede haber varias pegatinas a la vez (por ejemplo Chase + tienda/convenio). Referencias conocidas para ayudarte a reconocer texto, nunca para inventarlo: ${known}. Devuelve ÚNICAMENTE JSON con esta forma: {"stickerTexts":["texto literal 1","texto literal 2"],"confidence":0.0}. confidence debe reflejar la legibilidad REAL del texto.`
  }];
  for (const image of images) content.push({type:'image_url',image_url:{url:image}});
  try {
    const result:any = await (deepseek as any)([{role:'user',content}], {...config(), maxTokens:350, timeoutMs:45000, retries:1});
    const stickerTexts = Array.isArray(result?.stickerTexts)
      ? result.stickerTexts.map((x:unknown)=>String(x||'').trim()).filter(Boolean).slice(0,6)
      : [];
    const confidence = Math.max(0, Math.min(1, Number(result?.confidence)||0));
    return {performed:true,stickerTexts,confidence};
  } catch {
    // La inspección secundaria no debe impedir identificar el artículo. Si falla,
    // volvemos al modo conservador del resultado principal.
    return {performed:false,stickerTexts:[],confidence:0};
  }
}

export const testDirect = () => deepseek([
  {role: 'user', content: 'Responde únicamente con este JSON: {"ok":true}'}
], config());
