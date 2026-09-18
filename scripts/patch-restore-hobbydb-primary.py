from pathlib import Path

# --- App: moneda original primero y conversión bidireccional USD/EUR ---
app=Path('src/App.tsx')
s=app.read_text(encoding='utf-8')
old="""function displayedResearchValue(research: ResearchResult, currency: string) {
  const original = research.asking.originalMedian;
  const originalCurrency = research.asking.originalCurrency;
  if (original != null && originalCurrency === 'USD') {
    const rate = currency === 'USD' ? 1 : research.exchangeRates?.[currency];
    if (rate) return original * rate;
  }
  return currency === research.asking.currency ? research.asking.median : null;
}"""
new="""function displayedResearchValue(research: ResearchResult, currency: string) {
  const original = research.asking.originalMedian;
  const originalCurrency = research.asking.originalCurrency;
  if (original != null && originalCurrency === 'USD') {
    const rate = currency === 'USD' ? 1 : research.exchangeRates?.[currency];
    if (rate) return original * rate;
  }
  const base = research.asking.median;
  const baseCurrency = research.asking.currency;
  if (base == null) return null;
  if (currency === baseCurrency) return base;
  if (baseCurrency === 'EUR' && research.exchangeRates?.EUR) {
    const usd = base / research.exchangeRates.EUR;
    if (currency === 'USD') return usd;
    const rate = research.exchangeRates?.[currency];
    if (rate) return usd * rate;
  }
  return null;
}"""
if old not in s: raise SystemExit('App displayedResearchValue block not found')
s=s.replace(old,new,1)
old="""  useEffect(() => {
    if (!research?.asking.originalCurrency) return;
    setDisplayCurrency(research.exchangeRates?.EUR ? 'EUR' : research.asking.originalCurrency);
  }, [research?.asking.originalCurrency, research?.asking.originalMedian, research?.exchangeRates?.EUR]);"""
new="""  useEffect(() => {
    const preferred = research?.asking.originalCurrency || research?.asking.currency;
    if (!preferred) return;
    setDisplayCurrency(preferred);
  }, [research?.asking.originalCurrency, research?.asking.currency]);"""
if old not in s: raise SystemExit('App display currency effect not found')
s=s.replace(old,new,1)
app.write_text(s,encoding='utf-8')

# --- Frontend API: hobbyDB se intenta para cualquier coleccionable exacto ---
api=Path('src/lib/api.ts')
s=api.read_text(encoding='utf-8')
old="""async function readHobbyDbValue(item:Partial<InventoryDraft>,research?:ResearchResult){
 if(!hobbyDbValueUrl||item.type!=='funko'||!item.character)return null;
 const identity={
  character:item.character,
  popNumber:item.popNumber||'',
  funkoCategory:item.funkoCategory||item.line||'',
  funkoVariant:item.funkoVariant||'Classic',
  sku:item.sku||'',
  hobbydbUrl:hobbyDbSourceUrl(research)||undefined
 };
 const result=await hobbyDbPost({item:identity});
 if(result.status==='completed'&&result.value)return result.value as {amount:number;currency:'USD';url:string;evidence:string;variant:string};
 throw new Error('hobbyDB no devolvió un Estimated Value verificable.');
}"""
new="""async function readHobbyDbValue(item:Partial<InventoryDraft>,research?:ResearchResult){
 if(!hobbyDbValueUrl)return null;
 const isFunko=item.type==='funko';
 const name=String(item.character||item.title||'').trim();
 if(!name&&!item.sku&&!item.barcode)return null;
 const common={hobbydbUrl:hobbyDbSourceUrl(research)||undefined};
 const identity=isFunko?{
  ...common,
  type:'funko',
  title:item.title||'',
  character:item.character||name,
  manufacturer:item.manufacturer||'Funko',
  line:item.line||'',
  popNumber:item.popNumber||'',
  funkoCategory:item.funkoCategory||item.line||'',
  funkoVariant:item.funkoVariant||'Classic',
  sku:item.sku||'',
  barcode:item.barcode||''
 }:{
  ...common,
  type:item.type||'other',
  title:item.title||'',
  character:item.character||'',
  manufacturer:item.manufacturer||'',
  line:item.line||'',
  edition:item.edition||'',
  sku:item.sku||'',
  barcode:item.barcode||''
 };
 const result=await hobbyDbPost({item:identity});
 if(result.status==='completed'&&result.value)return result.value as {amount:number;currency:'USD';url:string;evidence:string;variant:string};
 throw new Error('hobbyDB no devolvió un Estimated Value verificable.');
}"""
if old not in s: raise SystemExit('api readHobbyDbValue block not found')
s=s.replace(old,new,1)
api.write_text(s,encoding='utf-8')

# --- Motor general: bloquear Amazon regional ajeno y ofrecer tipos de cambio para todos ---
core=Path('src/lib/ai-core.mjs')
s=core.read_text(encoding='utf-8')
old="function allowedPricingSource(source){const host=hostOf(source?.url);if(!host)return false;if(/(^|\\.)(google|bing|youtube|facebook|instagram|pinterest|wikipedia)\\./.test(host))return false;return true;}"
new="function allowedPricingSource(source){const host=hostOf(source?.url);if(!host)return false;if(/(^|\\.)(google|bing|youtube|facebook|instagram|pinterest|wikipedia)\\./.test(host))return false;if(/(^|\\.)amazon\\./.test(host)&&host!=='amazon.es'&&!host.endsWith('.amazon.es'))return false;return true;}"
if old not in s: raise SystemExit('allowedPricingSource block not found')
s=s.replace(old,new,1)
old="exchangeRates=isFunko?await fetchDisplayCurrencyRates(fetcher,usdEurRate):{};"
new="exchangeRates=await fetchDisplayCurrencyRates(fetcher,usdEurRate);"
if old not in s: raise SystemExit('exchangeRates block not found')
s=s.replace(old,new,1)
core.write_text(s,encoding='utf-8')

# --- Vercel hobbyDB backend: preservar Funko y añadir coincidencia genérica exacta ---
hdb=Path('api/hobbydb-value.mjs')
s=hdb.read_text(encoding='utf-8')
needle="function requestedVariant(item){"
insert="function isFunkoRequest(item){return item?.type==='funko'||normalize(item?.manufacturer)==='funko'||Boolean(String(item?.popNumber||'').trim()||String(item?.funkoCategory||'').trim()||String(item?.funkoVariant||'').trim());}\n"
if insert not in s:
    if needle not in s: raise SystemExit('requestedVariant anchor not found')
    s=s.replace(needle,insert+needle,1)
s=s.replace('async function resolveItem(item,cookie){','async function resolveFunkoItem(item,cookie){',1)
anchor=" throw new Error('No se encontró una ficha de hobbyDB que coincida exactamente con personaje, línea y variante.');}\n"
generic=r"""
function genericExactRow(item,row){
 const a=row?.attributes||{};
 const related=(a.related_subjects||[]).map(x=>x?.name);
 const series=(a.series||[]).map?.(x=>x?.name)||[];
 const brands=(a.brand||[]).map(x=>normalize(x?.name));
 const hay=normalize([a.name,a.aka,a.ref_number,a.variant_group_name,a.variant_details_summary,...related,...series,...brands,...(Array.isArray(a.production_status)?a.production_status:[])].flat().filter(Boolean).join(' '));
 const wantedName=normalize(item.character||item.title||'');
 const stop=new Set(['the','and','with','from','marvel','comics','comic','figure','figura','series']);
 const nameTokens=tokens(wantedName).filter(x=>x.length>=3&&!stop.has(x));
 const nameHits=nameTokens.filter(x=>hay.includes(x)).length;
 const minNameHits=nameTokens.length<=1?1:Math.max(2,Math.ceil(nameTokens.length*.45));
 const sku=normalize(item.sku),barcode=normalize(item.barcode);
 const ids=[sku,barcode].filter(Boolean);
 const idHit=ids.find(id=>hay.includes(id))||'';
 const manufacturerTokens=tokens(item.manufacturer).filter(x=>x.length>=3);
 const manufacturerHit=!manufacturerTokens.length||manufacturerTokens.some(x=>hay.includes(x));
 const lineTokens=tokens(item.line).filter(x=>x.length>=3&&!['series'].includes(x));
 const lineHits=lineTokens.filter(x=>hay.includes(x)).length;
 const lineHit=!lineTokens.length||lineHits>=Math.max(1,Math.ceil(lineTokens.length*.5));
 if(brands.length&&manufacturerTokens.length&&!manufacturerHit)return null;
 if(series.length&&lineTokens.length&&!lineHit&&!idHit)return null;
 if(!idHit&&nameTokens.length&&nameHits<minNameHits)return null;
 if(!idHit&&!nameTokens.length)return null;
 let score=0;
 if(idHit)score+=220;
 if(manufacturerHit&&manufacturerTokens.length)score+=70;
 if(lineHit&&lineTokens.length)score+=70;
 score+=nameHits*25;
 if(normalize(a.name)===wantedName)score+=70;
 return{row,score,variant:'exact item'};
}
async function resolveGenericItem(item,cookie){
 const hint=urlHint(item);
 const name=String(item.character||item.title||'').trim();
 const queries=[hint.q,String(item.sku||'').trim(),String(item.barcode||'').trim(),[item.manufacturer,item.line,name,item.sku].filter(Boolean).join(' '),[item.manufacturer,item.line,name].filter(Boolean).join(' '),[item.manufacturer,name].filter(Boolean).join(' '),String(item.title||'').trim(),String(item.character||'').trim()].map(x=>String(x||'').trim()).filter(Boolean);
 const unique=[...new Set(queries)],seen=new Map();
 for(const query of unique){
  let rows=[];try{rows=await searchCatalog(query,cookie);}catch(error){if(error?.code==='SESSION_EXPIRED')throw error;continue;}
  for(const row of rows)if(row?.id&&!seen.has(String(row.id)))seen.set(String(row.id),row);
  const exact=[...seen.values()].map(row=>genericExactRow(item,row)).filter(Boolean);
  if(exact.length){exact.forEach(x=>{if(hint.slug&&rowUrl(x.row).includes(`/catalog_items/${hint.slug}`))x.score+=180;});exact.sort((a,b)=>b.score-a.score);const best=exact[0],a=best.row.attributes||{};return{id:String(best.row.id||a.id),url:rowUrl(best.row),title:a.name||name,variant:best.variant,searchEstimatedValue:Number(a.estimated_value)||null};}
 }
 throw new Error('No se encontró una ficha exacta en hobbyDB para este coleccionable.');
}
async function resolveItem(item,cookie){return isFunkoRequest(item)?resolveFunkoItem(item,cookie):resolveGenericItem(item,cookie);}
"""
if generic not in s:
    if anchor not in s: raise SystemExit('resolveFunkoItem closing anchor not found')
    s=s.replace(anchor,anchor+generic,1)
old="if(!item.character)return json(res,400,{error:'Falta el personaje o nombre del Funko.'});if(item.popNumber&&!/^\\d{1,5}$/.test(String(item.popNumber)))return json(res,400,{error:'El número Pop no es válido.'});"
new="if(!item.character&&!item.title&&!item.sku&&!item.barcode)return json(res,400,{error:'Falta un nombre, personaje o referencia para buscar en hobbyDB.'});if(isFunkoRequest(item)&&item.popNumber&&!/^\\d{1,5}$/.test(String(item.popNumber)))return json(res,400,{error:'El número Pop no es válido.'});"
if old not in s: raise SystemExit('handler validation block not found')
s=s.replace(old,new,1)
hdb.write_text(s,encoding='utf-8')

# --- Regresiones automáticas ---
tests=Path('tests/core.mjs')
t=tests.read_text(encoding='utf-8')
marker="assert.equal(buildResearchIdentity(weaponXFigure),'Hasbro Marvel Legends X-Men Weapon X Wolverine (Weapon X) G0644');"
extra=r"""

// Las tiendas regionales ajenas (p.ej. Amazon Brasil) no pueden contaminar la tasación.
const genericCurrencyFetch=async(url,init)=>{
 if(String(url).includes('frankfurter.app'))return new Response(JSON.stringify({rates:{EUR:.9,GBP:.8}}),{status:200,headers:{'content-type':'application/json'}});
 if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[
  {type:'web_search_result',title:'Hasbro Marvel Legends Wolverine Weapon X G0644 49,90 EUR',url:'https://www.amazon.com.br/dp/WRONGREGION',cited_text:'G0644 49,90 EUR'},
  {type:'web_search_result',title:'Hasbro Marvel Legends Wolverine Weapon X G0644 39,90 EUR',url:'https://www.ebay.es/itm/G0644',cited_text:'Hasbro Marvel Legends G0644 39,90 EUR'}
 ]}]}),{status:200,headers:{'content-type':'application/json'}});
 return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
};
const genericCurrencyResearch=await research({confirmed:true,item:{...weaponXFigure,franchise:'Marvel',edition:'',issueNumber:'',volume:'',setName:'',cardNumber:'',rarity:'',platform:'',language:'',country:'',gradingCompany:'',grade:'',isbn:'',barcode:'',popNumber:'',funkoCategory:'',funkoVariant:''}},{key:'test',fetcher:genericCurrencyFetch});
assert.ok(!genericCurrencyResearch.sources.some(x=>x.url.includes('amazon.com.br')));
assert.equal(genericCurrencyResearch.exchangeRates.USD,1);
assert.equal(genericCurrencyResearch.exchangeRates.EUR,.9);
"""
if extra not in t:
    if marker not in t: raise SystemExit('weaponX test marker not found')
    t=t.replace(marker,marker+extra,1)
tests.write_text(t,encoding='utf-8')
print('hobbyDB priority restoration applied')
