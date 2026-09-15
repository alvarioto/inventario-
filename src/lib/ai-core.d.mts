import type { AiIdentification, ResearchResult } from '../types';
export function identify(images: string | string[], config: {key: string; model?: string; fetcher?: typeof fetch}): Promise<AiIdentification>;
export function research(input: unknown, config: {key: string; model?: string; fetcher?: typeof fetch}): Promise<ResearchResult>;
export function deepseek(messages: unknown[], config: {key: string; model?: string; fetcher?: typeof fetch}): Promise<unknown>;
