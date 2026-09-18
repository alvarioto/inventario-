from pathlib import Path

core = Path('src/lib/ai-core.mjs')
text = core.read_text(encoding='utf-8')

# 1) Corrección determinista del tipo cuando la visión confunde arte de cómic con una figura física.
anchor = """function finalizeIdentification(result,analyses=[]){
 let parsed=identificationSchema.parse(result);
 parsed=identificationSchema.parse(deriveFunkoFields(parsed));
"""
replacement = """function correctCollectibleType(row){
 if(!row||row.type!=='comic')return row;
 const manufacturer=normalizeComparableText(row.manufacturer);
 const line=normalizeComparableText(row.line);
 const evidence=normalizeComparableText(`${row.title||''} ${row.edition||''} ${row.explanation||''} ${Array.isArray(row.tags)?row.tags.join(' '):''}`);
 const toyBrand=/^(hasbro|mattel|mcfarlane toys|neca|mezco|bandai|super7)$/.test(manufacturer);
 const toyLine=/\\bmarvel legends\\b|\\bblack series\\b|\\bmasters of the universe\\b|\\bgi joe classified\\b|\\baction figure\\b/.test(line);
 const physicalFigure=/\\baction figure\\b|\\bfigura articulada\\b|\\barticulated figure\\b|\\bblister\\b|\\bblister card\\b|\\bcarded figure\\b|\\bmuneco articulado\\b|\\baccesorios intercambiables\\b|\\binterchangeable accessories\\b/.test(evidence);
 return (toyBrand||toyLine||physicalFigure)?{...row,type:'figure'}:row;
}

function finalizeIdentification(result,analyses=[]){
 let parsed=identificationSchema.parse(result);
 parsed=identificationSchema.parse(correctCollectibleType(deriveFunkoFields(parsed)));
"""
if anchor not in text:
    raise SystemExit('finalize anchor not found')
text = text.replace(anchor, replacement, 1)

# 2) Refuerzo del prompt de una sola foto.
needle = "type: ${itemTypes.join(',')}. confidence entre 0 y 1."
replacement = "type: ${itemTypes.join(',')}. TIPO DE OBJETO CRÍTICO: clasifica por el OBJETO FÍSICO visible, no por el diseño, logos ni palabras impresas en el embalaje. Una figura/muñeco articulado dentro de un blister es type=figure aunque el cartón diga MARVEL COMICS, X-MEN, DC COMICS o parezca una portada. Usa type=comic solo cuando el objeto físico sea realmente una publicación con páginas, grapas o lomo. confidence entre 0 y 1."
if needle not in text:
    raise SystemExit('single prompt type instruction not found')
text = text.replace(needle, replacement, 1)

# 3) Refuerzo del prompt multimodal principal.
needle = "title debe ser el nombre comercial/canónico real, jamás una descripción de la fotografía."
replacement = "TIPO DE OBJETO CRÍTICO: decide type por el objeto físico real, nunca por logos/texto/arte del packaging. Si se ve una figura articulada en un blister con accesorios, type debe ser figure aunque aparezcan palabras como MARVEL COMICS, X-MEN o ilustraciones de cómic. type=comic exige que el objeto físico sea una publicación con páginas/grapas/lomo. title debe ser el nombre comercial/canónico real, jamás una descripción de la fotografía."
if needle not in text:
    raise SystemExit('main prompt title instruction not found')
text = text.replace(needle, replacement, 1)

core.write_text(text, encoding='utf-8')

# 4) Test de regresión con el caso Wolverine/Weapon X que la visión clasifica erróneamente como comic.
tests = Path('tests/core.mjs')
t = tests.read_text(encoding='utf-8')
anchor = "assert.equal(mergedIdentification.funkoCategory,'Pop! Regular');"
extra = r"""

// Regresión: el arte "MARVEL COMICS / X-MEN" del cartón no puede convertir
// una figura Hasbro/Marvel Legends en un cómic.
const weaponXVisionFetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
 title:'Marvel Legends X-Men Wolverine (Weapon X)',
 type:'comic',
 franchise:'Marvel / X-Men',
 character:'Wolverine',
 manufacturer:'Hasbro',
 line:'Marvel Legends',
 sku:'G0644',
 confidence:.96,
 explanation:'Figura articulada de Wolverine dentro de un blister con manos, cabeza y accesorios intercambiables; el cartón lleva el logo MARVEL COMICS.',
 tags:['action figure','blister card']
})}}]}),{status:200,headers:{'content-type':'application/json'}});
const weaponXIdentification=await identify('data:image/jpeg;base64,WEAPONX',{key:'test',fetcher:weaponXVisionFetch});
assert.equal(weaponXIdentification.type,'figure');
assert.equal(weaponXIdentification.manufacturer,'Hasbro');
assert.equal(weaponXIdentification.sku,'G0644');
"""
if anchor not in t:
    raise SystemExit('test anchor not found')
t = t.replace(anchor, anchor + extra, 1)
tests.write_text(t, encoding='utf-8')
print('Physical object type guard applied')
