import { BrowserMultiFormatReader } from '@zxing/browser';
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
import { auth, db, demoMode } from './firebase';
import { identifyPhoto } from './api';
import { deleteDemo, saveDemo, subscribeDemo } from './demo';
import type { AiIdentification, InventoryDraft, InventoryItem } from '../types';

const MAX_FIRESTORE_PHOTOS = 5;
const TARGET_PHOTO_BYTES = 80 * 1024;

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

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.()
      };
    } catch {
      // Safari/iOS puede fallar con algunas fotos de la fototeca. Probamos con <img>.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('El navegador no pudo abrir la foto. Prueba a hacerla de nuevo.'));
    image.src = objectUrl;
  });
  return {
    source: image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    close: () => URL.revokeObjectURL(objectUrl)
  };
}

export async function prepareImage(file: File, maxDimension = 1700): Promise<File> {
  if (file.type && !file.type.startsWith('image/')) return file;
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
    if (!ctx) return file;
    ctx.drawImage(loaded.source, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.86);
    if (!blob) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    loaded?.close();
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}

/**
 * En Spark no usamos Cloud Storage. Guardamos una copia muy comprimida de la foto
 * dentro del documento Firestore. Se limita a 5 fotos comprimidas para mantenerse
 * por debajo del límite de 1 MiB por documento.
 */
export async function uploadItemImage(file: File) {
  const url = await compressPhotoToDataUrl(file, TARGET_PHOTO_BYTES, 1280);
  return { path: '', url };
}

export function maxCloudPhotos() { return MAX_FIRESTORE_PHOTOS; }

async function compressPhotoToDataUrl(file: File, targetBytes: number, maxDimension: number) {
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function identifyWithAi(files: File[]): Promise<AiIdentification> {
  const selected = files.slice(0, MAX_FIRESTORE_PHOTOS);
  if (!selected.length) throw new Error('Añade al menos una foto del artículo.');
  const prepared = await Promise.all(selected.map((file) => prepareImage(file, 1200)));
  const [images, codes] = await Promise.all([
    Promise.all(prepared.map(fileToDataUrl)),
    Promise.all(prepared.map(tryReadBarcode))
  ]);
  const identification = await identifyPhoto(images);
  const detectedCode = codes.find(Boolean) || null;
  if (detectedCode && !identification.barcode) identification.barcode = detectedCode;
  if (detectedCode && /^(978|979)\d{10}$/.test(detectedCode) && !identification.isbn) {
    identification.isbn = detectedCode;
  }
  return identification;
}

async function readBarcodeNative(file: File): Promise<string | null> {
  type DetectorCtor = new (options?: { formats?: string[] }) => {
    detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
  };
  const Detector = (window as typeof window & { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Detector || typeof createImageBitmap !== 'function') return null;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] });
    const results = await detector.detect(bitmap);
    return results[0]?.rawValue?.trim() || null;
  } catch {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

async function readBarcodeZxing(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromImageUrl(objectUrl);
    return result?.getText()?.trim() || null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function tryReadBarcode(file: File): Promise<string | null> {
  return (await readBarcodeNative(file)) || (await readBarcodeZxing(file));
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
