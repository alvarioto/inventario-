import fs from 'node:fs';

function replaceRequired(text, search, replacement, label){
  if(!text.includes(search)) throw new Error(`No se encontró ${label}`);
  return text.replace(search,replacement);
}

{
  const path='src/lib/ai-core.mjs';
  let s=fs.readFileSync(path,'utf8');

  s=replaceRequired(
    s,
    'Haz como máximo TRES búsquedas internas: una para PriceCharting, una para StockX y una para eBay.',
    "Haz como máximo TRES búsquedas internas: ${searchMode==='funko'?'una para hobbyDB, una para StockX y una para eBay':'una para PriceCharting, una para StockX y una para eBay'}.",
    'dominios de búsqueda Funko'
  );

  s=replaceRequired(
    s,
    "const estimateUrl='https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity);",
    "const estimateUrl='https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?filters%5Bq%5D%5B0%5D='+encodeURIComponent(identity);",
    'URL de estimación Funko'
  );

  s=replaceRequired(
    s,
    ` // Para Funko no se dispersa la búsqueda: PriceCharting va primero y, si ya aporta\n // un precio exacto visible, no se consulta ningún otro marketplace.`,
    ` // Para Funko hacemos una única búsqueda pública: hobbyDB/PPG identifica la pieza\n // y eBay/StockX aportan el precio visible si el Price Guide exige login.`,
    'comentario de estrategia Funko'
  );

  s=replaceRequired(
    s,
    `   // PriceCharting responde mejor sin adornos de marca. Conservamos la identidad\n   // visible, pero la consulta externa para Funko es SIEMPRE nombre + número + variante.\n   // También quitamos tildes para no degradar el buscador de PriceCharting.`,
    `   // Para Funko conservamos una identidad mínima: nombre + número + variante.\n   // Quitamos tildes solo en la consulta externa para robustecer la búsqueda.`,
    'comentario de consulta Funko'
  );

  fs.writeFileSync(path,s);
}

{
  const path='tests/core.mjs';
  let s=fs.readFileSync(path,'utf8');
  s=replaceRequired(
    s,
    "assert.match(orientativeFunko.summary,/Estimación orientativa/i);",
    "assert.match(orientativeFunko.summary,/Estimación orientativa/i);\nassert.match(orientativeFunko.comparables[0].url,/hobbydb\\.com/);",
    'regresión fallback hobbyDB'
  );
  fs.writeFileSync(path,s);
}

console.log('Final hobbyDB Funko cleanup applied.');
