from pathlib import Path

core = Path('src/lib/ai-core.mjs')
text = core.read_text(encoding='utf-8')

old = '''function funkoCategoryFromText(value){
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
'''
new = '''function funkoCategoryFromText(value){
 const raw=String(value||'');
 // funkoCategory representa FORMATO/LÍNEA física, no la franquicia ni el acabado.
 const rows=[
  ['Kinder / Promotional',/\\bkinder(?: joy)?\\b|\\bpromotional\\b|\\bpromo mini\\b/i],
  ['Bitty Pop!',/\\bbitty(?: pop)?\\b/i],['Pocket Pop!',/\\bpocket pop\\b|\\bkeychain\\b|\\bllavero\\b/i],
  ['Pop! Mega',/\\bmega pop\\b|\\b18(?:[- ]?inch| pulgadas?)\\b/i],['Pop! Jumbo',/\\bjumbo pop\\b|\\b10(?:[- ]?inch| pulgadas?)\\b/i],
  ['Pop! Super',/\\bsuper pop\\b|\\b6(?:[- ]?inch| pulgadas?)\\b/i],['Pop! Rides',/\\bpop!? rides?\\b|\\brides?\\b/i],
  ['Pop! Town',/\\bpop!? towns?\\b|\\btowns?\\b/i],['Pop! Moments',/\\b(?:movie )?moments?\\b/i],
  ['Pop! Covers',/\\b(?:comic|album|game) covers?\\b|\\bpop!? covers?\\b/i],['Pop! Pack',/\\b[234]-?pack\\b|\\bmulti-?pack\\b/i],
  ['Funko Soda',/\\bfunko soda\\b|\\bsoda figure\\b/i],['Mystery Minis',/\\bmystery minis?\\b/i],
  ['Funko Gold',/\\bfunko gold\\b/i],['Loungefly',/\\bloungefly\\b/i],
  ['Pop! Regular',/\\bfunko pop!?\\b|\\bpop!? (?:vinyl|television|movies?|games?|animation|heroes|disney|marvel|star wars|sports|music|icons)\\b/i]
 ];
 return rows.find(([,re])=>re.test(raw))?.[0]||'';
}

function funkoVariantFromText(value){
 const raw=String(value||'');
 const rows=[
  ['Upside Down',/\\bupside down\\b/i],
  ['Chase',/\\bchase\\b/i],['Glow in the Dark',/glow in the dark|\\bgitd\\b/i],['Flocked',/\\bflocked\\b/i],
  ['Metallic',/\\bmetallic\\b/i],['Diamond Collection',/\\bdiamond(?: collection)?\\b/i],['Black Light',/black light/i],
  ['Chrome',/\\bchrome\\b/i],['Clear / Translucent',/\\bclear\\b|\\btranslucent\\b/i],['Scented',/\\bscented\\b/i],
  ['Patina',/\\bpatina\\b/i],['Wood Deco',/\\bwood deco\\b|\\bwooden\\b/i],['DIY',/\\bdiy\\b|do it yourself/i],['Art Series',/\\bart series\\b/i]
 ];
 return rows.find(([,re])=>re.test(raw))?.[0]||'';
}
'''
if old not in text:
    raise SystemExit('taxonomy functions block not found')
text = text.replace(old, new, 1)

old = '''function deriveFunkoFields(row){
 if(row?.type!=='funko')return row;
 const popNumber=normalizeFunkoNumber(row.popNumber)||funkoNumberFromTitle(row.title);
 const funkoCategory=String(row.funkoCategory||'').trim()||funkoCategoryFromText(`${row.line||''} ${row.title||''}`);
 // Si el modelo ve y describe una pegatina de variante pero deja el campo vacío,
 // recuperamos la variante desde la explicación/tags. Nunca degradamos Chase a normal.
 const funkoVariant=String(row.funkoVariant||'').trim()||funkoVariantFromText(`${row.edition||''} ${row.title||''} ${row.explanation||''} ${Array.isArray(row.tags)?row.tags.join(' '):''}`);
 const character=String(row.character||'').trim()||funkoNameFromItem({...row,character:''});
 return {...row,popNumber,funkoCategory,funkoVariant,character};
}
'''
new = '''function deriveFunkoFields(row){
 if(row?.type!=='funko')return row;
 const popNumber=normalizeFunkoNumber(row.popNumber)||funkoNumberFromTitle(row.title);
 const categoryEvidence=`${row.funkoCategory||''} ${row.line||''} ${row.title||''} ${row.edition||''} ${row.explanation||''} ${Array.isArray(row.tags)?row.tags.join(' '):''}`;
 const detectedCategory=funkoCategoryFromText(categoryEvidence);
 const oldCategory=/^(Movies|Television|Games|Animation|Heroes|Disney|Marvel|Star Wars|Sports|Music|Icons)$/i.test(String(row.funkoCategory||'').trim());
 const funkoCategory=detectedCategory||(!oldCategory?String(row.funkoCategory||'').trim():'');
 const funkoVariant=String(row.funkoVariant||'').trim()||funkoVariantFromText(`${row.edition||''} ${row.title||''} ${row.explanation||''} ${Array.isArray(row.tags)?row.tags.join(' '):''}`);
 const character=String(row.character||'').trim()||funkoNameFromItem({...row,character:''});
 return {...row,popNumber,funkoCategory,funkoVariant,character};
}
'''
if old not in text:
    raise SystemExit('deriveFunkoFields block not found')
text = text.replace(old, new, 1)

old = '''  const {name,popNumber,variant}=funkoMatchParts({...item,type:'funko'});
  const special=/^(normal|standard|regular)$/i.test(variant)?'':variant;
  const concise=[name,popNumber,special].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
'''
new = '''  const {row,name,popNumber,variant}=funkoMatchParts({...item,type:'funko'});
  const special=/^(normal|standard|regular|classic)$/i.test(variant)?'':variant;
  const category=String(row.funkoCategory||'').trim();
  const categoryHint=/kinder|promotional/i.test(category)?'Kinder':/bitty/i.test(category)?'Bitty':/pocket/i.test(category)?'Pocket':/mystery minis?/i.test(category)?'Mystery Minis':/soda/i.test(category)?'Funko Soda':(!category||/pop!? regular/i.test(category)?'':category);
  const concise=[name,popNumber,categoryHint,special].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
'''
if old not in text:
    raise SystemExit('buildResearchIdentity block not found')
text = text.replace(old, new, 1)

# Quita palabras de formato del nombre del personaje.
old = ".replace(/\\bfunko\\b|\\bpop!?\\b|\\bmovies?\\b|\\btelevision\\b|\\btv\\b|\\bgames?\\b|\\banimation\\b|\\bvinyl\\b|\\bfigure\\b|\\bfigura\\b/gi,' ')"
new = ".replace(/\\bfunko\\b|\\bpop!?\\b|\\bmovies?\\b|\\btelevision\\b|\\btv\\b|\\bgames?\\b|\\banimation\\b|\\bvinyl\\b|\\bfigure\\b|\\bfigura\\b|\\bkinder(?: joy)?\\b|\\bpromotional\\b|\\bbitty\\b|\\bpocket\\b|\\bmystery minis?\\b|\\bsoda\\b|\\brides?\\b|\\btowns?\\b|\\bmoments?\\b|\\bcovers?\\b/gi,' ')"
if old not in text:
    raise SystemExit('funkoName strip regex not found')
text = text.replace(old, new, 1)

# Añade instrucciones de taxonomía y productos no numerados a ambos prompts de visión.
needle = 'Extrae también popNumber (solo el número Pop visible) y funkoCategory (Movies, Television, Games, Animation, etc.).'
replacement = 'Extrae también popNumber SOLO si existe un número POP real. funkoCategory significa FORMATO/LÍNEA física y debe ser uno de los valores reconocibles: Kinder / Promotional, Bitty Pop!, Pocket Pop!, Pop! Regular, Pop! Super, Pop! Jumbo, Pop! Mega, Pop! Rides, Pop! Town, Pop! Moments, Pop! Covers, Pop! Pack, Funko Soda, Mystery Minis, Funko Gold o Loungefly. No metas Kinder, Bitty, Pocket, Soda, etc. en funkoVariant. Para minis promocionales/Kinder sin caja puede no existir número Pop: déjalo vacío y conserva códigos moldeados como VC265 en sku. Una versión visual "Upside Down" sí es una variante: usa funkoVariant="Upside Down" solo si la apariencia lo respalda claramente (por ejemplo coloración roja/rosada característica); la versión de colores normales queda sin variante especial.'
if needle not in text:
    raise SystemExit('single view category instruction not found')
text = text.replace(needle, replacement, 1)

needle = 'Extrae también popNumber, funkoCategory y funkoVariant; nunca confundas Item No. con el número Pop.'
replacement = 'Extrae también popNumber, funkoCategory y funkoVariant; nunca confundas Item No. con el número Pop. funkoCategory es el FORMATO/LÍNEA física (Kinder / Promotional, Bitty Pop!, Pocket Pop!, Pop! Regular/Super/Jumbo/Mega, Rides, Town, Moments, Covers, Pack, Funko Soda, Mystery Minis, Funko Gold, Loungefly), no la franquicia. Kinder/Promotional puede no tener número Pop; conserva códigos moldeados como VC265 en sku. funkoVariant es solo la versión real (Chase, Glow, Flocked, Diamond, Upside Down, etc.), nunca "Kinder".'
if needle not in text:
    raise SystemExit('combined view category instruction not found')
text = text.replace(needle, replacement, 1)

# El sistema ya no obliga a una numeración inexistente en líneas no-POP.
needle = " En Funko revisa expresamente TODAS las fotos para localizar el número Pop. Si aparece un número Pop visible, popNumber no puede quedar vacío. No lo confundas con Item No./SKU."
replacement = " En Funko revisa expresamente TODAS las fotos para localizar el número Pop. Si aparece un número Pop visible, popNumber no puede quedar vacío. Si es una línea no numerada (Kinder/Promotional, Mystery Minis, etc.), popNumber debe quedar vacío y cualquier código moldeado va en sku. No lo confundas con Item No./SKU."
if needle not in text:
    raise SystemExit('pop number system suffix not found')
text = text.replace(needle, replacement, 1)

# Actualiza la guía de búsqueda pública para aceptar líneas no POP sin Reference #.
text = text.replace(
 "En hobbyDB busca primero nombre + número Pop.",
 "En hobbyDB busca primero nombre + número Pop cuando exista; para líneas no numeradas usa nombre + formato/línea (por ejemplo Kinder).",
 1
)
text = text.replace(
 "La ficha individual válida debe confirmar Brand: Funko, una Series que contenga Pop!, Reference # igual al número Pop solicitado y la misma variante; si aparecen metadatos Type, para un Funko normal debe ser Art Toys.",
 "Para un Pop! numerado, la ficha individual válida debe confirmar Brand: Funko, una Series que contenga Pop!, Reference # igual al número Pop solicitado y la misma variante. Para Kinder/Promotional, Bitty, Mystery Minis, Soda u otras líneas no numeradas NO exijas Reference # ni Series Pop!: exige Brand Funko, nombre/personaje, formato/línea y variante compatibles.",
 1
)

core.write_text(text, encoding='utf-8')

# Aclara el formulario: Kinder pertenece a formato/línea, no a variante.
app = Path('src/App.tsx')
ui = app.read_text(encoding='utf-8')
old = '<Field label="Categoría Funko"><input value={draft.funkoCategory || \'\'} onChange={(e)=>set(\'funkoCategory\',e.target.value)} placeholder="Movies, Television, Games…"/></Field>'
new = '<Field label="Formato / línea Funko"><input value={draft.funkoCategory || \'\'} onChange={(e)=>set(\'funkoCategory\',e.target.value)} placeholder="Kinder / Promotional, Bitty Pop!, Regular, Soda…"/></Field>'
if old not in ui:
    raise SystemExit('Funko category field not found')
ui = ui.replace(old, new, 1)
old = '<Field label="Variante / especial"><input value={draft.funkoVariant || \'\'} onChange={(e)=>set(\'funkoVariant\',e.target.value)} placeholder="Chase, Flocked, Glow in the Dark…"/></Field>'
new = '<Field label="Variante / acabado"><input value={draft.funkoVariant || \'\'} onChange={(e)=>set(\'funkoVariant\',e.target.value)} placeholder="Chase, Upside Down, Flocked, Glow, Diamond…"/></Field>'
if old not in ui:
    raise SystemExit('Funko variant field not found')
ui = ui.replace(old, new, 1)
app.write_text(ui, encoding='utf-8')
print('Funko taxonomy patch applied')
