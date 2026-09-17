import fs from 'node:fs';

const corePath='src/lib/ai-core.mjs';
const testPath='tests/core.mjs';
let core=fs.readFileSync(corePath,'utf8');
let tests=fs.readFileSync(testPath,'utf8');

const marker=`function funkoTextMatches(item,raw){\n const {nameTokens,popNumber,variant,variantTokens}=funkoMatchParts(item);\n const hay=normalizeComparableText(raw);\n if(nameTokens.length){\n  const hits=nameTokens.filter(token=>hay.includes(token)).length;\n  if(hits<Math.max(1,Math.ceil(nameTokens.length*.6)))return false;\n }\n const explicitNumbers=[...String(raw||'').matchAll(/#\\s*(\\d{1,5})\\b/g)].map(match=>match[1]);\n if(popNumber&&explicitNumbers.length&&!explicitNumbers.includes(popNumber))return false;\n if(variantTokens.length&&!variantTokens.every(token=>hay.includes(token)))return false;\n if(!variant){\n  const special=funkoVariantFromText(raw);\n  if(special&&special!=='Special Edition'&&special!=='Exclusive')return false;\n }\n return Boolean(nameTokens.length||popNumber);\n}\n`;
if(!core.includes(marker))throw new Error('No se encontró funkoTextMatches actual');
const helper=`${marker}\nfunction hobbyDbTextMatches(item,raw){\n if(!funkoTextMatches(item,raw))return false;\n const text=String(raw||'').replace(/\\s+/g,' ').trim();\n const popNumber=normalizeFunkoNumber(deriveFunkoFields({...item,type:'funko'}).popNumber)||funkoNumberFromTitle(item?.title);\n const brand=text.match(/\\bBrand\\s*:\\s*([^|·]{1,100})/i);\n if(brand&&!/\\bFunko\\b/i.test(brand[1]))return false;\n const series=text.match(/\\bSeries\\s*:\\s*([^|·]{1,140})/i);\n if(series&&!/\\bPop!?\\b/i.test(series[1]))return false;\n const type=text.match(/\\bType\\s*:\\s*([^|·]{1,100})/i);\n if(type&&!/\\bArt Toys?\\b/i.test(type[1]))return false;\n const refs=[...text.matchAll(/\\b(?:Reference|Ref(?:erence)?)\\s*(?:#|No\\.?)?\\s*:?\\s*#?\\s*(\\d{1,5})\\b/gi)].map(match=>match[1]);\n if(popNumber&&refs.length&&!refs.includes(popNumber))return false;\n // Una ficha detallada de hobbyDB que expone sus metadatos debe confirmar marca + serie + referencia.\n const detailed=/\\b(?:Brand|Series|Reference)\\s*:/i.test(text);\n if(detailed){\n  if(!/\\bBrand\\s*:\\s*Funko\\b/i.test(text))return false;\n  if(!/\\bSeries\\s*:[^|·]{0,140}\\bPop!?\\b/i.test(text))return false;\n  if(popNumber&&!new RegExp('\\\\b(?:Reference|Ref(?:erence)?)\\\\s*(?:#|No\\\\.?)?\\\\s*:?\\\\s*#?\\\\s*'+popNumber+'\\\\b','i').test(text))return false;\n }\n return true;\n}\n`;
core=core.replace(marker,helper);

const oldScore=` if(host.includes('hobbydb.com')){\n  if(/\\/catalog_items\\/[^/?]+/.test(path))score+=40;\n  if(/\\/catalog_items\\/?$/.test(path))score-=15;\n }`;
const newScore=` if(host.includes('hobbydb.com')){\n  if(/\\/catalog_items\\/[^/?]+/.test(path))score+=40;\n  if(/\\/catalog_items\\/?$/.test(path))score-=15;\n  if(item?.type==='funko')score+=hobbyDbTextMatches(item,raw)?80:-120;\n }`;
if(!core.includes(oldScore))throw new Error('No se encontró score hobbyDB');
core=core.replace(oldScore,newScore);

const oldRelevant=` if(isFunko)return rows.filter(source=>funkoTextMatches({...item,type:'funko'},\`${'${source.title||\'\'} ${source.snippet||\'\'}'}\`)).slice(0,6);`;
const newRelevant=` if(isFunko)return rows.filter(source=>{\n  const raw=\`${'${source.title||\'\'} ${source.snippet||\'\'}'}\`;\n  return hostOf(source.url).includes('hobbydb.com')\n   ?hobbyDbTextMatches({...item,type:'funko'},raw)\n   :funkoTextMatches({...item,type:'funko'},raw);\n }).slice(0,6);`;
if(!core.includes(oldRelevant))throw new Error('No se encontró relevantSourcesForItem Funko');
core=core.replace(oldRelevant,newRelevant);

const oldSpecial=`MODO FUNKO: hobbyDB/Pop Price Guide es la primera guía para identificar la pieza exacta. Después contrasta con eBay y StockX para obtener precios públicos del MISMO Funko. Si hobbyDB exige login, Premium o CAPTCHA para mostrar el Price Guide, no lo inventes ni intentes saltarlo: continúa con eBay y StockX para que la valoración no se quede vacía. Distingue Chase, Flocked, Glow, Metallic, Diamond y demás variantes. Evita lotes, accesorios, protectores y cajas vacías. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.`;
const newSpecial=`MODO FUNKO: hobbyDB/Pop Price Guide es la primera guía para IDENTIFICAR la pieza exacta. En hobbyDB busca primero nombre + número Pop, abre los candidatos y NO aceptes la página general de resultados como coincidencia. La ficha individual válida debe confirmar Brand: Funko, una Series que contenga Pop!, y Reference # igual al número Pop solicitado; si aparecen metadatos Type, para un Funko normal debe ser Art Toys. Descarta cartas, bustos, cascos, libros u otros objetos aunque tengan el mismo personaje. Si hay variante (Chase, Flocked, Glow, Metallic, Diamond, Black Light, Exclusive, etc.), debe coincidir también Production Status, variante o título. Después contrasta con eBay y StockX para obtener precios públicos del MISMO Funko. Si hobbyDB exige login, Premium o CAPTCHA para mostrar el Price Guide, no inventes el valor ni saltes la protección: conserva la ficha exacta y continúa con eBay/StockX. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.`;
if(!core.includes(oldSpecial))throw new Error('No se encontró prompt MODO FUNKO');
core=core.replace(oldSpecial,newSpecial);

core=core.replace("...(isFunko?{ppg:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?filters%5Bq%5D%5B0%5D='+encodeURIComponent(identity)}:priceChartingSupported?{priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity)}:{}),","...(isFunko?{ppg:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items?q='+encodeURIComponent(identity)}:priceChartingSupported?{priceCharting:'https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity)}:{}),");

const oldFixture=`   {type:'web_search_result',title:'Éomer | Art Toys | hobbyDB',url:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/eomer-art-toys',cited_text:'Funko Pop Movies The Lord of the Rings Éomer #1982'},`;
const newFixture=`   {type:'web_search_result',title:'Éomer | Statues & Busts | hobbyDB',url:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/eomer-bust',cited_text:'Type: Statues & Busts Brand: Weta Workshop Reference #: 1982 Éomer'},\n   {type:'web_search_result',title:'Éomer | Art Toys | hobbyDB',url:'https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/eomer-art-toys',cited_text:'Type: Art Toys Brand: Funko Series: Pop! Movies Reference #: 1982 Related Subjects: The Lord of the Rings Éomer'},`;
if(!tests.includes(oldFixture))throw new Error('No se encontró fixture hobbyDB');
tests=tests.replace(oldFixture,newFixture);

const oldAsserts=`assert.ok(hobbyResearch.sources.some(source=>source.url.includes('hobbydb.com')));\nassert.ok(hobbyResearch.comparables.some(row=>row.url.includes('ebay.es')));`;
const newAsserts=`assert.ok(hobbyResearch.sources.some(source=>source.url.includes('hobbydb.com')));\nassert.equal(hobbyResearch.sources.filter(source=>source.url.includes('hobbydb.com')).length,1);\nassert.ok(hobbyResearch.sources.some(source=>source.url.includes('eomer-art-toys')));\nassert.ok(!hobbyResearch.sources.some(source=>source.url.includes('eomer-bust')));\nassert.match(hobbyPrompts[0],/Brand: Funko/);\nassert.match(hobbyPrompts[0],/Reference #/);\nassert.ok(hobbyResearch.comparables.some(row=>row.url.includes('ebay.es')));`;
if(!tests.includes(oldAsserts))throw new Error('No se encontró bloque de asserts hobbyDB');
tests=tests.replace(oldAsserts,newAsserts);

tests=tests.replace("assert.match(hobbyResearch.links.ppg,/hobbydb\\.com/);","assert.match(hobbyResearch.links.ppg,/hobbydb\\.com/);\nassert.match(hobbyResearch.links.ppg,/\\?q=/);");

fs.writeFileSync(corePath,core);
fs.writeFileSync(testPath,tests);
