import { readFileSync, writeFileSync } from 'node:fs';

const path='src/lib/ai-core.mjs';
let source=readFileSync(path,'utf8');
const oldText='MODO FUNKO: PriceCharting es la primera fuente especializada. Después contrasta con StockX, eBay vendidos/completados y tiendas públicas. No uses hobbyDB si requiere CAPTCHA o verificación humana.';
const newText='MODO FUNKO: PriceCharting es la primera fuente especializada. Después contrasta únicamente con StockX y eBay vendidos/completados. No uses tiendas públicas, hobbyDB ni ningún otro dominio.';
if(!source.includes(oldText)) throw new Error('No se encontró la instrucción antigua de fuentes Funko');
source=source.replace(oldText,newText);
writeFileSync(path,source);

const testsPath='tests/core.mjs';
let tests=readFileSync(testsPath,'utf8');
const marker="const inventorySource=readFileSync(new URL('../src/lib/inventory.ts',import.meta.url),'utf8');";
if(!tests.includes(marker)) throw new Error('No se encontró marcador de tests');
tests=tests.replace(marker,marker+"\nconst aiCoreSource=readFileSync(new URL('../src/lib/ai-core.mjs',import.meta.url),'utf8');\nassert.doesNotMatch(aiCoreSource,/eBay vendidos\\/completados y tiendas públicas/);\nassert.match(aiCoreSource,/contrasta únicamente con StockX y eBay vendidos\\/completados/);");
writeFileSync(testsPath,tests);
