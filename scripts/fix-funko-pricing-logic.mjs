import { readFileSync, writeFileSync } from 'node:fs';

function once(text, oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`No se encontró: ${label}`);
  return text.replace(oldValue, newValue);
}
function rx(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`No se encontró: ${label}`);
  return text.replace(pattern, replacement);
}

// ---------- types ----------
const typesPath='src/types.ts';
let types=readFileSync(typesPath,'utf8');
types=once(types,'  sku?: string;\n  condition?: ItemCondition;','  sku?: string;\n  popNumber?: string;\n  funkoCategory?: string;\n  funkoVariant?: string;\n  condition?: ItemCondition;','InventoryItem Funko fields');
types=once(types,'  sku: string;\n  country: string;','  sku: string;\n  popNumber: string;\n  funkoCategory: string;\n  funkoVariant: string;\n  country: string;','AiIdentification Funko fields');
writeFileSync(typesPath,types);

// ---------- AI / pricing core ----------
const corePath='src/lib/ai-core.mjs';
let core=readFileSync(corePath,'utf8');

core=once(core,' barcode:text,\n isbn:text,\n sku:text,\n country:text,',' barcode:text,\n isbn:text,\n sku:text,\n popNumber:text,\n funkoCategory:text,\n funkoVariant:text,\n country:text,','identification schema Funko fields');
core=once(core,'  barcode:text,\n  sku:text,\n  year:z.number()','  barcode:text,\n  sku:text,\n  popNumber:text,\n  funkoCategory:text,\n  funkoVariant:text,\n  year:z.number()','research schema Funko fields');

const identityBlock=`function funkoNumberFromTitle(value){
 const raw=String(value||'');
 const hash=raw.match(/#\\s*(\\d{1,5})\\b/);
 if(hash)return hash[1];
 const labelled=raw.match(/\\b(?:pop\\s*(?:no\\.?|number)?|numero|número)\\s*#?\\s*(\\d{1,5})\\b/i);
 return labelled?.[1]||'';
}

function normalizeFunkoNumber(value){
 const match=String(value||'').match(/\\d{1,5}/);
 return match?.[0]||'';
}

function funkoCategoryFromText(value){
 const raw=String(value||'');
 const rows=[
  ['Movies',/\\bmovies?\\b/i],['Television',/\\btelevision|\\btv\\b/i],['Games',/\\bgames?\\b/i],
  ['Animation',/\\banimation|anime\\b/i],['Heroes',/\\bheroes\\b/i],['Disney',/\\bdisney\\b/i],
  ['Marvel',/\\bmarvel\\b/i],['Star Wars',/\\bstar wars\\b/i],['Sports',/\\bsports?\\b/i],
  ['Music',/\\bmusic|rocks?\\b/i],['Icons',/\\bicons?\\b/i]
 ];
 return rows.find(([,re])=>re.test(raw))?.[0]||'';
}

function funkoVariantFromText(value){
 const raw=String(value||'');
 const rows=[
  ['Chase',/\\bchase\\b/i],['Glow in the Dark',/glow in the dark|\\bgitd\\b/i],['Flocked',/\\bflocked\\b/i],
  ['Metallic',/\\bmetallic\\b/i],['Diamond',/\\bdiamond(?: collection)?\\b/i],['Black Light',/black light/i],
  ['Chrome',/\\bchrome\\b/i],['Special Edition',/special edition/i],['Exclusive',/\\bexclusive\\b/i]
 ];
 return rows.find(([,re])=>re.test(raw))?.[0]||'';
}

function funkoNameFromItem(item){
 const character=String(item?.character||'').trim();
 if(character)return character;
 let title=!isGenericProductTitle(item?.title)?String(item.title||'').trim():'';
 if(!title)return '';
 const parts=title.split(/\\s+[–—-]\\s+/).filter(Boolean);
 if(parts.length>1)title=parts[parts.length-1];
 title=title
  .replace(/#\\s*\\d{1,5}\\b/g,' ')
  .replace(/\\bfunko\\b|\\bpop!?\\b|\\bmovies?\\b|\\btelevision\\b|\\btv\\b|\\bgames?\\b|\\banimation\\b|\\bvinyl\\b|\\bfigure\\b|\\bfigura\\b/gi,' ')
  .replace(/\\bchase\\b|glow in the dark|\\bgitd\\b|\\bflocked\\b|\\bmetallic\\b|\\bdiamond(?: collection)?\\b|black light|\\bchrome\\b|special edition|\\bexclusive\\b/gi,' ')
  .replace(/[|:]+/g,' ').replace(/\\s+/g,' ').trim();
 return title;
}

function deriveFunkoFields(row){
 if(row?.type!=='funko')return row;
 const popNumber=normalizeFunkoNumber(row.popNumber)||funkoNumberFromTitle(row.title);
 const funkoCategory=String(row.funkoCategory||'').trim()||funkoCategoryFromText(\`${'${row.line||\'\'}'} ${'${row.title||\'\'}'}\`);
 const funkoVariant=String(row.funkoVariant||'').trim()||funkoVariantFromText(\`${'${row.edition||\'\'}'} ${'${row.title||\'\'}'} ${'${Array.isArray(row.tags)?row.tags.join(\' \'):\'\'}'}\`);
 const character=String(row.character||'').trim()||funkoNameFromItem({...row,character:''});
 return {...row,popNumber,funkoCategory,funkoVariant,character};
}

function funkoMatchParts(item){
 const row=deriveFunkoFields(item);
 const name=funkoNameFromItem(row);
 const nameTokens=normalizeComparableText(name).split(' ').filter(token=>token.length>=2);
 const popNumber=normalizeFunkoNumber(row.popNumber)||funkoNumberFromTitle(row.title);
 const variant=String(row.funkoVariant||'').trim();
 const variantTokens=normalizeComparableText(variant).split(' ').filter(token=>token.length>=3&&!['the','and'].includes(token));
 return {row,name,nameTokens,popNumber,variant,variantTokens};
}

function funkoTextMatches(item,raw){
 const {nameTokens,popNumber,variant,variantTokens}=funkoMatchParts(item);
 const hay=normalizeComparableText(raw);
 if(nameTokens.length){
  const hits=nameTokens.filter(token=>hay.includes(token)).length;
  if(hits<Math.max(1,Math.ceil(nameTokens.length*.6)))return false;
 }
 const explicitNumbers=[...String(raw||'').matchAll(/#\\s*(\\d{1,5})\\b/g)].map(match=>match[1]);
 if(popNumber&&explicitNumbers.length&&!explicitNumbers.includes(popNumber))return false;
 if(variantTokens.length&&!variantTokens.every(token=>hay.includes(token)))return false;
 if(!variant){
  const special=funkoVariantFromText(raw);
  if(special&&special!=='Special Edition'&&special!=='Exclusive')return false;
 }
 return Boolean(nameTokens.length||popNumber);
}

export function buildResearchIdentity(item){
 const title=!isGenericProductTitle(item?.title)?String(item.title).trim():'';
 const isFunko=item?.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(\`${'${title}'} ${'${item?.manufacturer||\'\'}'} ${'${item?.line||\'\'}'}\`);
 if(isFunko){
  const {name,popNumber,variant}=funkoMatchParts({...item,type:'funko'});
  const special=/^(normal|standard|regular)$/i.test(variant)?'':variant;
  const concise=[name,popNumber,special].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
  if(concise)return concise;
  const sku=String(item?.sku||'').trim();
  const barcode=String(item?.barcode||'').replace(/\\s/g,'');
  if(sku)return \`Funko ${'${sku}'}\`;
  if(barcode)return \`Funko ${'${barcode}'}\`;
  return 'Funko';
 }
 return (title||String(item?.character||'').trim()||String(item?.manufacturer||'').trim()||String(item?.line||'').trim()).replace(/\\s+/g,' ').trim();
}`;
core=rx(core,/export function buildResearchIdentity\(item\)\{[\s\S]*?\n\}\n\nfunction specificTitleScore/,identityBlock+'\n\nfunction specificTitleScore','replace research identity');

core=rx(core,/function finalizeIdentification\(result,analyses=\[\]\)\{[\s\S]*?\n\}\n\nasync function resolveCanonicalResearchIdentity/,`function finalizeIdentification(result,analyses=[]){
 let parsed=identificationSchema.parse(result);
 parsed=identificationSchema.parse(deriveFunkoFields(parsed));
 if(!isGenericProductTitle(parsed.title))return parsed;
 const candidate=[parsed,...analyses]
  .filter(row=>row?.title&&!isGenericProductTitle(row.title))
  .sort((a,b)=>specificTitleScore(b.title)-specificTitleScore(a.title))[0];
 if(!candidate)return parsed;
 return identificationSchema.parse(deriveFunkoFields({...parsed,title:candidate.title}));
}

async function resolveCanonicalResearchIdentity`,'finalize Funko fields');

core=core.replaceAll('barcode,isbn,sku,country,language','barcode,isbn,sku,popNumber,funkoCategory,funkoVariant,country,language');
core=core.replaceAll('En Funko, Item No./Item Number va en sku.','En Funko, Item No./Item Number va en sku. Extrae también popNumber (solo el número Pop visible), funkoCategory (Movies, Television, Games, Animation, etc.) y funkoVariant (Chase, Flocked, Glow in the Dark, Metallic, Diamond, Black Light, etc.; vacío si es normal o no se sabe).');
core=core.replaceAll('En Funko, Item No./Item Number pertenece a sku.','En Funko, Item No./Item Number pertenece a sku. Extrae también popNumber, funkoCategory y funkoVariant; nunca confundas Item No. con el número Pop.');

core=once(core," const query=[item.title,item.line,item.character,item.sku,item.cardNumber,item.issueNumber].filter(Boolean).join(' ').trim();",` const isFunko=item?.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(\`${'${item?.title||\'\'}'} ${'${item?.manufacturer||\'\'}'} ${'${item?.line||\'\'}'}\`);
 const query=isFunko?buildResearchIdentity(item):[item.title,item.line,item.character,item.sku,item.cardNumber,item.issueNumber].filter(Boolean).join(' ').trim();`,'PriceCharting concise query');
core=once(core," const requestedTokens=[...new Set(normalizeComparableText(`${item.title||''} ${item.character||''} ${item.line||''}`).split(' ').filter(x=>x.length>=3&&!stop.has(x)))];\n const identifiers=[...new Set([...(String(item.title||'').match(/\\d{2,}/g)||[]),item.sku,item.cardNumber,item.issueNumber].filter(Boolean).map(x=>normalizeComparableText(x)))];",` const requestedText=isFunko?\`${'${funkoNameFromItem(item)}'} ${'${item.funkoVariant||\'\'}'}\`:\`${'${item.title||\'\'}'} ${'${item.character||\'\'}'} ${'${item.line||\'\'}'}\`;
 const requestedTokens=[...new Set(normalizeComparableText(requestedText).split(' ').filter(x=>x.length>=3&&!stop.has(x)))];
 const identifiers=isFunko
  ?[normalizeFunkoNumber(item.popNumber)||funkoNumberFromTitle(item.title)].filter(Boolean).map(normalizeComparableText)
  :[...new Set([...(String(item.title||'').match(/\\d{2,}/g)||[]),item.sku,item.cardNumber,item.issueNumber].filter(Boolean).map(x=>normalizeComparableText(x)))];`,'PriceCharting Funko matching');

core=rx(core,/function relevantSourcesForItem\(item,rows\)\{[\s\S]*?\n\}\n\nfunction canonicalTitleFromSources/,`function relevantSourcesForItem(item,rows){
 const isFunko=item?.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(\`${'${item?.title||\'\'}'} ${'${item?.manufacturer||\'\'}'} ${'${item?.line||\'\'}'}\`);
 if(isFunko)return rows.filter(source=>funkoTextMatches({...item,type:'funko'},\`${'${source.title||\'\'}'} ${'${source.snippet||\'\'}'}\`)).slice(0,6);
 const stop=new Set(['the','and','for','with','from','funko','pop','movies','movie','figure','figura','edition','edicion','price','prices','buy','shop']);
 const titleTokens=normalizeComparableText(!isGenericProductTitle(item?.title)?item.title:\`${'${item?.manufacturer||\'\'}'} ${'${item?.line||\'\'}'} ${'${item?.character||\'\'}'}\`).split(' ').filter(x=>x.length>=3&&!stop.has(x)&&!/^\\d+$/.test(x));
 const ids=[item?.sku,item?.barcode,item?.isbn,item?.cardNumber,item?.issueNumber,...(String(item?.title||'').match(/\\d{2,}/g)||[])].filter(Boolean).map(normalizeComparableText);
 return rows.filter(source=>{
  const hay=normalizeComparableText(\`${'${source.title||\'\'}'} ${'${source.snippet||\'\'}'}\`);
  if(ids.some(id=>id&&hay.includes(id)))return true;
  const hits=titleTokens.filter(token=>hay.includes(token)).length;
  return titleTokens.length<=1?hits===titleTokens.length&&hits>0:hits>=2&&hits/titleTokens.length>=.45;
 }).slice(0,10);
}

function canonicalTitleFromSources`,'relevance uses concise Funko identity');

core=rx(core,/function conservativeFallbackComparables\(item,listings,sources\)\{[\s\S]*?\n\}\n\nexport async function deepseek/,`function conservativeFallbackComparables(item,listings,sources){
 const isFunko=item?.type==='funko'||/\\bfunko\\b|\\bpop!?\\b/i.test(\`${'${item?.title||\'\'}'} ${'${item?.manufacturer||\'\'}'} ${'${item?.line||\'\'}'}\`);
 if(isFunko){
  return listings.filter(listing=>{
   if(String(listing.id||'').startsWith('pricecharting-api-'))return true;
   const source=sources.find(x=>x.url===listing.url||x.id===listing.id);
   const raw=String(listing.title||'')+' '+String(source?.snippet||'');
   if(/\\b(lote|lot|bundle|protector|protective|case only|empty box|caja vacia|box only|reproduction|repro|keychain|llavero|sticker|pegatina)\\b/i.test(normalizeComparableText(raw)))return false;
   return funkoTextMatches({...item,type:'funko'},raw);
  });
 }
 const stop=new Set(['the','and','for','with','from','movies','movie','figure','figura','funko','pop','edition','edicion','volume','volumen','lord','rings']);
 const identityText=normalizeComparableText(\`${'${item.title||\'\'}'} ${'${item.character||\'\'}'} ${'${item.line||\'\'}'} ${'${item.franchise||\'\'}'}\`);
 const tokens=[...new Set(identityText.split(' ').filter(token=>token.length>=3&&!stop.has(token)&&!/^\\d+$/.test(token)))];
 const identifiers=[...new Set([...(String(item.title||'').match(/\\d{2,}/g)||[]),item.barcode,item.isbn,item.sku,item.cardNumber,item.issueNumber].filter(Boolean).map(x=>normalizeComparableText(x)).filter(Boolean))];
 const bad=/\\b(lote|lot|bundle|protector|protective|case only|empty box|caja vacia|box only|reproduction|repro|keychain|llavero|sticker|pegatina)\\b/i;
 return listings.filter(listing=>{
  if(String(listing.id||'').startsWith('pricecharting-api-'))return true;
  const source=sources.find(x=>x.url===listing.url||x.id===listing.id);
  const raw=String(listing.title||'')+' '+String(source?.snippet||'');
  if(bad.test(normalizeComparableText(raw)))return false;
  const hay=normalizeComparableText(raw);
  const idHits=identifiers.filter(id=>hay.includes(id)).length;
  const tokenHits=tokens.filter(token=>hay.includes(token)).length;
  const ratio=tokens.length?tokenHits/tokens.length:0;
  if(hostOf(listing.url).includes('pricecharting.com')&&(idHits>0||(tokenHits>=2&&ratio>=.34)))return true;
  if(idHits>0)return !tokens.length||tokenHits>=1||String(listing.sourceType)==='guide';
  if(tokens.length<=1)return tokenHits===tokens.length&&tokenHits>0;
  return tokenHits>=2&&ratio>=.5;
 });
}

export async function deepseek`,'comparables use concise Funko identity');

if(!core.includes('function limitPricingSources(rows)')){
 core=once(core,`function allowedPricingSource(source){
 const host=hostOf(source?.url);
 if(!host)return false;
 return host==='pricecharting.com'||host.endsWith('.pricecharting.com')
  ||host==='stockx.com'||host.endsWith('.stockx.com')
  ||/(^|\\.)ebay\\.[a-z.]+$/.test(host);
}` , `function allowedPricingSource(source){
 const host=hostOf(source?.url);
 if(!host)return false;
 return host==='pricecharting.com'||host.endsWith('.pricecharting.com')
  ||host==='stockx.com'||host.endsWith('.stockx.com')
  ||/(^|\\.)ebay\\.[a-z.]+$/.test(host);
}

function limitPricingSources(rows){
 const counts={pricecharting:0,stockx:0,ebay:0};
 return rows.filter(allowedPricingSource).filter(source=>{
  const host=hostOf(source.url);
  const group=host.includes('pricecharting.com')?'pricecharting':host.includes('stockx.com')?'stockx':'ebay';
  const max=group==='ebay'?2:1;
  if(counts[group]>=max)return false;
  counts[group]++;
  return true;
 }).slice(0,4);
}`,'pricing source limiter');
}

core=core.replace('    max_uses:1,','    max_uses:3,');
core=core.replace('Haz UNA sola búsqueda web, usando exactamente el nombre corto recibido; no lo amplíes con EAN, SKU, franquicia, año o edición salvo que ya formen parte literal de ese nombre.','Haz como máximo TRES búsquedas internas: una para PriceCharting, una para StockX y una para eBay. En cada sitio parte exactamente del nombre corto recibido; no lo amplíes con EAN, SKU, franquicia, año o edición salvo que ya formen parte literal de ese nombre. Devuelve cada precio en un párrafo separado con una única cita, para poder asociar importe y fuente sin ambigüedad.');
core=core.replace("   const exactQuery=`${identity} precio PriceCharting StockX eBay sold completed`.trim();","   const exactQuery=identity.trim();");
core=core.replace('   const allowed=keepUsableSources(found).filter(allowedPricingSource).slice(0,9);\n   webSources=uniqueSources([...webSources,...relevantSourcesForItem(item,allowed)]).slice(0,9);','   const allowed=limitPricingSources(keepUsableSources(found));\n   webSources=limitPricingSources(uniqueSources([...webSources,...relevantSourcesForItem(item,allowed)]));');
core=core.replace(' const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,9);',' const comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,6);');
core=core.replace(' const sources=uniqueSources(webSources).filter(allowedPricingSource).slice(0,9);',' const sources=limitPricingSources(uniqueSources(webSources));');
writeFileSync(corePath,core);

// ---------- UI ----------
const appPath='src/App.tsx';
let app=readFileSync(appPath,'utf8');
app=once(app,'      sku: result.sku,\n      country: result.country,','      sku: result.sku,\n      popNumber: result.popNumber,\n      funkoCategory: result.funkoCategory,\n      funkoVariant: result.funkoVariant,\n      country: result.country,','scanner Funko seed');
app=once(app,'            <Field label="Línea / colección"><input value={draft.line || \'\'} onChange={(e)=>set(\'line\',e.target.value)} placeholder="S.H.Figuarts, Marvel Legends…"/></Field>\n          </div>',`            <Field label="Línea / colección"><input value={draft.line || ''} onChange={(e)=>set('line',e.target.value)} placeholder="S.H.Figuarts, Marvel Legends…"/></Field>
            {draft.type === 'funko' && <>
              <Field label="Número Pop"><input inputMode="numeric" value={draft.popNumber || ''} onChange={(e)=>set('popNumber',e.target.value.replace(/\\D/g,'').slice(0,5))} placeholder="1982"/></Field>
              <Field label="Categoría Funko"><input value={draft.funkoCategory || ''} onChange={(e)=>set('funkoCategory',e.target.value)} placeholder="Movies, Television, Games…"/></Field>
              <Field label="Variante / especial"><input value={draft.funkoVariant || ''} onChange={(e)=>set('funkoVariant',e.target.value)} placeholder="Chase, Flocked, Glow in the Dark…"/></Field>
            </>}
          </div>`,'Funko form fields');
writeFileSync(appPath,app);

// ---------- tests ----------
const testsPath='tests/core.mjs';
let tests=readFileSync(testsPath,'utf8');
tests=once(tests,"assert.equal(buildResearchIdentity({title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',sku:'90310',barcode:'889698903105'}),'Éomer Funko Pop');",`assert.equal(buildResearchIdentity({title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',sku:'90310',barcode:'889698903105'}),'Éomer 1982');
assert.equal(buildResearchIdentity({title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982 Chase',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',funkoVariant:'Chase'}),'Éomer 1982 Chase');`,'Funko identity tests');
tests=once(tests,"  const result={title:'Funko Pop! Éomer #1982',type:'funko',franchise:'The Lord of the Rings',character:'Éomer',manufacturer:'Funko',line:'Pop! Movies',sku:'90310',confidence:.99,explanation:'Frontal como vista principal; trasera usada solo para la referencia'};","  const result={title:'Funko Pop! Éomer #1982',type:'funko',franchise:'The Lord of the Rings',character:'Éomer',manufacturer:'Funko',line:'Pop! Movies',popNumber:'1982',funkoCategory:'Movies',funkoVariant:'',sku:'90310',confidence:.99,explanation:'Frontal como vista principal; trasera usada solo para la referencia'};",'unified identify fixture');
tests=once(tests,"assert.equal(mergedIdentification.sku,'90310');","assert.equal(mergedIdentification.sku,'90310');\nassert.equal(mergedIdentification.popNumber,'1982');\nassert.equal(mergedIdentification.funkoCategory,'Movies');",'unified Funko assertions');
const insertion=`\n// Funko: la misma identidad corta debe mandar también en los filtros posteriores.\nconst funkoPriceFetch=async(url)=>{\n  if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[\n    {type:'web_search_result',title:'Éomer Funko Pop #1982 - 29,95 €',url:'https://www.ebay.es/itm/eomer1982',cited_text:'Éomer Funko Pop #1982 29,95 €'}\n  ]}]}),{status:200,headers:{'content-type':'application/json'}});\n  return new Response('{}',{status:404,headers:{'content-type':'application/json'}});\n};\nconst funkoResearch=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',line:'Pop! Movies',popNumber:'1982',sku:'90310'}},{key:'test',fetcher:funkoPriceFetch});\nassert.equal(funkoResearch.searchIdentity,'Éomer 1982');\nassert.equal(funkoResearch.asking.count,1);\nassert.equal(funkoResearch.asking.median,29.95);\n`;
tests=once(tests,'// Regresión: una respuesta JSON imperfecta del modelo no debe tumbar toda la investigación.\n','// Regresión: una respuesta JSON imperfecta del modelo no debe tumbar toda la investigación.\n'+insertion+'\n','Funko research regression');
tests=once(tests,'assert.match(appSource,/Mejorar con IA/);','assert.match(appSource,/Mejorar con IA/);\nassert.match(appSource,/Número Pop/);\nassert.match(appSource,/Categoría Funko/);\nassert.match(appSource,/Variante \/ especial/);','Funko UI tests');
tests=once(tests,"assert.match(currentCoreSource,/UNA sola búsqueda web de precios/);","assert.match(currentCoreSource,/UNA sola búsqueda web de precios/);\nassert.match(currentCoreSource,/max_uses:3/);\nassert.match(currentCoreSource,/limitPricingSources/);",'bounded search tests');
writeFileSync(testsPath,tests);

console.log('Funko pricing logic patch applied');
