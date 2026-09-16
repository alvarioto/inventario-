export type ItemType =
  | 'figure'
  | 'comic'
  | 'manga'
  | 'card'
  | 'game'
  | 'funko'
  | 'lego'
  | 'plush'
  | 'replica'
  | 'movie'
  | 'merch'
  | 'other';

export type ItemStatus = 'collection' | 'wishlist' | 'sold';
export type ItemCondition = 'new' | 'like-new' | 'very-good' | 'good' | 'fair' | 'poor';

export interface InventoryItem {
  id: string;
  title: string;
  type: ItemType;
  status: ItemStatus;
  franchise?: string;
  character?: string;
  manufacturer?: string;
  line?: string;
  edition?: string;
  issueNumber?: string;
  volume?: string;
  setName?: string;
  cardNumber?: string;
  rarity?: string;
  platform?: string;
  year?: number | null;
  barcode?: string;
  isbn?: string;
  sku?: string;
  condition?: ItemCondition;
  sealed?: boolean;
  hasBox?: boolean;
  signed?: boolean;
  graded?: boolean;
  gradingCompany?: string;
  grade?: string;
  purchasePrice?: number | null;
  currentValue?: number | null;
  soldPrice?: number | null;
  currency?: string;
  purchaseDate?: string;
  soldDate?: string;
  store?: string;
  country?: string;
  room?: string;
  furniture?: string;
  shelf?: string;
  box?: string;
  notes?: string;
  tags?: string[];
  imageUrls?: string[];
  imagePaths?: string[];
  favorite?: boolean;
  language?: string;
  research?: ResearchResult;
  boxId?: string;
  borrowedBy?: string;
  identificationConfirmed?: boolean;
  aiConfidence?: number | null;
  aiExplanation?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type InventoryDraft = Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>;

export interface AiIdentification {
  title: string;
  type: ItemType;
  franchise: string;
  character: string;
  manufacturer: string;
  line: string;
  edition: string;
  issueNumber: string;
  volume: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  platform: string;
  year: number | null;
  barcode: string;
  isbn: string;
  sku: string;
  country: string;
  language: string;
  condition: ItemCondition | null;
  hasBox: boolean | null;
  sealed: boolean | null;
  signed: boolean | null;
  graded: boolean | null;
  gradingCompany: string;
  grade: string;
  confidence: number;
  explanation: string;
  tags: string[];
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  figure: 'Figura',
  comic: 'Cómic',
  manga: 'Manga',
  card: 'Carta',
  game: 'Videojuego',
  funko: 'Funko',
  lego: 'LEGO',
  plush: 'Peluche',
  replica: 'Réplica',
  movie: 'Película / edición',
  merch: 'Merchandising',
  other: 'Otro'
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  collection: 'Colección',
  wishlist: 'Wishlist',
  sold: 'Vendido'
};

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  new: 'Nuevo',
  'like-new': 'Como nuevo',
  'very-good': 'Muy bueno',
  good: 'Bueno',
  fair: 'Aceptable',
  poor: 'Malo'
};

export interface ResearchSource {id:string;kind:string;title:string;url:string;snippet:string}
export interface MarketListing {id:string;title:string;url:string;price:number;currency:string;shipping:number|null;condition:string;sourceType?:'sold'|'guide'|'market'|'shop';originalPrice?:number;originalCurrency?:string}
export interface ResearchResult {
 checkedAt:string;summary:string;facts:Array<{label:string;value:string;sourceId:string}>;
 sources:ResearchSource[];listings:MarketListing[];comparables:MarketListing[];
 asking:{kind:string;currency:string;count:number;min:number|null;max:number|null;median:number|null;label:string};
 sold:{available:boolean;reason:string;count?:number;median?:number|null};warnings:string[];links:{ebay:string;sold:string;web:string;ppg?:string;priceCharting?:string;stockx?:string};
}
