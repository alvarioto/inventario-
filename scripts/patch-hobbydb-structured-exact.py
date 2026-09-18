from pathlib import Path

p=Path('api/hobbydb-value.mjs')
s=p.read_text(encoding='utf-8')
old=""" const strongIdEvidence=Boolean(idHit||(strongQuery&&ids.length));
 const manufacturerHit=!manufacturerTokens.length||manufacturerTokens.some(x=>hay.includes(x));
 const lineHits=lineTokens.filter(x=>hay.includes(x)).length;
 const lineHit=!lineTokens.length||lineHits>=Math.max(1,Math.ceil(lineTokens.length*.5));
 if(brands.length&&manufacturerTokens.length&&!manufacturerHit)return null;
 if(series.length&&lineTokens.length&&!lineHit&&!strongIdEvidence)return null;
 if(ids.length&&!strongIdEvidence)return null;
 if(identityTokens.length&&identityHits<minIdentityHits)return null;
 if(distinctiveTokens.length&&distinctiveHits<Math.ceil(distinctiveTokens.length*.8))return null;
"""
new=""" const strongIdEvidence=Boolean(idHit||(strongQuery&&ids.length));
 const manufacturerHit=!manufacturerTokens.length||manufacturerTokens.some(x=>hay.includes(x));
 const lineHits=lineTokens.filter(x=>hay.includes(x)).length;
 const lineHit=!lineTokens.length||lineHits>=Math.max(1,Math.ceil(lineTokens.length*.5));
 // hobbyDB a veces no almacena el SKU comercial (ej. Hasbro G0644). En ese caso
 // solo aceptamos una coincidencia estructural muy fuerte: marca + linea y TODOS
 // los rasgos distintivos en el nombre canonico de la ficha, no solo Related Subjects.
 const coreName=normalize([a.name,a.variant_group_name].filter(Boolean).join(' '));
 const requiredCore=[...new Set([...characterTokens,...distinctiveTokens])].filter(x=>x.length>=3);
 const coreNameExact=requiredCore.length>=2&&requiredCore.every(x=>coreName.includes(x));
 const structuredExact=manufacturerHit&&lineHit&&coreNameExact;
 if(brands.length&&manufacturerTokens.length&&!manufacturerHit)return null;
 if(series.length&&lineTokens.length&&!lineHit&&!strongIdEvidence)return null;
 if(ids.length&&!strongIdEvidence&&!structuredExact)return null;
 if(identityTokens.length&&identityHits<minIdentityHits)return null;
 if(distinctiveTokens.length&&distinctiveHits<Math.ceil(distinctiveTokens.length*.8))return null;
"""
if old not in s: raise SystemExit('strict evidence block not found')
s=s.replace(old,new,1)
old=""" if(idHit)score+=300;else if(strongQuery&&ids.length)score+=220;
 if(manufacturerHit&&manufacturerTokens.length)score+=70;
"""
new=""" if(idHit)score+=300;else if(strongQuery&&ids.length)score+=220;else if(structuredExact)score+=210;
 if(manufacturerHit&&manufacturerTokens.length)score+=70;
"""
if old not in s: raise SystemExit('score block not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# Regression guard
pt=Path('tests/core.mjs')
t=pt.read_text(encoding='utf-8')
marker="assert.match(backendText,/distinctiveTokens/);"
extra="\nassert.match(backendText,/structuredExact/);\nassert.match(backendText,/coreNameExact/);"
if extra.strip() not in t:
    if marker not in t: raise SystemExit('backend guard marker missing')
    t=t.replace(marker,marker+extra,1)
pt.write_text(t,encoding='utf-8')
print('structured exact hobbyDB fallback applied')
