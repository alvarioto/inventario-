import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { deepseek, identify, research } from './ai-core.mjs';
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

const directFetch: typeof fetch = async (input, init) => {
  try { return await fetch(input, init); }
  catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('DeepSeek ha tardado demasiado. Vuelve a intentarlo.');
    }
    throw new Error('No se pudo conectar directamente con DeepSeek. Comprueba la conexión; si persiste, el proveedor puede estar bloqueando las peticiones del navegador.');
  }
};
function config() {
  const key = getPersonalKey();
  if (!key) throw new Error('Activa tu clave de DeepSeek en Ajustes → IA directa.');
  return { key, model: 'deepseek-flash', fetcher: directFetch };
}
export const identifyDirect = (images: string[]) => identify(images, config());
export const researchDirect = (item: Partial<InventoryDraft>) => research({confirmed: true, item}, config());
export const testDirect = () => deepseek([
  {role: 'user', content: 'Responde únicamente con este JSON: {"ok":true}'}
], config());
