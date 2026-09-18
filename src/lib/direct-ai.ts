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
export const identifyDirect = (images: string[]) => identify(images, config());
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
