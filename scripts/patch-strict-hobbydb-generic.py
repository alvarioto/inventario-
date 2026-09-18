from pathlib import Path

# 1) Frontend: non-Funko searches must never inherit a possibly-wrong hobbyDB hint
api=Path('src/lib/api.ts')
s=api.read_text(encoding='utf-8')
old=""" const common={hobbydbUrl:hobbyDbSourceUrl(research)||undefined};
 const identity=isFunko?{
  ...common,
"""
new=""" const common=isFunko?{hobbydbUrl:hobbyDbSourceUrl(research)||undefined}:{};
 const identity=isFunko?{
  ...common,
"""
if old not in s: raise SystemExit('api common block not found')
s=s.replace(old,new,1)
api.write_text(s,encoding='utf-8')

# 2) Backend: require strong identity + distinctive title tokens for generic collectibles
p=Path('api/hobbydb-value.mjs')
s=p.read_text(encoding='utf-8')
start=s.index('function genericExactRow(')
end=s.index('async function resolveItem(', start)
replacement=r'''function genericExactRow(item,row,{strongQuery=false}={}){
 const a=row?.attributes||{};
 const related=(a.related_subjects||[]).map(x=>x?.name);
 const series=(a.series||[]).map?.(x=>x?.name)||[];
 const brands=(a.brand||[]).map(x=>normalize(x?.name));
 const hay=normalize([a.name,a.aka,a.ref_number,a.variant_group_name,a.variant_details_summary,...related,...series,...brands,...(Array.isArray(a.production_status)?a.production_status:[])].flat().filter(Boolean).join(' '));
 const stop=new Set(['the','and','with','from','marvel','comics','comic','figure','figura','series','action','collectible','retro']);
 const titleTokens=tokens(item.title||'').filter(x=>x.length>=3&&!stop.has(x));
 const characterTokens=tokens(item.character||'').filter(x=>x.length>=3&&!stop.has(x));
 const manufacturerTokens=tokens(item.manufacturer).filter(x=>x.length>=3);
 const lineTokens=tokens(item.line).filter(x=>x.length>=3&&!['series'].includes(x));
 const genericIdentity=new Set([...characterTokens,...manufacturerTokens,...lineTokens]);
 const distinctiveTokens=titleTokens.filter(x=>!genericIdentity.has(x)&&!['men','toys','toy'].includes(x));
 const identityTokens=[...new Set([...characterTokens,...titleTokens])];
 const identityHits=identityTokens.filter(x=>hay.includes(x)).length;
 const minIdentityHits=identityTokens.length<=1?1:Math.max(2,Math.ceil(identityTokens.length*.55));
 const distinctiveHits=distinctiveTokens.filter(x=>hay.includes(x)).length;
 const sku=normalize(item.sku),barcode=normalize(item.barcode);
 const ids=[sku,barcode].filter(Boolean);
 const idHit=ids.find(id=>hay.includes(id))||'';
 const strongIdEvidence=Boolean(idHit||(strongQuery&&ids.length));
 const manufacturerHit=!manufacturerTokens.length||manufacturerTokens.some(x=>hay.includes(x));
 const lineHits=lineTokens.filter(x=>hay.includes(x)).length;
 const lineHit=!lineTokens.length||lineHits>=Math.max(1,Math.ceil(lineTokens.length*.5));
 if(brands.length&&manufacturerTokens.length&&!manufacturerHit)return null;
 if(series.length&&lineTokens.length&&!lineHit&&!strongIdEvidence)return null;
 if(ids.length&&!strongIdEvidence)return null;
 if(identityTokens.length&&identityHits<minIdentityHits)return null;
 if(distinctiveTokens.length&&distinctiveHits<Math.ceil(distinctiveTokens.length*.8))return null;
 if(!ids.length&&!identityTokens.length)return null;
 let score=0;
 if(idHit)score+=300;else if(strongQuery&&ids.length)score+=220;
 if(manufacturerHit&&manufacturerTokens.length)score+=70;
 if(lineHit&&lineTokens.length)score+=70;
 score+=identityHits*25+distinctiveHits*60;
 if(normalize(a.name)===normalize(item.character||item.title||''))score+=70;
 return{row,score,variant:'exact item'};
}
async function resolveGenericItem(item,cookie){
 const name=String(item.title||item.character||'').trim();
 const sku=String(item.sku||'').trim(),barcode=String(item.barcode||'').trim();
 const queries=[sku,barcode,[item.manufacturer,item.line,name,sku].filter(Boolean).join(' '),[item.manufacturer,item.line,name].filter(Boolean).join(' '),[item.manufacturer,name].filter(Boolean).join(' '),String(item.title||'').trim(),String(item.character||'').trim()].map(x=>String(x||'').trim()).filter(Boolean);
 const unique=[...new Set(queries)],seen=new Map();
 for(const query of unique){
  let rows=[];try{rows=await searchCatalog(query,cookie);}catch(error){if(error?.code==='SESSION_EXPIRED')throw error;continue;}
  const strongQuery=Boolean((sku&&normalize(query)===normalize(sku))||(barcode&&normalize(query)===normalize(barcode)));
  for(const row of rows){
   if(!row?.id)continue;
   const key=String(row.id),current=seen.get(key);
   if(!current)seen.set(key,{row,strongQuery});
   else if(strongQuery&&!current.strongQuery)seen.set(key,{row,strongQuery:true});
  }
  const exact=[...seen.values()].map(entry=>genericExactRow(item,entry.row,{strongQuery:entry.strongQuery})).filter(Boolean);
  if(exact.length){exact.sort((a,b)=>b.score-a.score);const best=exact[0],a=best.row.attributes||{};return{id:String(best.row.id||a.id),url:rowUrl(best.row),title:a.name||name,variant:best.variant,searchEstimatedValue:Number(a.estimated_value)||null};}
 }
 throw new Error('No se encontró una ficha exacta en hobbyDB que coincida con referencia y variante/modelo.');
}
'''
s=s[:start]+replacement+s[end:]
p.write_text(s,encoding='utf-8')

# 3) Add regression test text assertions so broad generic match cannot creep back in
t=Path('tests/core.mjs')
ts=t.read_text(encoding='utf-8')
marker="assert.equal(buildResearchIdentity(weaponXFigure),'Hasbro Marvel Legends X-Men Weapon X Wolverine (Weapon X) G0644');"
extra="""
// La referencia G0644 y 'Weapon X' son identidad fuerte: nunca aceptar otro Wolverine genérico.
const backendText=readFileSync(new URL('../api/hobbydb-value.mjs',import.meta.url),'utf8');
assert.match(backendText,/ids\.length&&!strongIdEvidence/);
assert.match(backendText,/distinctiveTokens/);
assert.doesNotMatch(backendText,/x\.score\+=180/);
"""
if extra not in ts:
    if marker not in ts: raise SystemExit('weapon marker missing')
    ts=ts.replace(marker,marker+extra,1)
t.write_text(ts,encoding='utf-8')
print('strict generic hobbyDB matching applied')
