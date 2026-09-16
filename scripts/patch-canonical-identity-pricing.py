from pathlib import Path


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing pattern: {label}')
    return text.replace(old, new, 1)

p = Path('src/lib/ai-core.mjs')
s = p.read_text()

# 1) Búsqueda web específica para resolver la identidad real del producto.
old = "const specialistInstruction=searchMode==='pricecharting'?'\\n\\nMODO PRICECHARTING: busca primero y de forma prioritaria una ficha INDIVIDUAL del producto exacto en pricecharting.com. Devuelve cualquier precio público visible (Loose/OOB, CIB/In Box, New) con su importe explícito y cita esa ficha. No uses hobbyDB ni páginas con CAPTCHA, acceso denegado o error. Si no hay una coincidencia exacta en PriceCharting, indícalo buscando otra ficha del mismo sitio antes de abandonar.':searchMode==='funko'?'\\n\\nMODO FUNKO: PriceCharting es la primera fuente especializada. Después contrasta con StockX, eBay vendidos/completados y tiendas públicas. No uses hobbyDB si requiere CAPTCHA o verificación humana. Distingue OOB/loose, con caja/CIB y nuevo. Solo llames venta cerrada a una página que lo indique explícitamente. Evita lotes, accesorios y variantes distintas. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.': '';"
new = "const specialistInstruction=searchMode==='identity'?'\\n\\nMODO IDENTIDAD: NO tasar todavía. Localiza el PRODUCTO EXACTO usando prioritariamente referencia/SKU/Item No., EAN/UPC, fabricante y texto literal de la caja. Busca páginas de producto concretas y devuelve citas donde aparezca el nombre comercial real. No describas la fotografía (dorso, caja, etiqueta, código de barras) como si fuera el nombre del producto.':searchMode==='pricecharting'?'\\n\\nMODO PRICECHARTING: busca primero y de forma prioritaria una ficha INDIVIDUAL del producto exacto en pricecharting.com. Devuelve cualquier precio público visible (Loose/OOB, CIB/In Box, New) con su importe explícito y cita esa ficha. No uses hobbyDB ni páginas con CAPTCHA, acceso denegado o error. Si no hay una coincidencia exacta en PriceCharting, indícalo buscando otra ficha del mismo sitio antes de abandonar.':searchMode==='funko'?'\\n\\nMODO FUNKO: PriceCharting es la primera fuente especializada. Después contrasta con StockX, eBay vendidos/completados y tiendas públicas. No uses hobbyDB si requiere CAPTCHA o verificación humana. Distingue OOB/loose, con caja/CIB y nuevo. Solo llames venta cerrada a una página que lo indique explícitamente. Evita lotes, accesorios y variantes distintas. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.': '';"
s = rep(s, old, new, 'identity search mode')

old = " const response=await fetcher('https://api.deepseek.com/anthropic/v1/messages',{"
new = " const requestText=searchMode==='identity'\n  ?`Identifica el nombre comercial exacto de este artículo de colección a partir de sus códigos y referencias: ${query}. Busca coincidencias literales de SKU/Item No./EAN/UPC y fabricante. Necesito fuentes que permitan saber QUÉ PRODUCTO ES; todavía no busques una tasación. Si una página solo describe una caja, etiqueta o fotografía, no la uses como nombre del producto.${specialistInstruction}`\n  :`Investiga precios REALES y actuales en Internet público para este artículo de colección: ${query}.\\n\\nBusca el producto exacto, no solo la franquicia. Prioriza España y la UE. Necesito: (1) anuncios actuales comparables en eBay España, Wallapop, TodoColeccion, Catawiki, Vinted o Cardmarket cuando aplique; (2) precios actuales de CUALQUIER tienda pública si aún está a la venta; (3) PVP oficial o precio de lanzamiento únicamente cuando exista una fuente que lo respalde.\\n\\nMUY IMPORTANTE: para cada precio útil escribe el importe explícitamente en EUR en una frase separada y cita en ESA MISMA frase una sola fuente. No agrupes varios precios con varias citas en una misma frase. Si una página coincide con el producto pero no muestra precio, sigue buscando otra que sí lo muestre. Descarta lotes, accesorios, cajas vacías, reproducciones y variantes distintas. No inventes precios, no conviertas un precio sin fuente y no llames \\\"vendido\\\" a un anuncio activo.${specialistInstruction}`;\n const response=await fetcher('https://api.deepseek.com/anthropic/v1/messages',{"
s = rep(s, old, new, 'requestText')

old = "    content:`Investiga precios REALES y actuales en Internet público para este artículo de colección: ${query}.\\n\\nBusca el producto exacto, no solo la franquicia. Prioriza España y la UE. Necesito: (1) anuncios actuales comparables en eBay España, Wallapop, TodoColeccion, Catawiki, Vinted o Cardmarket cuando aplique; (2) precios actuales de CUALQUIER tienda pública si aún está a la venta; (3) PVP oficial o precio de lanzamiento únicamente cuando exista una fuente que lo respalde.\\n\\nMUY IMPORTANTE: para cada precio útil escribe el importe explícitamente en EUR en una frase separada y cita en ESA MISMA frase una sola fuente. No agrupes varios precios con varias citas en una misma frase. Si una página coincide con el producto pero no muestra precio, sigue buscando otra que sí lo muestre. Descarta lotes, accesorios, cajas vacías, reproducciones y variantes distintas. No inventes precios, no conviertas un precio sin fuente y no llames \"vendido\" a un anuncio activo.${specialistInstruction}`"
new = "    content:requestText"
s = rep(s, old, new, 'use requestText')
s = s.replace("    max_uses:8,", "    max_uses:searchMode==='identity'?5:8,", 1)

# 2) Reglas deterministas para distinguir un nombre real de una descripción de la foto.
needle = "function normalizeComparableText(value){\n return String(value||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();\n}\n"
insert = needle + r'''
export function isGenericProductTitle(value){
 const title=normalizeComparableText(value);
 if(!title)return true;
 return /\b(dorso|reverso|parte trasera|trasera|back side|codigo de barras|barcode|item no|item number|etiqueta trasera|foto trasera|fotografia trasera|caja dorso|caja trasera|packaging back)\b/.test(title)
  || /^(funko|figura|producto|objeto)\s+(caja|dorso|reverso|trasera|etiqueta)\b/.test(title);
}

export function buildResearchIdentity(item){
 const parts=[];
 if(!isGenericProductTitle(item?.title))parts.push(item.title);
 for(const value of [item?.manufacturer,item?.line,item?.character,item?.franchise,item?.edition,item?.setName,item?.cardNumber,item?.issueNumber,item?.volume,item?.platform,item?.year,item?.language,item?.country]){
  if(value!==undefined&&value!==null&&String(value).trim())parts.push(String(value).trim());
 }
 if(item?.sku)parts.push(`Item No ${String(item.sku).trim()}`);
 if(item?.barcode)parts.push(`EAN UPC ${String(item.barcode).replace(/\s/g,'')}`);
 if(item?.isbn)parts.push(`ISBN ${String(item.isbn).trim()}`);
 if(item?.gradingCompany)parts.push(String(item.gradingCompany).trim());
 if(item?.grade)parts.push(String(item.grade).trim());
 return [...new Set(parts.filter(Boolean))].join(' ').replace(/\s+/g,' ').trim();
}

function specificTitleScore(value){
 const title=String(value||'').trim();
 if(!title)return -100;
 if(isGenericProductTitle(title))return -40;
 let score=Math.min(8,title.length/18);
 if(/#\s*\d{2,5}\b/.test(title))score+=5;
 if(/\b(funko\s*pop|pop!)/i.test(title))score+=2;
 if(/\b(caja|dorso|barcode|codigo de barras|item no)\b/i.test(title))score-=8;
 return score;
}

function finalizeIdentification(result,analyses=[]){
 const parsed=identificationSchema.parse(result);
 if(!isGenericProductTitle(parsed.title))return parsed;
 const candidate=[parsed,...analyses]
  .filter(row=>row?.title&&!isGenericProductTitle(row.title))
  .sort((a,b)=>specificTitleScore(b.title)-specificTitleScore(a.title))[0];
 if(!candidate)return parsed;
 return identificationSchema.parse({...parsed,title:candidate.title});
}

async function resolveCanonicalResearchIdentity(item,config){
 const base=buildResearchIdentity(item);
 const hasStrongCode=Boolean(String(item?.sku||'').trim()||String(item?.barcode||'').trim()||String(item?.isbn||'').trim());
 const needsResolution=isGenericProductTitle(item?.title)||(hasStrongCode&&!String(item?.character||'').trim()&&!String(item?.setName||'').trim());
 if(!needsResolution||!config?.key)return {item,searchIdentity:base||String(item?.title||'').trim(),sources:[],resolvedIdentity:null};
 try{
  const lookup=[item?.manufacturer,item?.type==='funko'?'Funko':'',item?.sku?`Item No ${item.sku}`:'',item?.barcode?`EAN UPC ${item.barcode}`:'',item?.isbn?`ISBN ${item.isbn}`:'',item?.line].filter(Boolean).join(' ').trim();
  const evidence=normalizeSources(await deepseekWebSearch(lookup||base,{...config,searchMode:'identity'}),'identity-resolution');
  if(!evidence.length)return {item,searchIdentity:base||String(item?.title||'').trim(),sources:[],resolvedIdentity:null};
  const raw=await deepseek([
   {role:'system',content:'Resuelve la identidad comercial EXACTA de un objeto usando SOLO las evidencias web adjuntas y los códigos de la ficha. Devuelve JSON: {"canonicalTitle":"","manufacturer":"","line":"","character":"","franchise":"","sku":"","barcode":"","confidence":0}. canonicalTitle debe ser el nombre real del producto que una persona buscaría en PriceCharting/eBay/StockX. NUNCA describas la fotografía, el dorso, la caja, la etiqueta ni el código de barras como título. Para Funko, Item No. pertenece a sku/referencia, no al título; conserva el número Pop # solo si está respaldado por la evidencia. Si no puedes resolverlo con seguridad, canonicalTitle vacío.'},
   {role:'user',content:JSON.stringify({current:item,evidence:evidence.slice(0,10).map(x=>({title:x.title,url:x.url,snippet:x.snippet}))})}
  ],{...config,maxTokens:700,timeoutMs:25000,retries:1});
  const resolved=z.object({
   canonicalTitle:z.string().max(250).default(''),manufacturer:text,line:text,character:text,franchise:text,sku:text,barcode:text,
   confidence:z.number().min(0).max(1).default(0)
  }).parse(raw);
  if(!resolved.canonicalTitle||isGenericProductTitle(resolved.canonicalTitle)||resolved.confidence<.55){
   return {item,searchIdentity:base||String(item?.title||'').trim(),sources:evidence,resolvedIdentity:null};
  }
  const next={
   ...item,
   title:resolved.canonicalTitle,
   manufacturer:item.manufacturer||resolved.manufacturer,
   line:item.line||resolved.line,
   character:item.character||resolved.character,
   franchise:item.franchise||resolved.franchise,
   sku:item.sku||resolved.sku,
   barcode:item.barcode||resolved.barcode
  };
  return {item:next,searchIdentity:buildResearchIdentity(next),sources:evidence,resolvedIdentity:{title:next.title,manufacturer:next.manufacturer||'',line:next.line||'',character:next.character||'',franchise:next.franchise||'',sku:next.sku||'',barcode:next.barcode||''}};
 }catch{
  return {item,searchIdentity:base||String(item?.title||'').trim(),sources:[],resolvedIdentity:null};
 }
}
'''
if needle not in s:
    raise SystemExit('Missing normalizeComparableText')
s = s.replace(needle, insert, 1)

# 3) La identificación visual nunca debe convertir el lado de la caja en nombre de producto.
s = s.replace(
    "Datos desconocidos: cadena vacía. Extrae únicamente lo que puedas sostener por esta foto:",
    "Datos desconocidos: cadena vacía. title SIEMPRE debe ser el nombre comercial/canónico del producto, nunca una descripción de la vista (no uses textos como 'caja', 'dorso', 'código de barras' o 'Item No.' como título). En Funko, Item No./Item Number va en sku. Extrae únicamente lo que puedas sostener por esta foto:",
    1
)
s = s.replace(
    "Datos desconocidos: cadena vacía. No inventes ediciones, códigos, fabricante ni valores de mercado.",
    "Datos desconocidos: cadena vacía. title SIEMPRE debe ser el nombre comercial/canónico del producto, nunca una descripción de la fotografía, caja, dorso, etiqueta o código de barras. En Funko, Item No./Item Number va en sku, no en title. No inventes ediciones, códigos, fabricante ni valores de mercado.",
    1
)
s = s.replace(
    "No trates los análisis como objetos distintos. Si una vista identifica el producto de forma exacta y otra solo de forma genérica, conserva la identificación exacta.",
    "No trates los análisis como objetos distintos. title debe ser el nombre comercial real del producto: jamás una descripción de una vista, dorso, caja, etiqueta, código de barras o Item No. Si una vista identifica el producto de forma exacta y otra solo de forma genérica, conserva la identificación exacta.",
    1
)

old = " return (Number(row?.confidence)||0)*10+filled;"
new = " return (Number(row?.confidence)||0)*10+filled+specificTitleScore(row?.title);"
s = rep(s, old, new, 'identification ranking')

old = " return identificationSchema.parse({\n  ...best,\n  explanation:reason?`${best.explanation} ${reason}`.trim():best.explanation\n });"
new = " return finalizeIdentification({\n  ...best,\n  explanation:reason?`${best.explanation} ${reason}`.trim():best.explanation\n },analyses);"
s = rep(s, old, new, 'best identification finalize')

# Primera aparición tras el flujo de una sola foto.
old = "  return identificationSchema.parse(result);\n }\n\n // Con varias fotos"
new = "  return finalizeIdentification(result,[result]);\n }\n\n // Con varias fotos"
s = rep(s, old, new, 'single photo finalize')

old = "  return identificationSchema.parse(merged);\n }catch(error){"
new = "  return finalizeIdentification(merged,analyses);\n }catch(error){"
s = rep(s, old, new, 'multi photo finalize')

# 4) La investigación sanea/resuelve la identidad ANTES de PriceCharting/StockX.
old = '''export async function research(input,config){
 const {item}=researchSchema.parse(input);
 const identity=[
  item.title,item.manufacturer,item.line,item.edition,item.character,item.setName,item.cardNumber,
  item.issueNumber,item.volume,item.platform,item.year,item.language,item.country,item.barcode,item.isbn,item.sku,item.gradingCompany,item.grade
 ].filter(Boolean).join(' ');
 const isFunko=item.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(`${item.title||''} ${item.manufacturer||''} ${item.line||''}`);'''
new = '''export async function research(input,config){
 let {item}=researchSchema.parse(input);
 const resolution=await resolveCanonicalResearchIdentity(item,config);
 item=resolution.item;
 const identity=resolution.searchIdentity||buildResearchIdentity(item)||item.title;
 const isFunko=item.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(`${item.title||''} ${item.manufacturer||''} ${item.line||''}`);'''
s = rep(s, old, new, 'research canonical identity')

old = " let webSources=[];"
new = " let webSources=keepUsableSources(resolution.sources||[]);"
s = rep(s, old, new, 'seed identity sources')

# Prioridad de resumen coherente con el flujo actual.
s = s.replace(
    'Prioridad para Funko: ventas cerradas explícitas > guías PPG/hobbyDB o PriceCharting > mercado StockX > anuncios/tiendas actuales.',
    'Prioridad para Funko: PriceCharting del producto exacto y ventas cerradas explícitas > mercado StockX > anuncios/tiendas actuales. No uses hobbyDB si exige verificación.'
)

old = " return {\n  checkedAt:new Date().toISOString(),\n  summary,"
new = " return {\n  checkedAt:new Date().toISOString(),\n  searchIdentity:identity,\n  resolvedIdentity:resolution.resolvedIdentity||undefined,\n  summary,"
s = rep(s, old, new, 'research result identity')

p.write_text(s)

# 5) Tipos del resultado de investigación.
p = Path('src/types.ts')
s = p.read_text()
old = "export interface ResearchResult {\n checkedAt:string;summary:string;facts:Array<{label:string;value:string;sourceId:string}>;"
new = "export interface ResearchResult {\n checkedAt:string;searchIdentity?:string;resolvedIdentity?:{title:string;manufacturer?:string;line?:string;character?:string;franchise?:string;sku?:string;barcode?:string};summary:string;facts:Array<{label:string;value:string;sourceId:string}>;"
s = rep(s, old, new, 'ResearchResult identity fields')
p.write_text(s)

# 6) UI: adoptar el nombre real resuelto y enseñar claramente con qué nombre se buscan precios.
p = Path('src/App.tsx')
s = p.read_text()
old = '''      const result = await investigate({ ...draft, identificationConfirmed: true });
      setResearch(result);
      if (result.asking.median != null && draft.currentValue == null) {'''
new = '''      const result = await investigate({ ...draft, identificationConfirmed: true });
      setResearch(result);
      if (result.resolvedIdentity?.title) {
        setDraft((current) => ({
          ...current,
          title: result.resolvedIdentity?.title || current.title,
          manufacturer: current.manufacturer || result.resolvedIdentity?.manufacturer || '',
          line: current.line || result.resolvedIdentity?.line || '',
          character: current.character || result.resolvedIdentity?.character || '',
          franchise: current.franchise || result.resolvedIdentity?.franchise || '',
          sku: current.sku || result.resolvedIdentity?.sku || '',
          barcode: current.barcode || result.resolvedIdentity?.barcode || ''
        }));
      }
      if (result.asking.median != null && draft.currentValue == null) {'''
s = rep(s, old, new, 'apply resolved identity')

old = '''            {research && <div className="research-result">
              {research.asking.median != null ? <div className="valuation-highlight">'''
new = '''            {research && <div className="research-result">
              {research.searchIdentity && <p className="muted"><b>Buscando precios para:</b> {research.searchIdentity}</p>}
              {research.resolvedIdentity?.title && <p className="muted"><b>Producto resuelto:</b> {research.resolvedIdentity.title}</p>}
              {research.asking.median != null ? <div className="valuation-highlight">'''
s = rep(s, old, new, 'show research identity')
p.write_text(s)

# 7) Regresiones.
p = Path('tests/core.mjs')
s = p.read_text()
s = s.replace(
    "import { identificationSchema, summarizeListings, safeUrl, deepseek, deepseekWebSearch, parsePublicListings, fetchPriceChartingGuide, research, identify } from '../server/core.mjs';",
    "import { identificationSchema, summarizeListings, safeUrl, deepseek, deepseekWebSearch, parsePublicListings, fetchPriceChartingGuide, research, identify, isGenericProductTitle, buildResearchIdentity } from '../server/core.mjs';"
)
anchor = "assert.equal(safeUrl('javascript:alert(1)'),null);\n"
extra = r'''

assert.equal(isGenericProductTitle('Funko caja – dorso con código de barras e Item No. 90310 Funko'),true);
const cleanIdentity=buildResearchIdentity({title:'Funko caja – dorso con código de barras e Item No. 90310 Funko',type:'funko',manufacturer:'Funko',sku:'90310',barcode:'889698903105'});
assert.doesNotMatch(cleanIdentity,/dorso|codigo de barras/i);
assert.match(cleanIdentity,/90310/);
assert.match(cleanIdentity,/889698903105/);
'''
if anchor not in s:
    raise SystemExit('Missing test anchor')
s = s.replace(anchor, anchor + extra, 1)

# Fusionar varias fotos: incluso si la fusión devuelve un título descriptivo del dorso,
# debe conservarse el título comercial específico visto en otra fotografía.
old = "  const result={...partials[0],confidence:0.99,explanation:'Las tres vistas coinciden en personaje, línea y número 1982'};"
new = "  const result={...partials[0],title:'Funko caja – dorso con código de barras e Item No. 1982 Funko',confidence:0.99,explanation:'Las tres vistas coinciden en personaje, línea y número 1982'};"
s = rep(s, old, new, 'generic merged title regression')

s += "\nassert.match(readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),/Buscando precios para:/);\n"
p.write_text(s)
