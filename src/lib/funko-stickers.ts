export type FunkoStickerKind = 'variant' | 'exclusive' | 'convention' | 'retailer' | 'generic';

export interface FunkoStickerDefinition {
  id: string;
  label: string;
  kind: FunkoStickerKind;
  variant?: string;
  aliases: string[];
  exactTexts: string[];
  visualHints: string[];
  affectsValue: boolean;
  referenceImage?: string;
}

/**
 * Mini BBDD de stickers Funko.
 *
 * Regla principal: el color o la forma NUNCA son prueba suficiente para asignar
 * una variante. Para dar por válida una pegatina debe existir texto legible que
 * coincida con exactTexts/aliases. visualHints sirven solo para desempatar o para
 * mostrar ayuda visual al usuario.
 *
 * referenceImage está preparado para usar imágenes locales propias (por ejemplo
 * /funko-stickers/chase.webp) sin depender de URLs externas.
 */
export const FUNKO_STICKERS: FunkoStickerDefinition[] = [
  {
    id: 'chase',
    label: 'Chase',
    kind: 'variant',
    variant: 'Chase',
    aliases: ['chase', 'limited edition chase'],
    exactTexts: ['CHASE', 'LIMITED EDITION CHASE'],
    visualHints: ['pegatina redonda amarilla habitual', 'texto CHASE claramente legible'],
    affectsValue: true
  },
  {
    id: 'diamond-collection',
    label: 'Diamond Collection',
    kind: 'variant',
    variant: 'Diamond Collection',
    aliases: ['diamond', 'diamond collection'],
    exactTexts: ['DIAMOND COLLECTION', 'DIAMOND'],
    visualHints: ['acabado brillante o diamantado', 'texto DIAMOND / DIAMOND COLLECTION legible'],
    affectsValue: true
  },
  {
    id: 'flocked',
    label: 'Flocked',
    kind: 'variant',
    variant: 'Flocked',
    aliases: ['flocked'],
    exactTexts: ['FLOCKED'],
    visualHints: ['texto FLOCKED legible'],
    affectsValue: true
  },
  {
    id: 'glow-in-the-dark',
    label: 'Glow in the Dark',
    kind: 'variant',
    variant: 'Glow in the Dark',
    aliases: ['glow in the dark', 'gitd', 'glow'],
    exactTexts: ['GLOW IN THE DARK', 'GITD'],
    visualHints: ['texto GLOW IN THE DARK o GITD legible'],
    affectsValue: true
  },
  {
    id: 'metallic',
    label: 'Metallic',
    kind: 'variant',
    variant: 'Metallic',
    aliases: ['metallic'],
    exactTexts: ['METALLIC'],
    visualHints: ['texto METALLIC legible'],
    affectsValue: true
  },
  {
    id: 'black-light',
    label: 'Black Light',
    kind: 'variant',
    variant: 'Black Light',
    aliases: ['black light'],
    exactTexts: ['BLACK LIGHT'],
    visualHints: ['texto BLACK LIGHT legible'],
    affectsValue: true
  },
  {
    id: 'chrome',
    label: 'Chrome',
    kind: 'variant',
    variant: 'Chrome',
    aliases: ['chrome'],
    exactTexts: ['CHROME'],
    visualHints: ['texto CHROME legible'],
    affectsValue: true
  },
  {
    id: 'scented',
    label: 'Scented',
    kind: 'variant',
    variant: 'Scented',
    aliases: ['scented'],
    exactTexts: ['SCENTED'],
    visualHints: ['texto SCENTED legible'],
    affectsValue: true
  },
  {
    id: 'patina',
    label: 'Patina',
    kind: 'variant',
    variant: 'Patina',
    aliases: ['patina'],
    exactTexts: ['PATINA'],
    visualHints: ['texto PATINA legible'],
    affectsValue: true
  },
  {
    id: 'art-series',
    label: 'Art Series',
    kind: 'variant',
    variant: 'Art Series',
    aliases: ['art series', 'artist series'],
    exactTexts: ['ART SERIES', 'ARTIST SERIES'],
    visualHints: ['texto ART SERIES legible'],
    affectsValue: true
  },
  {
    id: 'funko-exclusive',
    label: 'Funko Exclusive',
    kind: 'exclusive',
    aliases: ['funko exclusive', 'funko shop exclusive'],
    exactTexts: ['FUNKO EXCLUSIVE', 'FUNKO SHOP EXCLUSIVE'],
    visualHints: ['logo Funko acompañado de EXCLUSIVE'],
    affectsValue: true
  },
  {
    id: 'special-edition',
    label: 'Special Edition',
    kind: 'generic',
    aliases: ['special edition'],
    exactTexts: ['SPECIAL EDITION'],
    visualHints: ['texto SPECIAL EDITION legible'],
    affectsValue: true
  },
  {
    id: 'hot-topic-exclusive',
    label: 'Hot Topic Exclusive',
    kind: 'retailer',
    aliases: ['hot topic exclusive', 'hot topic'],
    exactTexts: ['HOT TOPIC EXCLUSIVE', 'HOT TOPIC'],
    visualHints: ['logo Hot Topic legible'],
    affectsValue: true
  },
  {
    id: 'target-exclusive',
    label: 'Target Exclusive',
    kind: 'retailer',
    aliases: ['target exclusive', 'only at target'],
    exactTexts: ['TARGET EXCLUSIVE', 'ONLY AT TARGET'],
    visualHints: ['diana/logotipo Target y texto legible'],
    affectsValue: true
  },
  {
    id: 'walmart-exclusive',
    label: 'Walmart Exclusive',
    kind: 'retailer',
    aliases: ['walmart exclusive', 'only at walmart'],
    exactTexts: ['WALMART EXCLUSIVE', 'ONLY AT WALMART'],
    visualHints: ['texto WALMART legible'],
    affectsValue: true
  },
  {
    id: 'gamestop-exclusive',
    label: 'GameStop Exclusive',
    kind: 'retailer',
    aliases: ['gamestop exclusive', 'only at gamestop'],
    exactTexts: ['GAMESTOP EXCLUSIVE', 'ONLY AT GAMESTOP'],
    visualHints: ['texto GAMESTOP legible'],
    affectsValue: true
  },
  {
    id: 'amazon-exclusive',
    label: 'Amazon Exclusive',
    kind: 'retailer',
    aliases: ['amazon exclusive'],
    exactTexts: ['AMAZON EXCLUSIVE'],
    visualHints: ['texto AMAZON EXCLUSIVE legible'],
    affectsValue: true
  },
  {
    id: 'entertainment-earth-exclusive',
    label: 'Entertainment Earth Exclusive',
    kind: 'retailer',
    aliases: ['entertainment earth exclusive'],
    exactTexts: ['ENTERTAINMENT EARTH EXCLUSIVE'],
    visualHints: ['texto ENTERTAINMENT EARTH legible'],
    affectsValue: true
  },
  {
    id: 'boxlunch-exclusive',
    label: 'BoxLunch Exclusive',
    kind: 'retailer',
    aliases: ['boxlunch exclusive', 'box lunch exclusive'],
    exactTexts: ['BOXLUNCH EXCLUSIVE', 'BOX LUNCH EXCLUSIVE'],
    visualHints: ['texto BOXLUNCH / BOX LUNCH legible'],
    affectsValue: true
  },
  {
    id: 'sdcc',
    label: 'San Diego Comic-Con',
    kind: 'convention',
    aliases: ['sdcc', 'san diego comic con', 'san diego comic-con'],
    exactTexts: ['SDCC', 'SAN DIEGO COMIC-CON', 'SAN DIEGO COMIC CON'],
    visualHints: ['nombre de San Diego Comic-Con o SDCC legible'],
    affectsValue: true
  },
  {
    id: 'nycc',
    label: 'New York Comic Con',
    kind: 'convention',
    aliases: ['nycc', 'new york comic con'],
    exactTexts: ['NYCC', 'NEW YORK COMIC CON'],
    visualHints: ['NYCC / NEW YORK COMIC CON legible'],
    affectsValue: true
  },
  {
    id: 'eccc',
    label: 'Emerald City Comic Con',
    kind: 'convention',
    aliases: ['eccc', 'emerald city comic con'],
    exactTexts: ['ECCC', 'EMERALD CITY COMIC CON'],
    visualHints: ['ECCC / EMERALD CITY COMIC CON legible'],
    affectsValue: true
  },
  {
    id: 'wondercon',
    label: 'WonderCon',
    kind: 'convention',
    aliases: ['wondercon'],
    exactTexts: ['WONDERCON'],
    visualHints: ['WONDERCON legible'],
    affectsValue: true
  }
];

function normalizeStickerText(value: string) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasNegationAround(text: string, needle: string) {
  const normalized = normalizeStickerText(text);
  const target = normalizeStickerText(needle);
  const index = normalized.indexOf(target);
  if (index < 0) return false;
  const before = normalized.slice(Math.max(0, index - 45), index);
  return /(?:^|\s)(NO|NOT|WITHOUT|SIN|NO VISIBLE|NO SE VE)(?:\s|$)/.test(before);
}

export function detectFunkoSticker(text: string) {
  const normalized = normalizeStickerText(text);
  if (!normalized) return null;

  const matches = FUNKO_STICKERS.flatMap(def => {
    const candidates = [...def.exactTexts, ...def.aliases];
    const hit = candidates
      .map(value => normalizeStickerText(value))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .find(value => normalized.includes(value) && !hasNegationAround(text, value));
    return hit ? [{ definition: def, matchedText: hit }] : [];
  });

  if (!matches.length) return null;

  // Una lectura explícita de CHASE manda sobre stickers de tienda/convenio que puedan coexistir.
  matches.sort((a, b) => {
    const av = a.definition.id === 'chase' ? 100 : a.definition.kind === 'variant' ? 80 : 20;
    const bv = b.definition.id === 'chase' ? 100 : b.definition.kind === 'variant' ? 80 : 20;
    return bv - av || b.matchedText.length - a.matchedText.length;
  });
  return matches[0];
}

export function detectAllFunkoStickers(text: string) {
  const normalized = normalizeStickerText(text);
  if (!normalized) return [];
  return FUNKO_STICKERS.flatMap(def => {
    const hit = [...def.exactTexts, ...def.aliases]
      .map(value => normalizeStickerText(value))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .find(value => normalized.includes(value) && !hasNegationAround(text, value));
    return hit ? [{ definition: def, matchedText: hit }] : [];
  });
}
