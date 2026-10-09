export function priceChartingIdentityMatches(
  item: Record<string, unknown>,
  guide: {title?: string; evidence?: string; url?: string} | null | undefined
): boolean;
export function researchUsesPriceChartingData(research: unknown): boolean;
export function priceChartingResearchMatchesItem(item: Record<string, unknown>, research: unknown): boolean;
