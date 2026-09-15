import type { InventoryDraft, InventoryItem } from '../types';

const KEY = 'frikivault.demo.items.v2';

const seed: InventoryItem[] = [
  {
    id: 'demo-eva',
    title: 'EVA-01 Test Type',
    type: 'figure',
    status: 'collection',
    franchise: 'Neon Genesis Evangelion',
    character: 'EVA-01',
    manufacturer: 'Bandai',
    line: 'Robot Spirits',
    year: 2024,
    condition: 'like-new',
    hasBox: true,
    purchasePrice: 89.95,
    currentValue: 119.9,
    currency: 'EUR',
    room: 'Despacho',
    furniture: 'Vitrina 1',
    shelf: 'Balda 2',
    favorite: true,
    tags: ['anime', 'mecha', 'evangelion']
  },
  {
    id: 'demo-batman',
    title: 'Batman #125',
    type: 'comic',
    status: 'collection',
    franchise: 'Batman',
    manufacturer: 'DC Comics',
    issueNumber: '125',
    edition: 'Variant cover',
    condition: 'very-good',
    purchasePrice: 12,
    currentValue: 18,
    currency: 'EUR',
    room: 'Despacho',
    furniture: 'Estantería cómics',
    tags: ['batman', 'dc']
  },
  {
    id: 'demo-pikachu',
    title: 'Pikachu Illustration Rare',
    type: 'card',
    status: 'wishlist',
    franchise: 'Pokémon',
    setName: '151',
    cardNumber: '173/165',
    rarity: 'Illustration Rare',
    currentValue: 32,
    currency: 'EUR',
    tags: ['pokemon', 'pikachu', 'tcg']
  }
];

function read(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as InventoryItem[];
  } catch {
    return seed;
  }
}

function write(items: InventoryItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('frikivault-demo-change'));
}

export function subscribeDemo(callback: (items: InventoryItem[]) => void) {
  const emit = () => callback(read());
  emit();
  window.addEventListener('frikivault-demo-change', emit);
  window.addEventListener('storage', emit);
  return () => {
    window.removeEventListener('frikivault-demo-change', emit);
    window.removeEventListener('storage', emit);
  };
}

export function saveDemo(draft: InventoryDraft, id?: string) {
  const items = read();
  const item: InventoryItem = { ...draft, id: id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
  const idx = items.findIndex((x) => x.id === item.id);
  if (idx >= 0) items[idx] = { ...items[idx], ...item };
  else items.unshift({ ...item, createdAt: new Date().toISOString() });
  write(items);
  return item;
}

export function deleteDemo(id: string) {
  write(read().filter((x) => x.id !== id));
}

export function importDemo(items: InventoryItem[]) {
  write(items);
}
