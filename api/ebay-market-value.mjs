const TOKEN_URL='https://api.ebay.com/identity/v1/oauth2/token';
const BROWSE_BASE='https://api.ebay.com/buy/browse/v1';
const TARGET_SAMPLE=15;
const MIN_SAMPLE=2;
const SEARCH_LIMIT=50;
const DETAIL_LIMIT=30;
const cache=globalThis.__frikivaultEbayTokenCache||(globalThis.__frikivaultEbayTokenCache={token:'',expiresAt:0});

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}
function configuredOrigins(){
  const values=String(process.env.APP_ORIGIN||'').split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);
  return new Set(['https://frikivault-alvarioto-2026.web.app','https://frikivault-alvarioto-2026.firebaseapp.com',...values]);
}
function applyCors(req,res){
  const origin=String(req.headers?.origin||'').replace(/\/$/,'');
  if(!origin)return true;
  if(!configuredOrigins().has(origin))return false;
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age','86400');
  return true;
}
function normalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
function compact(value){return normalize(value).replace(/\s+/g,'');}
function words(value){
  const stop=new Set(['the','and','for','with','from','this','that','edition','series','figure','figura','funko','pop','comic','comics','star','wars','marvel','dc']);
  return normalize(value).split(' ').filter(x=>x.length>=2&&!stop.has(x));
}
function uniq(values){return [...new Set(values.filter(Boolean))];}
function standalone(hay,value){
  const token=normalize(value);
  if(!token)return false;
  return (' '+normalize(hay)+' ').includes(' '+token+' ');
}
function numericId(value){
  const raw=String(value||'').replace(/[^0-9]/g,'');
  return /^\d{8,14}$/.test(raw)?raw:'';
}
function cleanVariant(value){
  const raw=normalize(value);
  if(!raw||['classic','regular','standard','normal','base'].includes(raw))return'';
  return raw;
}
function aspectMap(row){
  const map=new Map();
  for(const a of row?.localizedAspects||[]){
    const name=normalize(a?.name),value=String(a?.value||'').trim();
    if(name&&value)map.set(name,value);
  }
  return map;
}
function evidence(row){
  const aspects=(row?.localizedAspects||[]).map(a=>`${a?.name||''}: ${a?.value||''}`).join(' ');
  const gtin=Array.isArray(row?.gtin)?row.gtin.join(' '):String(row?.gtin||'');
  return [
    row?.title,row?.shortDescription,row?.brand,row?.mpn,gtin,row?.categoryPath,
    row?.condition,row?.conditionDescription,aspects
  ].filter(Boolean).join(' ');
}
function listingLooksWrong(item,row){
  const raw=normalize(evidence(row));
  const category=normalize(row?.categoryPath||row?.category?.categoryName||'');
  const wanted=normalize([item.title,item.edition,item.funkoVariant,item.funkoCategory].filter(Boolean).join(' '));
  if(item.type==='comic'||item.type==='manga'){
    if(/trading card|sports card|video game|action figure|funko|lego/.test(category))return'categoría incompatible';
  }else if(item.type==='figure'){
    if(/video game|trading card|comic book|manga|funko pop/.test(category))return'categoría incompatible';
  }else if(item.type==='card'){
    if(/video game|comic book|manga|action figure/.test(category))return'categoría incompatible';
  }else if(item.type==='game'){
    if(/trading card|comic book|manga|action figure/.test(category))return'categoría incompatible';
  }else if(item.type==='funko'){
    if(/video game|trading card|comic book|manga/.test(category))return'categoría incompatible';
  }
  const rejects=[
    ['empty box',/\bempty box\b|\bbox only\b|\bpackaging only\b|\bno figure\b|\bno game\b|\bno comic\b/],
    ['replacement',/\breplacement\b|\bspare part\b|\bparts only\b/],
    ['custom',/\bcustom\b|\bcustomized\b|\bcustomised\b/],
    ['reproduction',/\breproduction\b|\brepro\b|\bbootleg\b|\bknockoff\b|\bknock off\b/],
    ['digital',/\bdigital only\b|\bdownload code\b|\bpdf\b/],
    ['lot',/\blot of\b|\bbundle of\b|\bjob lot\b/]
  ];
  for(const [key,re] of rejects){
    if(re.test(raw)&&!re.test(wanted))return key;
  }
  if(item.type!=='replica'&&/\breplica\b/.test(raw)&&!/\breplica\b/.test(wanted))return'replica';
  return'';
}
function fieldTokens(value){return uniq(words(value));}
function tokenCoverage(value,hay){
  const tokens=fieldTokens(value);
  if(!tokens.length)return 1;
  const hits=tokens.filter(t=>normalize(hay).includes(t)).length;
  return hits/tokens.length;
}
function extractScaleHint(item){
  const raw=String(item?.scale||'')+' '+String(item?.line||'')+' '+String(item?.title||'');
  const ratio=raw.match(/\b1\s*[\/:]\s*(\d{1,2})\b/i);
  if(ratio)return {kind:'ratio',value:Number(ratio[1])};
  const inches=raw.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:inch(?:es)?|in\b|")/i);
  if(inches)return {kind:'inch',value:Number(inches[1])};
  return null;
}
function scaleMatches(hay,hint){
  if(!hint)return true;
  const raw=String(hay||'');
  if(hint.kind==='ratio'){
    if(new RegExp('\\b1\\s*[\\/:]\\s*'+hint.value+'\\b','i').test(raw))return true;
    if(hint.value===4){
      const inch=raw.match(/\b(1[789]|20|21)\s*(?:inch(?:es)?|in\b|")/i);
      if(inch)return true;
      if(/\bquarter\s+scale\b/i.test(raw))return true;
    }
    return false;
  }
  const found=raw.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:inch(?:es)?|in\b|")/i);
  return !!found&&Math.abs(Number(found[1])-hint.value)<=1;
}
function inferredYear(item){
  const direct=Number(item?.year);
  if(Number.isInteger(direct)&&direct>=1900&&direct<=2100)return String(direct);
  const raw=[item?.title,item?.line,item?.edition].filter(Boolean).join(' ');
  return raw.match(/\b(?:19|20)\d{2}\b/)?.[0]||'';
}
function hasConflictingAspect(map,names,wanted){
  const expected=compact(wanted);
  if(!expected)return false;
  for(const name of names){
    const actual=[...map.entries()].find(([k])=>k===normalize(name))?.[1];
    if(actual&&compact(actual)!==expected)return true;
  }
  return false;
}
function exactMatch(item,row){
  const hay=evidence(row),norm=normalize(hay),map=aspectMap(row);
  const reason=listingLooksWrong(item,row);
  if(reason)return {ok:false,score:0,reason:`descartado: ${reason}`};

  let score=0;
  const strong=[];
  const softExact=[];
  const barcode=numericId(item.barcode||item.isbn);
  const sku=compact(item.sku);
  const candidateGtins=uniq([
    row?._matchedGtin,
    ...(Array.isArray(row?.gtin)?row.gtin:row?.gtin?[row.gtin]:[]),
    map.get('ean'),map.get('upc'),map.get('isbn'),map.get('gtin')
  ].map(numericId));

  if(barcode){
    if(candidateGtins.length&&!candidateGtins.includes(barcode))return {ok:false,score:0,reason:'GTIN/ISBN distinto'};
    if(candidateGtins.includes(barcode)||compact(hay).includes(barcode)){score+=120;strong.push('GTIN/ISBN');}
  }

  const candidateMpn=compact(row?.mpn||map.get('mpn')||map.get('manufacturer part number')||map.get('numero de pieza del fabricante')||'');
  if(sku){
    if(candidateMpn&&candidateMpn!==sku)return {ok:false,score:0,reason:'SKU/MPN distinto'};
    if(candidateMpn===sku||compact(hay).includes(sku)){score+=110;strong.push('SKU/MPN');}
  }

  const hasStrongProductId=strong.some(x=>['GTIN/ISBN','SKU/MPN','ISBN'].includes(x));

  const manufacturer=String(item.manufacturer||'').trim();
  if(manufacturer){
    if(hasConflictingAspect(map,['brand','marca'],manufacturer))return {ok:false,score:0,reason:'marca distinta'};
    const c=tokenCoverage(manufacturer,hay);
    if(c>=.8){score+=18;softExact.push('marca');}
  }
  const line=String(item.line||'').trim();
  if(line){
    const c=tokenCoverage(line,hay);
    if(c>=.75){score+=20;softExact.push('línea');}
  }
  const character=String(item.character||'').trim();
  if(character){
    const c=tokenCoverage(character,hay);
    if(c>=.8){score+=25;softExact.push('personaje');}
    else if(c<.5&&!hasStrongProductId)return {ok:false,score:0,reason:'personaje distinto'};
  }

  const title=String(item.title||'').trim();
  const titleCoverage=tokenCoverage(title,hay);
  const titleTooWeak=fieldTokens(title).length>=2&&titleCoverage<.62&&!hasStrongProductId;
  score+=Math.round(titleCoverage*45);
  if(titleCoverage>=.72)softExact.push('título');

  if(item.type==='figure'){
    const scaleHint=extractScaleHint(item);
    if(scaleHint){
      if(!scaleMatches(hay,scaleHint))return {ok:false,score:0,reason:'escala/tamaño distinto o no verificable'};
      score+=30;softExact.push('escala');
    }
    const yearHint=inferredYear(item);
    if(yearHint&&standalone(hay,yearHint)){score+=15;softExact.push('año');}
  }

  if(titleTooWeak&&softExact.length<3)return {ok:false,score:0,reason:'título insuficiente'};

  if(item.type==='funko'){
    const pop=String(item.popNumber||'').replace(/\D/g,'');
    if(pop&&!standalone(hay,pop))return {ok:false,score:0,reason:'número Pop distinto o ausente'};
    if(pop){score+=70;strong.push('número Pop');}
    const variant=cleanVariant(item.funkoVariant);
    if(variant){
      if(!normalize(hay).includes(variant))return {ok:false,score:0,reason:'variante Funko distinta'};
      score+=40;strong.push('variante');
    }
    const category=normalize(item.funkoCategory);
    if(category&&category!=='pop regular'&&category!=='regular'){
      if(tokenCoverage(category,hay)<.6)return {ok:false,score:0,reason:'formato Funko distinto'};
      score+=25;
    }
  }

  if(item.type==='comic'||item.type==='manga'){
    const issue=String(item.issueNumber||'').trim();
    if(issue&&!standalone(hay,issue)&&!normalize(hay).includes(normalize('#'+issue)))return {ok:false,score:0,reason:'número de cómic distinto'};
    if(issue){score+=55;strong.push('número');}
    const isbn=numericId(item.isbn);
    if(isbn){
      if(candidateGtins.length&&!candidateGtins.includes(isbn))return {ok:false,score:0,reason:'ISBN distinto'};
      if(candidateGtins.includes(isbn)||compact(hay).includes(isbn)){score+=120;strong.push('ISBN');}
    }
  }

  if(item.type==='card'){
    const card=String(item.cardNumber||'').trim();
    if(card&&!normalize(hay).includes(normalize(card)))return {ok:false,score:0,reason:'número de carta distinto'};
    if(card){score+=60;strong.push('número carta');}
    if(item.setName&&tokenCoverage(item.setName,hay)<.7)return {ok:false,score:0,reason:'set distinto'};
  }

  if(item.type==='game'&&item.platform){
    if(tokenCoverage(item.platform,hay)<.8)return {ok:false,score:0,reason:'plataforma distinta'};
    score+=45;strong.push('plataforma');
  }

  if(item.type==='lego'){
    const setNo=String(item.sku||'').replace(/\D/g,'')||String(item.title||'').match(/\b\d{4,6}\b/)?.[0]||'';
    if(setNo&&!standalone(hay,setNo))return {ok:false,score:0,reason:'número de set distinto'};
    if(setNo){score+=80;strong.push('número set');}
  }

  for(const [label,value,weight] of [
    ['edición',item.edition,30],['exclusiva',item.exclusive,35],['wave',item.wave,25],
    ['escala',item.scale,20],['rareza',item.rarity,20]
  ]){
    const v=String(value||'').trim();
    if(!v)continue;
    const c=tokenCoverage(v,hay);
    if(c>=.75){score+=weight;if(weight>=30)strong.push(label);}
    else if(fieldTokens(v).length>=2&&c<.4)return {ok:false,score:0,reason:`${label} distinta`};
  }

  // Un GTIN/ISBN conocido sí debe quedar demostrado. Un SKU puede no estar publicado
  // por el vendedor; si no hay MPN contradictorio, exigimos varios rasgos físicos exactos.
  if(barcode&&!strong.some(x=>['GTIN/ISBN','ISBN'].includes(x))){
    return {ok:false,score:0,reason:'sin GTIN/ISBN verificable'};
  }
  if(sku&&!strong.includes('SKU/MPN')&&softExact.length<3){
    return {ok:false,score:0,reason:'SKU no verificable y faltan rasgos exactos suficientes'};
  }
  // Sin códigos, exigimos al menos un rasgo discriminante específico además del título.
  if(!barcode&&!sku&&strong.length===0){
    const discriminants=[
      item.popNumber,item.issueNumber,item.cardNumber,item.platform,item.edition,
      item.exclusive,item.wave,item.setName,item.funkoVariant,item.scale
    ].filter(v=>String(v||'').trim());
    if(!discriminants.length&&score<78)return {ok:false,score,reason:'identidad demasiado genérica'};
  }

  return {ok:score>=78,score,reason:score>=78?'coincidencia exacta':'puntuación insuficiente',matchedBy:strong};
}
function buildQueries(item){
  const rows=[];
  const barcode=numericId(item.barcode||item.isbn);
  if(barcode)rows.push({kind:'gtin',value:barcode});
  const pushText=(parts)=>{
    const q=uniq(parts.map(x=>String(x||'').trim())).join(' ').replace(/\s+/g,' ').trim();
    if(q&&q.length>=3&&!rows.some(r=>r.kind==='q'&&r.value===q))rows.push({kind:'q',value:q.slice(0,100)});
  };
  if(item.type==='funko'){
    pushText([item.character||item.title,item.popNumber,item.funkoVariant,item.funkoCategory]);
    pushText([item.character||item.title,item.popNumber]);
  }else if(item.type==='figure'){
    const scaleHint=extractScaleHint(item);
    const scaleText=scaleHint?.kind==='ratio'?`1/${scaleHint.value}`:scaleHint?.kind==='inch'?`${scaleHint.value} inch`:'';
    const yearHint=inferredYear(item);
    if(item.sku)pushText([item.sku]);
    pushText([item.manufacturer,item.character||item.title,yearHint,scaleText,item.exclusive]);
    pushText([item.manufacturer,item.character||item.title,scaleText]);
    pushText([item.manufacturer,item.character||item.title,yearHint]);
    pushText([item.manufacturer,item.character||item.title]);
  }else if(item.type==='comic'||item.type==='manga'){
    pushText([item.title,item.issueNumber?('#'+item.issueNumber):'',item.edition,item.isbn]);
  }else if(item.type==='card'){
    pushText([item.setName,item.title||item.character,item.cardNumber,item.rarity]);
  }else if(item.type==='game'){
    pushText([item.title,item.platform,item.edition]);
  }else{
    pushText([item.manufacturer,item.line,item.title,item.sku,item.edition]);
  }
  pushText([item.title,item.sku,item.barcode]);
  return rows.slice(0,6);
}
async function token(){
  const now=Date.now();
  if(cache.token&&cache.expiresAt>now+60000)return cache.token;
  const clientId=String(process.env.EBAY_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.EBAY_CLIENT_SECRET||'').trim();
  if(!clientId||!clientSecret)throw new Error('Faltan EBAY_CLIENT_ID o EBAY_CLIENT_SECRET.');
  const basic=Buffer.from(clientId+':'+clientSecret).toString('base64');
  const body=new URLSearchParams({grant_type:'client_credentials',scope:'https://api.ebay.com/oauth/api_scope'});
  const response=await fetch(TOKEN_URL,{method:'POST',headers:{Authorization:'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw new Error(data.error_description||data.error||`OAuth eBay HTTP ${response.status}`);
  cache.token=data.access_token;
  cache.expiresAt=now+(Number(data.expires_in)||7200)*1000;
  return cache.token;
}
function headers(accessToken,marketplace){
  return {Authorization:'Bearer '+accessToken,'X-EBAY-C-MARKETPLACE-ID':marketplace};
}
async function search(accessToken,marketplace,item){
  const out=new Map();
  for(const query of buildQueries(item)){
    const url=new URL(BROWSE_BASE+'/item_summary/search');
    if(query.kind==='gtin')url.searchParams.set('gtin',query.value);
    else url.searchParams.set('q',query.value);
    url.searchParams.set('limit',String(SEARCH_LIMIT));
    const response=await fetch(url,{headers:headers(accessToken,marketplace),signal:AbortSignal.timeout(15000)});
    if(!response.ok)continue;
    const data=await response.json().catch(()=>({}));
    for(const row of data.itemSummaries||[]){
      if(!row?.itemId)continue;
      const enriched=query.kind==='gtin'?{...row,_matchedGtin:query.value}:row;
      if(!out.has(row.itemId))out.set(row.itemId,enriched);
      else if(query.kind==='gtin')out.set(row.itemId,{...out.get(row.itemId),_matchedGtin:query.value});
    }
    if(out.size>=DETAIL_LIMIT)break;
  }
  return [...out.values()].slice(0,DETAIL_LIMIT);
}
async function detail(accessToken,marketplace,itemId){
  const url=BROWSE_BASE+'/item/'+encodeURIComponent(itemId);
  const response=await fetch(url,{headers:headers(accessToken,marketplace),signal:AbortSignal.timeout(12000)});
  if(!response.ok)return null;
  return response.json().catch(()=>null);
}
async function details(accessToken,marketplace,summaries){
  const result=[];
  for(let i=0;i<summaries.length;i+=5){
    const batch=summaries.slice(i,i+5);
    const rows=await Promise.all(batch.map(async summary=>{
      const full=await detail(accessToken,marketplace,summary.itemId).catch(()=>null);
      return full?{...summary,...full}:summary;
    }));
    result.push(...rows);
    if(result.length>=DETAIL_LIMIT)break;
  }
  return result;
}
function toListing(row,match){
  const value=Number(row?.price?.value);
  const currency=String(row?.price?.currency||'').toUpperCase();
  if(!Number.isFinite(value)||value<=0||!currency)return null;
  const shipping=Number(row?.shippingOptions?.[0]?.shippingCost?.value);
  return {
    itemId:String(row.itemId||''),
    title:String(row.title||'').slice(0,300),
    url:String(row.itemWebUrl||row.itemAffiliateWebUrl||''),
    price:value,
    currency,
    shipping:Number.isFinite(shipping)&&shipping>=0?shipping:null,
    condition:String(row.condition||''),
    score:match.score,
    matchedBy:match.matchedBy||[]
  };
}
function trimOutliers(rows){
  if(rows.length<5)return rows;
  const prices=rows.map(x=>x.price).sort((a,b)=>a-b);
  const median=(prices[Math.floor((prices.length-1)/2)]+prices[Math.ceil((prices.length-1)/2)])/2;
  const robust=rows.filter(x=>x.price>=median*.45&&x.price<=median*2.2);
  return robust.length>=MIN_SAMPLE?robust:rows;
}
function aggregate(rows){
  const byCurrency=new Map();
  for(const row of rows){
    const arr=byCurrency.get(row.currency)||[];
    arr.push(row);byCurrency.set(row.currency,arr);
  }
  const groups=[...byCurrency.entries()].sort((a,b)=>b[1].length-a[1].length);
  if(!groups.length)return null;
  const [currency,group]=groups[0];
  const exact=trimOutliers(group.sort((a,b)=>b.score-a.score).slice(0,TARGET_SAMPLE));
  if(exact.length<MIN_SAMPLE)return {currency,count:exact.length,average:null,min:null,max:null,listings:exact};
  const prices=exact.map(x=>x.price);
  return {
    currency,
    count:exact.length,
    average:prices.reduce((a,b)=>a+b,0)/prices.length,
    min:Math.min(...prices),
    max:Math.max(...prices),
    listings:exact
  };
}

export {normalize,buildQueries,exactMatch,aggregate};

export default async function handler(req,res){
  if(!applyCors(req,res))return json(res,403,{ok:false,error:'Origen no autorizado.'});
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  if(req.method!=='POST')return json(res,405,{ok:false,error:'POST only'});
  const item=req.body?.item||{};
  if(!String(item.title||item.character||item.sku||item.barcode||item.isbn||'').trim()){
    return json(res,400,{ok:false,error:'Falta identidad del artículo.'});
  }
  const marketplace=String(process.env.EBAY_MARKETPLACE_ID||'EBAY_ES').trim();
  try{
    const accessToken=await token();
    const summaries=await search(accessToken,marketplace,item);
    if(!summaries.length)return json(res,200,{ok:true,found:false,reason:'eBay no devolvió candidatos.',targetSample:TARGET_SAMPLE,minimumSample:MIN_SAMPLE,listings:[]});
    const fullRows=await details(accessToken,marketplace,summaries);
    const checked=fullRows.map(row=>({row,match:exactMatch(item,row)}));
    const accepted=checked.filter(x=>x.match.ok).map(x=>toListing(x.row,x.match)).filter(Boolean);
    const market=aggregate(accepted);
    const rejected=checked.filter(x=>!x.match.ok).slice(0,10).map(x=>({title:String(x.row?.title||'').slice(0,180),reason:x.match.reason}));
    if(!market||market.count<MIN_SAMPLE||market.average==null){
      return json(res,200,{ok:true,found:false,reason:`Solo se encontraron ${market?.count||0} anuncios que pudieran verificarse como el artículo exacto; hacen falta al menos ${MIN_SAMPLE}.`,targetSample:TARGET_SAMPLE,minimumSample:MIN_SAMPLE,listings:market?.listings||[],rejected});
    }
    return json(res,200,{
      ok:true,found:true,source:'eBay Browse API',marketplace,targetSample:TARGET_SAMPLE,minimumSample:MIN_SAMPLE,
      average:Number(market.average.toFixed(2)),min:Number(market.min.toFixed(2)),max:Number(market.max.toFixed(2)),
      currency:market.currency,count:market.count,listings:market.listings,rejected,
      methodology:`Promedio de ${market.count} anuncios activos de eBay verificados como la misma identidad; máximo ${TARGET_SAMPLE}. Se excluyen coincidencias parciales y precios extremos evidentes.`
    });
  }catch(error){
    return json(res,502,{ok:false,error:error instanceof Error?error.message:'No se pudo consultar eBay.'});
  }
}
