from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing pattern: {label}')
    return text.replace(old, new, 1)

# ---------------- ai-core.mjs ----------------
p = Path('src/lib/ai-core.mjs')
s = p.read_text()

old_summary = '''export function summarizeListings(listings){
 const eur=listings.filter(x=>x.currency==='EUR'&&Number.isFinite(x.price)&&x.price>=0);
 const sold=eur.filter(x=>x.sourceType==='sold');
 const guides=eur.filter(x=>x.sourceType==='guide');
 // Prioridad: ventas cerradas verificables; si no hay suficientes, guías especializadas
 // (PPG/hobbyDB o PriceCharting); por último mercado/tiendas/anuncios actuales.
 let selected=sold.length>=2?sold:(guides.length?[...sold,...guides]:eur);
 let totals=selected
  .map(x=>x.price+(Number.isFinite(x.shipping)&&x.shipping>=0?x.shipping:0))
  .sort((a,b)=>a-b);
 if(totals.length>=5)totals=totals.slice(1,-1);
 const n=totals.length;
 const kind=sold.length>=2?'sold':guides.length?'guide':'asking';
 const label=kind==='sold'
  ?'Estimación basada prioritariamente en ventas cerradas comparables detectadas.'
  :kind==='guide'
   ?'Estimación basada prioritariamente en guías especializadas de coleccionismo, contrastada con el mercado público.'
   :'Baremo de precios públicos comparables encontrados en Internet; no implica ventas cerradas.';
 return {
  kind,
  currency:'EUR',
  count:n,
  min:n?totals[0]:null,
  max:n?totals[n-1]:null,
  median:n?(totals[Math.floor((n-1)/2)]+totals[Math.ceil((n-1)/2)])/2:null,
  label
 };
}'''
new_summary = '''export function summarizeListings(listings){
 const eur=listings.filter(x=>x.currency==='EUR'&&Number.isFinite(x.price)&&x.price>0);
 const sold=eur.filter(x=>x.sourceType==='sold');
 const guides=eur.filter(x=>x.sourceType==='guide');
 // Dos o más ventas cerradas exactas son la evidencia principal. Si no las hay,
 // comparamos TODAS las referencias ya validadas (guías + mercado + tiendas),
 // en vez de quedarnos con una única guía y perder el contexto de mercado.
 const selected=sold.length>=2?sold:eur;
 let totals=selected
  .map(x=>x.price+(Number.isFinite(x.shipping)&&x.shipping>=0?x.shipping:0))
  .sort((a,b)=>a-b);
 // Recorte robusto: primero elimina precios absurdamente alejados de la mediana y,
 // con 5+ datos, descarta además un extremo a cada lado.
 if(totals.length>=4){
  const mid=(totals[Math.floor((totals.length-1)/2)]+totals[Math.ceil((totals.length-1)/2)])/2;
  const robust=totals.filter(value=>value>=mid*.4&&value<=mid*2.5);
  if(robust.length>=2)totals=robust;
 }
 if(totals.length>=5)totals=totals.slice(1,-1);
 const n=totals.length;
 const kind=sold.length>=2?'sold':guides.length?'guide':'asking';
 const label=kind==='sold'
  ?'Estimación basada prioritariamente en ventas cerradas comparables detectadas.'
  :kind==='guide'
   ?'Estimación combinada: guía especializada contrastada con precios públicos comparables del mismo artículo.'
   :'Estimación por mediana de precios públicos comparables del mismo artículo; no implica ventas cerradas.';
 return {
  kind,
  currency:'EUR',
  count:n,
  min:n?totals[0]:null,
  max:n?totals[n-1]:null,
  median:n?(totals[Math.floor((n-1)/2)]+totals[Math.ceil((n-1)/2)])/2:null,
  label
 };
}'''
s = replace_once(s, old_summary, new_summary, 'robust summary')

old_rate_end = '''async function fetchUsdEurRate(fetcher){
 try{
  const r=await fetcher('https://api.frankfurter.dev/v2/providers/ecb/rate/usd/eur',{signal:AbortSignal.timeout(10000)});
  if(!r.ok)return null;
  const data=await r.json();
  const rate=Number(data?.rate);
  return Number.isFinite(rate)&&rate>0?rate:null;
 }catch{return null}
}

export function parsePublicListings'''
new_rate_end = '''async function fetchUsdEurRate(fetcher){
 try{
  const r=await fetcher('https://api.frankfurter.dev/v2/providers/ecb/rate/usd/eur',{signal:AbortSignal.timeout(10000)});
  if(!r.ok)return null;
  const data=await r.json();
  const rate=Number(data?.rate);
  return Number.isFinite(rate)&&rate>0?rate:null;
 }catch{return null}
}

function centsValue(value){
 const n=Number(value);
 return Number.isInteger(n)&&n>0?n/100:null;
}

export async function fetchPriceChartingGuide(item,token,fetcher=fetch,usdEurRate=null){
 if(!token)return {sources:[],listings:[]};
 if(!/^[A-Za-z0-9]{40}$/.test(String(token)))throw new Error('El token de PriceCharting debe tener 40 caracteres.');
 const query=[item.title,item.line,item.character,item.sku,item.cardNumber,item.issueNumber].filter(Boolean).join(' ').trim();
 const barcode=String(item.barcode||'').replace(/\D/g,'');
 const url=new URL('https://www.pricecharting.com/api/product');
 url.searchParams.set('t',String(token));
 // La documentación define UPC para identificación directa. Para EAN/otros códigos
 // usamos búsqueda textual para no forzar una coincidencia incorrecta.
 if(/^\d{12}$/.test(barcode))url.searchParams.set('upc',barcode);
 else url.searchParams.set('q',query||item.title);
 const response=await fetcher(url,{method:'GET',signal:AbortSignal.timeout(15000)});
 let data={};
 try{data=await response.json();}catch{}
 if(!response.ok||data?.status!=='success'){
  const detail=String(data?.['error-message']||`HTTP ${response.status}`);
  throw new Error(`PriceCharting: ${detail.slice(0,180)}`);
 }
 const productName=String(data?.['product-name']||'').trim();
 const consoleName=String(data?.['console-name']||'').trim();
 if(!productName)throw new Error('PriceCharting no devolvió un producto identificable.');

 const target=normalizeComparableText(`${productName} ${consoleName}`);
 const stop=new Set(['the','and','for','with','from','funko','pop','movies','movie','figure','figura','edition','edicion']);
 const requestedTokens=[...new Set(normalizeComparableText(`${item.title||''} ${item.character||''} ${item.line||''}`).split(' ').filter(x=>x.length>=3&&!stop.has(x)))];
 const identifiers=[...new Set([...(String(item.title||'').match(/\d{2,}/g)||[]),item.sku,item.cardNumber,item.issueNumber].filter(Boolean).map(x=>normalizeComparableText(x)))];
 const idMatch=identifiers.some(id=>id&&target.includes(id));
 const tokenHits=requestedTokens.filter(token=>target.includes(token)).length;
 const tokenRatio=requestedTokens.length?tokenHits/requestedTokens.length:0;
 if(identifiers.length&&!idMatch&&tokenHits<2)throw new Error(`PriceCharting devolvió “${productName}”, pero no coincide con la referencia del artículo.`);
 if(!identifiers.length&&requestedTokens.length>=2&&tokenHits<2&&tokenRatio<.55)throw new Error(`PriceCharting devolvió “${productName}”, pero la coincidencia es demasiado débil.`);

 const options=[
  {field:'loose-price',label:'Sin caja / Out of Box'},
  {field:'cib-price',label:'Con caja / In Box'},
  {field:'new-price',label:'Nuevo / New'}
 ].map(row=>({...row,usd:centsValue(data?.[row.field])})).filter(row=>row.usd!==null);
 if(!options.length)throw new Error('PriceCharting encontró el producto, pero no devolvió precios actuales para sus estados.');
 let chosen;
 if(item.sealed)chosen=options.find(x=>x.field==='new-price');
 if(!chosen&&item.hasBox===true)chosen=options.find(x=>x.field==='cib-price')||options.find(x=>x.field==='new-price');
 if(!chosen&&item.hasBox===false)chosen=options.find(x=>x.field==='loose-price');
 if(!chosen)chosen=options.find(x=>x.field==='cib-price')||options.find(x=>x.field==='new-price')||options[0];
 const originalPrice=chosen.usd;
 const converted=Number.isFinite(usdEurRate)?Number((originalPrice*usdEurRate).toFixed(2)):originalPrice;
 const currency=Number.isFinite(usdEurRate)?'EUR':'USD';
 const publicUrl='https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(`${productName} ${consoleName}`.trim());
 const allPrices=options.map(x=>`${x.label}: $${x.usd.toFixed(2)}`).join(' · ');
 const source={
  id:'pricecharting-api-source',kind:'pricecharting-api',title:`PriceCharting · ${productName}${consoleName?` · ${consoleName}`:''}`,url:publicUrl,
  snippet:`Coincidencia API oficial. ${allPrices}. Los valores son precios actuales de PriceCharting.`
 };
 const listing={
  id:`pricecharting-api-${String(data?.id||chosen.field)}`,title:source.title,url:publicUrl,
  price:converted,currency,shipping:null,
  condition:`PriceCharting API · ${chosen.label}${currency==='EUR'?` · ${originalPrice.toFixed(2)} USD convertidos con referencia ECB`:''}`,
  sourceType:'guide',originalPrice,originalCurrency:'USD'
 };
 return {sources:[source],listings:[listing],product:data};
}

export function parsePublicListings'''
s = replace_once(s, old_rate_end, new_rate_end, 'PriceCharting API helper')

old_fallback = '''function conservativeFallbackComparables(item,listings,sources){
 const stop=new Set(['the','and','for','with','from','movies','movie','figure','figura','funko','pop','edition','edicion','volume','volumen']);
 const title=normalizeComparableText(item.title);
 const tokens=[...new Set(title.split(' ').filter(token=>token.length>=4&&!stop.has(token)&&!/^\d+$/.test(token)))];
 const identifiers=[...new Set([
  ...(String(item.title||'').match(/\d{2,}/g)||[]),item.barcode,item.isbn,item.sku,item.cardNumber,item.issueNumber
 ].filter(Boolean).map(String))];
 return listings.filter(listing=>{
  const source=sources.find(x=>x.url===listing.url);
  const hay=normalizeComparableText(String(listing.title||'')+' '+String(source?.snippet||''));
  if(identifiers.length&&!identifiers.every(id=>hay.includes(normalizeComparableText(id))))return false;
  if(!tokens.length)return identifiers.length>0;
  const hits=tokens.filter(token=>hay.includes(token)).length;
  return hits>=Math.min(3,Math.max(1,Math.ceil(tokens.length*.55)));
 });
}'''
new_fallback = '''function conservativeFallbackComparables(item,listings,sources){
 const stop=new Set(['the','and','for','with','from','movies','movie','figure','figura','funko','pop','edition','edicion','volume','volumen','lord','rings']);
 const identityText=normalizeComparableText(`${item.title||''} ${item.character||''} ${item.line||''} ${item.franchise||''}`);
 const tokens=[...new Set(identityText.split(' ').filter(token=>token.length>=3&&!stop.has(token)&&!/^\d+$/.test(token)))];
 const identifiers=[...new Set([
  ...(String(item.title||'').match(/\d{2,}/g)||[]),item.barcode,item.isbn,item.sku,item.cardNumber,item.issueNumber
 ].filter(Boolean).map(x=>normalizeComparableText(x)).filter(Boolean))];
 const bad=/\b(lote|lot|bundle|protector|protective|case only|empty box|caja vacia|box only|reproduction|repro|keychain|llavero|sticker|pegatina)\b/i;
 return listings.filter(listing=>{
  if(String(listing.id||'').startsWith('pricecharting-api-'))return true;
  const source=sources.find(x=>x.url===listing.url||x.id===listing.id);
  const raw=String(listing.title||'')+' '+String(source?.snippet||'');
  if(bad.test(normalizeComparableText(raw)))return false;
  const hay=normalizeComparableText(raw);
  const idHits=identifiers.filter(id=>hay.includes(id)).length;
  const tokenHits=tokens.filter(token=>hay.includes(token)).length;
  const ratio=tokens.length?tokenHits/tokens.length:0;
  // Un número/SKU exacto es una señal muy fuerte. Solo exigimos además una señal
  // nominal si existe, no que TODOS los identificadores aparezcan en el anuncio.
  if(idHits>0)return !tokens.length||tokenHits>=1||String(listing.sourceType)==='guide';
  // Sin referencia numérica exigimos coincidencia nominal suficientemente alta.
  if(tokens.length<=1)return tokenHits===tokens.length&&tokenHits>0;
  return tokenHits>=2&&ratio>=.5;
 });
}'''
s = replace_once(s, old_fallback, new_fallback, 'deterministic comparable filter')

old_special = "const specialistInstruction=searchMode==='funko'?'\\n\\nMODO FUNKO: busca primero el producto EXACTO (personaje + número/ref + variante) en hobbyDB/Pop Price Guide, PriceCharting y StockX. En hobbyDB/PPG y PriceCharting identifica el valor/guía y, si aparecen varias condiciones, distingue OOB/loose, con caja/CIB y nuevo. En StockX distingue Lowest Ask de cualquier venta histórica que esté explícitamente indicada. Después busca eBay vendidos/completados; solo llames venta cerrada a una página que indique de forma explícita que se vendió/completó. Evita páginas de categoría genéricas si existe una ficha individual del producto. Si el precio está en USD, conserva USD de forma explícita; la aplicación lo convertirá a EUR con referencia ECB.': '';"
new_special = "const specialistInstruction=searchMode==='funko'?'\\n\\nMODO FUNKO: busca primero el producto EXACTO (personaje + número/ref + variante) en PriceCharting, StockX y, solo si está públicamente accesible sin verificación, hobbyDB/Pop Price Guide. Si hobbyDB muestra CAPTCHA o verificación humana, NO intentes resolverla ni automatizarla: abandona esa fuente y continúa con PriceCharting, StockX, eBay y otras fuentes públicas. En las guías identifica el valor y, si aparecen varias condiciones, distingue OOB/loose, con caja/CIB y nuevo. En StockX distingue Lowest Ask de cualquier venta histórica explícita. Después busca eBay vendidos/completados; solo llames venta cerrada a una página que indique de forma explícita que se vendió/completó. Evita páginas genéricas si existe una ficha individual. Si el precio está en USD, conserva USD; la aplicación lo convertirá a EUR con referencia ECB.': '';"
s = replace_once(s, old_special, new_special, 'CAPTCHA-safe Funko research instruction')

old_rate = ''' let usdEurRate=null;
 if(webSources.some(source=>/\\$|\\bUSD\\b/i.test(`${source.title} ${source.snippet}`))){
  usdEurRate=await fetchUsdEurRate(fetcher);
  if(!usdEurRate)warnings.push('Se encontraron precios en USD pero no se pudo obtener la referencia USD/EUR del ECB; esos importes se muestran como fuente, pero no entran en el baremo EUR.');
 }
 const exchangeRates={USD_EUR:usdEurRate};

 // Si encontramos el artículo pero los resultados no exponen precios, hacemos una
 // segunda pasada mucho más específica antes de concluir que no hay precios útiles.
 let initialListings=parsePublicListings(webSources,exchangeRates);'''
new_rate = ''' let usdEurRate=null;
 if(config.priceChartingToken||webSources.some(source=>/\\$|\\bUSD\\b/i.test(`${source.title} ${source.snippet}`))){
  usdEurRate=await fetchUsdEurRate(fetcher);
  if(!usdEurRate)warnings.push('Hay referencias en USD pero no se pudo obtener la referencia USD/EUR del ECB; esos importes se conservan, pero no entran en el baremo EUR.');
 }
 const exchangeRates={USD_EUR:usdEurRate};

 let priceChartingListings=[];
 if(config.priceChartingToken&&isFunko){
  try{
   const pc=await fetchPriceChartingGuide(item,config.priceChartingToken,fetcher,usdEurRate);
   webSources=uniqueSources([...webSources,...pc.sources]);
   priceChartingListings=pc.listings;
  }catch(error){
   warnings.push(error instanceof Error?`PriceCharting API: ${error.message}`:'No se pudo consultar PriceCharting API.');
  }
 }

 // Si encontramos el artículo pero los resultados no exponen precios, hacemos una
 // segunda pasada mucho más específica antes de concluir que no hay precios útiles.
 let initialListings=[...parsePublicListings(webSources,exchangeRates),...priceChartingListings];'''
s = replace_once(s, old_rate, new_rate, 'PriceCharting research integration')

old_reparse = '''   webSources=uniqueSources([...webSources,...extra]);
   initialListings=parsePublicListings(webSources,exchangeRates);'''
new_reparse = '''   webSources=uniqueSources([...webSources,...extra]);
   initialListings=[...parsePublicListings(webSources,exchangeRates),...priceChartingListings];'''
s = replace_once(s, old_reparse, new_reparse, 'preserve API listing after second search')

old_after_ai = '''   summary=validated.summary;
   facts=validated.facts.filter(f=>sources.some(s=>s.id===f.sourceId));
   comparables=listings.filter(x=>validated.comparableIds.includes(x.id));
  }catch(error){'''
new_after_ai = '''   summary=validated.summary;
   facts=validated.facts.filter(f=>sources.some(s=>s.id===f.sourceId));
   comparables=listings.filter(x=>validated.comparableIds.includes(x.id));
   // DeepSeek puede ser demasiado conservador y devolver 0 IDs aun habiendo precios
   // claramente coincidentes. Siempre contrastamos su selección con un filtro local
   // determinista y con las coincidencias de la API oficial de PriceCharting.
   const deterministic=conservativeFallbackComparables(item,listings,sources);
   const merged=new Map([...comparables,...deterministic].map(row=>[row.id,row]));
   if(merged.size>comparables.length){
    warnings.push(`Comparación local: se añadieron ${merged.size-comparables.length} precio(s) con coincidencia por referencia/nombre que la IA no había seleccionado.`);
    comparables=[...merged.values()].slice(0,12);
   }
  }catch(error){'''
s = replace_once(s, old_after_ai, new_after_ai, 'always merge deterministic comparables')

p.write_text(s)

# ---------------- direct-ai.ts ----------------
p = Path('src/lib/direct-ai.ts')
s = p.read_text()
s = replace_once(s,
"const storageKey = 'frikivault.deepseek.personal.v1';\nfunction scopedKey() { return storageKey + ':' + (auth?.currentUser?.uid || 'local'); }",
"const storageKey = 'frikivault.deepseek.personal.v1';\nconst priceChartingStorageKey = 'frikivault.pricecharting.personal.v1';\nfunction scopedKey() { return storageKey + ':' + (auth?.currentUser?.uid || 'local'); }\nfunction scopedPriceChartingKey() { return priceChartingStorageKey + ':' + (auth?.currentUser?.uid || 'local'); }",
'PriceCharting storage key')

anchor = '''export async function removePersonalKey() {
  if (auth?.currentUser && db) await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'deepseek'));
  sessionStorage.removeItem(scopedKey());
  localStorage.removeItem(scopedKey());
}
'''
addition = '''
export function getPriceChartingToken(): string {
  return sessionStorage.getItem(scopedPriceChartingKey()) || localStorage.getItem(scopedPriceChartingKey()) || '';
}
export function savePriceChartingToken(value: string, remember = false) {
  const token = value.trim();
  if (!/^[A-Za-z0-9]{40}$/.test(token)) throw new Error('El token de PriceCharting debe tener exactamente 40 caracteres.');
  sessionStorage.removeItem(scopedPriceChartingKey());
  localStorage.removeItem(scopedPriceChartingKey());
  (remember ? localStorage : sessionStorage).setItem(scopedPriceChartingKey(), token);
}
export async function syncPriceChartingToken() {
  if (!auth?.currentUser || !db) throw new Error('Inicia sesión con Google para sincronizar el token de PriceCharting.');
  const token = getPriceChartingToken();
  if (!token) throw new Error('Añade primero el token de PriceCharting.');
  await setDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'pricecharting'), {token});
}
export async function removePriceChartingToken() {
  if (auth?.currentUser && db) await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'settings', 'pricecharting'));
  sessionStorage.removeItem(scopedPriceChartingKey());
  localStorage.removeItem(scopedPriceChartingKey());
}
'''
s = replace_once(s, anchor, anchor+addition, 'PriceCharting token helpers')

old_auth = '''      } else {
        const saved = await getDoc(doc(db, 'users', user.uid, 'settings', 'deepseek'));
        const key = saved.data()?.key;
        if (typeof key === 'string' && /^sk-[A-Za-z0-9_-]{16,}$/.test(key)) savePersonalKey(key);
      }
      window.dispatchEvent(new Event('frikivault-ai-ready'));'''
new_auth = '''      } else {
        const saved = await getDoc(doc(db, 'users', user.uid, 'settings', 'deepseek'));
        const key = saved.data()?.key;
        if (typeof key === 'string' && /^sk-[A-Za-z0-9_-]{16,}$/.test(key)) savePersonalKey(key);
      }
      const priceSaved = await getDoc(doc(db, 'users', user.uid, 'settings', 'pricecharting'));
      const priceToken = priceSaved.data()?.token;
      if (typeof priceToken === 'string' && /^[A-Za-z0-9]{40}$/.test(priceToken)) savePriceChartingToken(priceToken);
      window.dispatchEvent(new Event('frikivault-ai-ready'));'''
s = replace_once(s, old_auth, new_auth, 'load PriceCharting token')

old_config = '''  return { key, model: 'deepseek-flash', fetcher: directFetch };
}'''
new_config = '''  return { key, model: 'deepseek-flash', fetcher: directFetch, priceChartingToken: getPriceChartingToken() };
}'''
s = replace_once(s, old_config, new_config, 'pass PriceCharting token to research')
p.write_text(s)

# ---------------- DirectAiSettings.tsx: replace with clearer two-provider settings ----------------
p = Path('src/components/DirectAiSettings.tsx')
p.write_text(r'''import { useState, useEffect } from 'react';
import {
  getPersonalKey, savePersonalKey, removePersonalKey, testDirect, syncPersonalKey,
  getPriceChartingToken, savePriceChartingToken, removePriceChartingToken, syncPriceChartingToken
} from '../lib/direct-ai';

export function DirectAiSettings() {
  const [key, setKey] = useState('');
  const [configured, setConfigured] = useState(() => Boolean(getPersonalKey()));
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [priceToken, setPriceToken] = useState('');
  const [priceConfigured, setPriceConfigured] = useState(() => Boolean(getPriceChartingToken()));
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceMessage, setPriceMessage] = useState('');

  useEffect(() => {
    const refresh = () => { setConfigured(Boolean(getPersonalKey())); setPriceConfigured(Boolean(getPriceChartingToken())); };
    window.addEventListener('frikivault-ai-ready', refresh);
    return () => window.removeEventListener('frikivault-ai-ready', refresh);
  }, []);

  async function connect() {
    setBusy(true); setMessage('Comprobando DeepSeek…');
    try {
      if (key.trim()) { savePersonalKey(key, remember); setKey(''); }
      else if (remember && getPersonalKey()) savePersonalKey(getPersonalKey(), true);
      setConfigured(Boolean(getPersonalKey()));
      await testDirect();
      await syncPersonalKey();
      setMessage('Conexión comprobada y clave sincronizada con tu cuenta. Ya puedes usarla también desde el móvil.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo comprobar la conexión.'); }
    finally { setBusy(false); }
  }

  async function savePriceCharting() {
    if (!priceToken.trim()) return;
    setPriceBusy(true); setPriceMessage('Guardando token de PriceCharting…');
    try {
      savePriceChartingToken(priceToken);
      await syncPriceChartingToken();
      setPriceToken('');
      setPriceConfigured(true);
      setPriceMessage('PriceCharting API configurada. La investigación de Funko usará su guía oficial cuando encuentre el producto exacto.');
    } catch (e) { setPriceMessage(e instanceof Error ? e.message : 'No se pudo guardar el token.'); }
    finally { setPriceBusy(false); }
  }

  return <div className="panel provider-settings">
    <section className="settings-integration">
      <h3>IA directa · DeepSeek</h3>
      <p className="muted">Analiza fotos e investiga fuentes públicas. {configured ? 'Clave configurada; pulsa Comprobar conexión para verificarla.' : 'Añade tu clave personal para conectar.'}</p>
      <label className="field"><span>Clave personal</span><input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder={configured ? 'Clave guardada; escribe aquí para cambiarla' : 'sk-…'}/></label>
      <p className="muted"><label><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/> Recordar en este dispositivo privado</label></p>
      <div className="button-stack">
        <button className="primary" disabled={busy || (!configured && !key.trim())} onClick={connect}>{busy ? 'Comprobando…' : key.trim() ? 'Guardar y comprobar' : 'Comprobar conexión'}</button>
        {configured && <button className="secondary" disabled={busy} onClick={async () => {try {await removePersonalKey(); setConfigured(false); setKey(''); setMessage('Clave eliminada de esta sesión y de los ajustes de tu cuenta.');} catch {setMessage('No se pudo eliminar la clave de tu cuenta.');}}}>Borrar clave</button>}
      </div>
      {message && <p className="muted" role="status">{message}</p>}
    </section>

    <section className="settings-integration pricecharting-settings">
      <h3>Guía de precios · PriceCharting <span className="provider-badge">Opcional</span></h3>
      <p className="muted">Añade el token oficial de 40 caracteres de una suscripción PriceCharting con acceso API. Para Funko, FrikiVault consultará un solo producto por investigación y usará el valor correspondiente a su estado (con caja, sin caja o nuevo) como referencia especializada.</p>
      <label className="field"><span>Token PriceCharting</span><input type="password" autoComplete="off" spellCheck={false} value={priceToken} onChange={e => setPriceToken(e.target.value)} placeholder={priceConfigured ? 'Token guardado; escribe aquí para cambiarlo' : '40 caracteres'}/></label>
      <p className="muted">Se guarda en los ajustes privados de tu cuenta, igual que la clave de IA; no se incluye en GitHub ni en las exportaciones. No intenta saltarse CAPTCHA de hobbyDB.</p>
      <div className="button-stack">
        <button className="primary" disabled={priceBusy || !priceToken.trim()} onClick={savePriceCharting}>{priceBusy ? 'Guardando…' : priceConfigured ? 'Cambiar token' : 'Guardar token'}</button>
        {priceConfigured && <button className="secondary" disabled={priceBusy} onClick={async () => {try {await removePriceChartingToken(); setPriceConfigured(false); setPriceToken(''); setPriceMessage('Token de PriceCharting eliminado.');} catch {setPriceMessage('No se pudo eliminar el token.');}}}>Desconectar PriceCharting</button>}
      </div>
      {priceMessage && <p className="muted" role="status">{priceMessage}</p>}
      <a className="provider-doc-link" href="https://www.pricecharting.com/api-documentation" target="_blank" rel="noreferrer">Documentación oficial de PriceCharting API ↗</a>
    </section>
  </div>;
}
''')

# ---------------- server config + env example ----------------
p = Path('server/index.mjs')
s = p.read_text()
s = replace_once(s,
"const config={key:env.DEEPSEEK_API_KEY,model:env.DEEPSEEK_MODEL||'deepseek-flash',braveKey:env.BRAVE_SEARCH_API_KEY};",
"const config={key:env.DEEPSEEK_API_KEY,model:env.DEEPSEEK_MODEL||'deepseek-flash',braveKey:env.BRAVE_SEARCH_API_KEY,priceChartingToken:env.PRICECHARTING_API_TOKEN};",
'server PriceCharting config')
p.write_text(s)

p = Path('.env.server.example')
s = p.read_text()
if 'PRICECHARTING_API_TOKEN=' not in s:
    s = s.replace('BRAVE_SEARCH_API_KEY=\n', 'BRAVE_SEARCH_API_KEY=\n# Opcional: API oficial PriceCharting (suscripción con acceso API, token de 40 caracteres).\nPRICECHARTING_API_TOKEN=\n')
p.write_text(s)

# ---------------- App.tsx ----------------
p = Path('src/App.tsx')
s = p.read_text()
s = replace_once(s,
"onSaved={() => { setFormItem(undefined); setFormSeed(undefined); setFormPhotos([]); setSaveNotice('El artículo y sus fotos se han guardado correctamente.'); }}",
"onSaved={() => { setFormItem(undefined); setFormSeed(undefined); setFormPhotos([]); setTab('home'); setQuery(''); requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })); setSaveNotice('El artículo y sus fotos se han guardado correctamente.'); }}",
'go home after successful save')

start = s.find('            {research && <div className="research-result">')
if start < 0:
    raise SystemExit('Missing pattern: research result UI start')
end = s.find('\n          </section>}', start)
if end < 0:
    raise SystemExit('Missing pattern: research result UI end')
new_research_ui = r'''            {research && <div className="research-result">
              {research.asking.median != null ? <div className="valuation-highlight">
                <span className="valuation-kicker">VALOR ESTIMADO ACTUAL</span>
                <strong>{money(research.asking.median, research.asking.currency || 'EUR')}</strong>
                <div className="valuation-range">Rango observado: {money(research.asking.min, research.asking.currency || 'EUR')} – {money(research.asking.max, research.asking.currency || 'EUR')}</div>
                <small>{research.asking.label}</small>
              </div> : <div className="valuation-highlight empty"><span className="valuation-kicker">VALOR ESTIMADO</span><strong>Sin baremo fiable todavía</strong><small>Hay fuentes, pero ninguna coincidencia de precio ha superado los filtros del artículo exacto.</small></div>}
              <p>{research.summary}</p>
              <div className="market-summary"><div><span>Páginas coincidentes</span><b>{new Set(research.sources.map((source) => source.url)).size || '—'}</b></div><div><span>Precios detectados</span><b>{research.listings.length || '—'}</b></div><div><span>Comparables usados</span><b>{research.comparables.length || '—'}</b></div><div><span>Mediana</span><b>{research.asking.median == null ? '—' : money(research.asking.median)}</b></div><div><span>Fuentes especializadas</span><b>{research.sources.filter((source) => source.kind.includes('funko-specialist') || source.kind.includes('pricecharting-api')).length || '—'}</b></div><div><span>Ventas cerradas</span><b>{research.sold.available ? `${research.sold.count || 1}${research.sold.median != null ? ` · ${money(research.sold.median)}` : ''}` : 'No verificadas'}</b></div></div>
              {research.comparables.length > 0 && <div className="comparable-prices"><h4>Precios usados para el baremo</h4>{research.comparables.slice(0,8).map((listing) => <a className="comparable-price" key={listing.id} href={listing.url} target="_blank" rel="noreferrer"><span><b>{listing.title}</b><small>{listing.condition}</small></span><strong>{money(listing.price, listing.currency)}</strong></a>)}</div>}
              <div className="research-facts">{research.facts.slice(0, 8).map((fact) => <div key={`${fact.label}-${fact.sourceId}`}><b>{fact.label}</b><span>{fact.value}</span></div>)}</div>
              <div className="source-list"><a href={research.links.ebay} target="_blank" rel="noreferrer">Buscar artículo en eBay</a><a href={research.links.sold} target="_blank" rel="noreferrer">Revisar ventas cerradas</a>{research.links.ppg && <a href={research.links.ppg} target="_blank" rel="noreferrer">PPG / hobbyDB</a>}{research.links.priceCharting && <a href={research.links.priceCharting} target="_blank" rel="noreferrer">PriceCharting</a>}{research.links.stockx && <a href={research.links.stockx} target="_blank" rel="noreferrer">StockX</a>}{research.sources.slice(0, 8).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.kind.includes('pricecharting-api') ? 'PriceCharting API' : source.kind.startsWith('ebay') ? 'eBay público' : 'Fuente'} · {source.title}</a>)}</div>
              {research.warnings.map((warning) => <small className="warning-line" key={warning}>{warning}</small>)}
            </div>}'''
s = s[:start] + new_research_ui + s[end:]
p.write_text(s)

# ---------------- CSS ----------------
p = Path('src/styles.css')
s = p.read_text()
marker = '/* valuation-pricecharting-save-ui-2026 */'
if marker not in s:
    s += r'''

/* valuation-pricecharting-save-ui-2026 */
.sheet-foot .primary,.sheet-foot .secondary,.sheet-foot .danger{min-height:54px;padding:0 22px;border-radius:14px;font-size:15px;font-weight:800;letter-spacing:.01em}
.sheet-foot .primary{min-width:164px;background:linear-gradient(135deg,#8978ff,#714ff0);box-shadow:0 12px 30px rgba(124,108,242,.34),inset 0 1px 0 rgba(255,255,255,.14)}
.sheet-foot .primary:hover{transform:translateY(-1px);box-shadow:0 15px 34px rgba(124,108,242,.4)}
.sheet-foot .secondary{background:#172238;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.sheet-foot .danger{padding-inline:20px}
.result-modal .primary{min-height:52px;border-radius:14px;font-size:15px;font-weight:800}
.valuation-highlight{margin:14px 0 18px;padding:20px;border-radius:17px;border:1px solid rgba(80,215,242,.25);background:linear-gradient(135deg,rgba(80,215,242,.10),rgba(124,108,242,.12));box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.valuation-highlight.empty{border-color:rgba(255,191,105,.22);background:rgba(255,191,105,.06)}
.valuation-kicker{display:block;font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--cyan);margin-bottom:7px}
.valuation-highlight>strong{display:block;font-family:'Space Grotesk';font-size:32px;line-height:1.05;color:#fff}
.valuation-highlight.empty>strong{font-size:20px;color:#ffd399}
.valuation-range{margin-top:8px;font-size:13px;font-weight:700;color:#d9e7f2}
.valuation-highlight small{display:block;margin-top:8px;line-height:1.45;color:var(--muted)}
.comparable-prices{margin:16px 0;padding:15px;border-radius:14px;border:1px solid var(--border);background:#0b1322;display:grid;gap:8px}
.comparable-prices h4{margin:0 0 4px;font-size:13px}
.comparable-price{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 11px;border:1px solid #26324b;border-radius:11px;text-decoration:none;color:inherit;background:#10192a}
.comparable-price:hover{border-color:#46577f;background:#131e32}
.comparable-price>span{min-width:0;display:grid;gap:3px}
.comparable-price b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.comparable-price small{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.comparable-price>strong{white-space:nowrap;color:#7ee5c1;font-size:14px}
.provider-settings{display:grid;gap:18px}
.settings-integration+.settings-integration{border-top:1px solid var(--border);padding-top:20px}
.provider-badge{font-size:9px;text-transform:uppercase;letter-spacing:.08em;padding:4px 7px;border-radius:999px;background:rgba(80,215,242,.10);color:var(--cyan);vertical-align:middle;margin-left:6px}
.provider-doc-link{display:inline-block;margin-top:12px;color:var(--cyan);font-size:12px;text-decoration:none}
@media(max-width:680px){.sheet-foot{gap:10px}.sheet-foot>div{display:flex;gap:9px}.sheet-foot .primary{min-width:146px;min-height:56px;font-size:16px}.sheet-foot .secondary,.sheet-foot .danger{min-height:52px}.valuation-highlight>strong{font-size:29px}.comparable-price{align-items:flex-start}.comparable-price>strong{font-size:13px}}
'''
p.write_text(s)

# ---------------- tests ----------------
p = Path('tests/core.mjs')
s = p.read_text()
s = replace_once(s,
"import { identificationSchema, summarizeListings, safeUrl, deepseek, deepseekWebSearch, parsePublicListings, research, identify } from '../server/core.mjs';",
"import { identificationSchema, summarizeListings, safeUrl, deepseek, deepseekWebSearch, parsePublicListings, fetchPriceChartingGuide, research, identify } from '../server/core.mjs';",
'import PriceCharting helper')

anchor = "assert.match(guideListings[0].condition,/Guía de valoración/i);\n"
addition = r'''

// API oficial PriceCharting: una coincidencia exacta con caja devuelve la guía CIB,
// convierte centavos USD a EUR y nunca expone el token en la URL pública guardada.
const pcToken='a'.repeat(40);
const pcFetch=async(input)=>{
  const url=new URL(String(input));
  assert.equal(url.hostname,'www.pricecharting.com');
  assert.equal(url.pathname,'/api/product');
  assert.equal(url.searchParams.get('t'),pcToken);
  return new Response(JSON.stringify({status:'success',id:'12345','product-name':'Eomer #1982','console-name':'Funko Pop Movies','loose-price':1399,'cib-price':2599,'new-price':3299}),{status:200,headers:{'content-type':'application/json'}});
};
const pcResult=await fetchPriceChartingGuide({title:'Funko Pop! Eomer #1982',type:'funko',line:'Pop! Movies',sku:'1982',hasBox:true},pcToken,pcFetch,.9);
assert.equal(pcResult.listings.length,1);
assert.equal(pcResult.listings[0].price,23.39);
assert.equal(pcResult.listings[0].currency,'EUR');
assert.equal(pcResult.listings[0].sourceType,'guide');
assert.doesNotMatch(pcResult.sources[0].url,/t=/);
'''
s = replace_once(s, anchor, anchor+addition, 'PriceCharting API test')

anchor2 = "assert.match(appSource,/Idioma de la edición/);\n"
addition2 = "assert.match(appSource,/setTab\\('home'\\)/);\nassert.match(appSource,/valuation-highlight/);\nconst directAiSource=readFileSync(new URL('../src/lib/direct-ai.ts',import.meta.url),'utf8');\nassert.match(directAiSource,/priceChartingToken/);\nassert.match(directAiSource,/settings', 'pricecharting'/);\n"
s = replace_once(s, anchor2, anchor2+addition2, 'UI and private PriceCharting settings assertions')
p.write_text(s)

print('patch applied')
