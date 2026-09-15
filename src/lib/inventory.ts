import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { app, auth, db, demoMode } from './firebase';
import { deleteDemo, saveDemo, subscribeDemo } from './demo';
import type { AiIdentification, InventoryDraft, InventoryItem, ItemType } from '../types';

const MAX_FIRESTORE_PHOTOS = 3;
const TARGET_PHOTO_BYTES = 150 * 1024;
const TYPE_VALUES: ItemType[] = ['figure','comic','manga','card','game','funko','lego','plush','replica','movie','merch','other'];

export function subscribeItems(callback: (items: InventoryItem[]) => void, onError?: (e: Error) => void) {
  if (demoMode || !db || !auth?.currentUser) return subscribeDemo(callback);
  const uid = auth.currentUser.uid;
  const q = query(collection(db, 'users', uid, 'items'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryItem))),
    (error) => onError?.(error)
  );
}

export async function saveItem(draft: InventoryDraft, id?: string) {
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

export async function removeItem(id: string) {
  if (demoMode || !db || !auth?.currentUser) return deleteDemo(id);
  await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'items', id));
}

export async function prepareImage(file: File, maxDimension = 1700): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.86);
    if (!blob) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}

/**
 * En Spark no usamos Cloud Storage. Guardamos una copia muy comprimida de la foto
 * dentro del documento Firestore. Se limita a 3 fotos para mantenerse holgadamente
 * por debajo del límite de 1 MiB por documento.
 */
export async function uploadItemImage(file: File) {
  
  const url = await compressPhotoToDataUrl(file, TARGET_PHOTO_BYTES, 1280);
  return { path: '', url };
}

export function maxCloudPhotos() { return MAX_FIRESTORE_PHOTOS; }

async function compressPhotoToDataUrl(file: File, targetBytes: number, maxDimension: number) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la foto');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  while (blob && blob.size > targetBytes && quality > 0.36) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  if (!blob) throw new Error('No se pudo comprimir la foto');

  // Segundo escalado si la escena es especialmente compleja.
  if (blob.size > targetBytes * 1.35) {
    const shrink = Math.sqrt(targetBytes / blob.size);
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(480, Math.round(width * shrink));
    smaller.height = Math.max(480, Math.round(height * shrink));
    const sctx = smaller.getContext('2d');
    if (sctx) {
      sctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      blob = await canvasToBlob(smaller, 'image/jpeg', 0.64) || blob;
    }
  }

  return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function identifyWithAi(file: File): Promise<AiIdentification> {
  const { identifyPhoto } = await import('./api');
  return identifyPhoto(await fileToDataUrl(await prepareImage(file, 1400)));
}

export async function tryReadBarcode(file: File): Promise<string | null> {
  type DetectorCtor = new (options?: { formats?: string[] }) => { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
  const Detector = (window as typeof window & { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] });
    const results = await detector.detect(bitmap);
    return results[0]?.rawValue || null;
  } catch {
    return null;
  }
}

export async function lookupIsbn(isbn: string) {
  const cleaned = isbn.replace(/[^0-9X]/gi, '');
  if (![10, 13].includes(cleaned.length)) return null;
  const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(cleaned)}.json`);
  if (!response.ok) return null;
  const data = await response.json();
  return {
    title: data.title || '',
    year: typeof data.publish_date === 'string' ? Number(data.publish_date.match(/\d{4}/)?.[0]) || null : null,
    isbn: cleaned,
    manufacturer: Array.isArray(data.publishers) ? data.publishers[0] || '' : ''
  };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

