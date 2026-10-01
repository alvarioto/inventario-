from pathlib import Path

core_path = Path('src/lib/ai-core.mjs')
core = core_path.read_text(encoding='utf-8')

anchor = "export async function identify(input,config){"
if anchor not in core:
    raise SystemExit('identify anchor not found')

helper = r'''
const figurePackageAuditSchema=z.object({
 printedNames:z.array(z.string().max(140)).max(6).default([]),
 line:z.string().max(160).default(''),
 edition:z.string().max(160).default(''),
 sku:z.string().max(120).default(''),
 visibleTexts:z.array(z.string().max(180)).max(16).default([]),
 confidence:z.number().min(0).max(1).default(0)
});

function cleanPrintedLabel(value){
 return String(value||'').replace(/\s+/g,' ').replace(/^[\s:;,.\-–—]+|[\s:;,.\-–—]+$/g,'').trim();
}

export function applyFigurePackageAudit(row,audit){
 if(!row||row.type!=='figure'||!audit||Number(audit.confidence)<.68)return row;
 const names=[...new Set((audit.printedNames||[]).map(cleanPrintedLabel).filter(Boolean))]
  .filter(name=>!/^(?:marvel(?: comics)?|x-?men|dc(?: comics)?|hasbro|legends(?: series)?|warning)$/i.test(name));
 if(!names.length)return row;
 const audited=normalizeComparableText(names.join(' '));
 const current=normalizeComparableText(`${row.title||''} ${row.character||''}`);
 const nameTokens=audited.split(' ').filter(token=>token.length>=3&&!['the','and','with'].includes(token));
 const overlap=nameTokens.filter(token=>current.includes(token)).length;
 const conflict=nameTokens.length>0&&overlap<Math.ceil(nameTokens.length*.7);
 const line=cleanPrintedLabel(row.line||audit.line||'');
 const printedTitle=[line,names.join(' & ')].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 const edition=cleanPrintedLabel(audit.edition||row.edition||'');
 const sku=cleanPrintedLabel(audit.sku||row.sku||'');
 const tags=[...new Set([...(Array.isArray(row.tags)?row.tags:[]),...names,...(edition?[edition]:[]),...(audit.visibleTexts||[]).map(cleanPrintedLabel).filter(Boolean).slice(0,8)])];
 return {
  ...row,
  title:(conflict||names.length>1||isGenericProductTitle(row.title))&&printedTitle?printedTitle:row.title,
  character:names.join(' & '),
  line:line||row.line,
  edition:edition||row.edition,
  sku:sku||row.sku,
  tags,
  confidence:Math.max(Number(row.confidence)||0,Number(audit.confidence)||0),
  explanation:`${row.explanation||''} Auditoría literal del frontal: ${names.join(' & ')}${sku?` · SKU ${sku}`:''}.`.trim()
 };
}

async function auditFigurePackage(images,config){
 try{
  const result=await deepseek([
   {role:'system',content:'SEGUNDA PASADA DE CONTROL PARA FIGURAS. Tu única tarea es LEER TEXTO LITERAL del embalaje; NO identifiques la variante por la cara, traje, edad, pose ni por memoria. Devuelve SOLO JSON: {"printedNames":[],"line":"","edition":"","sku":"","visibleTexts":[],"confidence":0}. printedNames contiene EXCLUSIVAMENTE los nombres/etiquetas del producto impresos junto a la figura o en su cartela (por ejemplo "Wolverine (Weapon X)", "Iron Man Mark LXXXV", "Thanos"). NO metas logos de franquicia como Marvel, X-Men o DC. line es la línea impresa si se lee (p. ej. Marvel Legends Series). edition es una edición/colección explícita si está impresa. sku solo si el código de producto es legible. visibleTexts conserva otras frases cortas útiles. Si no puedes leer una etiqueta con seguridad, déjala fuera. Está PROHIBIDO sustituir una etiqueta visible por otra versión conocida del personaje: si el cartón dice Weapon X, no puedes responder Old Man Logan.'},
   {role:'user',content:[
    {type:'text',text:'Lee literalmente el frontal de este artículo. Prioriza la etiqueta de nombre del producto sobre cualquier deducción visual. No inventes ninguna variante que no aparezca escrita.'},
    ...images.slice(0,2).map((url,index)=>({type:'image_url',image_url:{url},detail:index===0?'high':'low'}))
   ]}
  ],{...config,maxTokens:500,timeoutMs:18000,retries:0,jsonMode:false});
  return figurePackageAuditSchema.parse(result);
 }catch{return null;}
}

'''
core = core.replace(anchor, helper + anchor, 1)

old_prompt = "Datos desconocidos: cadena vacía; booleanos desconocidos: null; year null. confidence 0..1. No inventes precios ni datos personales."
new_prompt = "REGLA ANTI-ALUCINACIÓN PARA FIGURAS: si el frontal imprime un nombre o variante concreta, ese texto manda sobre tu reconocimiento visual. NO puedes cambiarlo por otra versión del mismo personaje que no esté escrita (por ejemplo, si aparece Wolverine (Weapon X), está prohibido responder Old Man Logan). Datos desconocidos: cadena vacía; booleanos desconocidos: null; year null. confidence 0..1. No inventes precios ni datos personales."
if old_prompt not in core:
    raise SystemExit('prompt anchor not found')
core = core.replace(old_prompt, new_prompt, 1)

old_return = " return finalizeIdentification(result,[result]);\n}\n\nexport async function research(input,config){"
new_return = " let finalized=finalizeIdentification(result,[result]);\n if(finalized.type==='figure'){\n  const packageAudit=await auditFigurePackage(images,config);\n  finalized=finalizeIdentification(applyFigurePackageAudit(finalized,packageAudit),[finalized]);\n }\n return finalized;\n}\n\nexport async function research(input,config){"
if old_return not in core:
    raise SystemExit('identify return anchor not found')
core = core.replace(old_return, new_return, 1)
core_path.write_text(core, encoding='utf-8')


test_path = Path('tests/core.mjs')
test = test_path.read_text(encoding='utf-8')
old_import = "import { identificationSchema, summarizeListings, safeUrl, deepseek, deepseekWebSearch, parsePublicListings, research, identify, isGenericProductTitle, buildResearchIdentity } from '../server/core.mjs';"
new_import = "import { identificationSchema, summarizeListings, safeUrl, deepseek, deepseekWebSearch, parsePublicListings, research, identify, isGenericProductTitle, buildResearchIdentity, applyFigurePackageAudit } from '../server/core.mjs';"
if old_import not in test:
    raise SystemExit('test import anchor not found')
test = test.replace(old_import, new_import, 1)

needle = "assert.equal(weaponXIdentification.sku,'G0644');\n"
regression = r'''

// Regresión: una lectura visual equivocada como "Old Man Logan" debe perder
// frente al texto literal impreso en la cartela: "Wolverine (Weapon X)".
const correctedWeaponX=applyFigurePackageAudit({
 title:'Marvel Legends Wolverine (Old Man Logan)',type:'figure',franchise:'Marvel',character:'Old Man Logan',
 manufacturer:'Hasbro',line:'Marvel Legends Series',edition:'',sku:'',confidence:.95,
 explanation:'Reconocimiento visual de Logan',tags:[]
},{
 printedNames:['Wolverine (Weapon X)'],line:'Marvel Legends Series',edition:'',sku:'G0644',
 visibleTexts:['X-Men','Weapon X'],confidence:.99
});
assert.equal(correctedWeaponX.title,'Marvel Legends Series Wolverine (Weapon X)');
assert.equal(correctedWeaponX.character,'Wolverine (Weapon X)');
assert.equal(correctedWeaponX.sku,'G0644');
assert.doesNotMatch(correctedWeaponX.title,/Old Man Logan/i);
'''
if needle not in test:
    raise SystemExit('weaponX test anchor not found')
test = test.replace(needle, needle + regression, 1)
test_path.write_text(test, encoding='utf-8')
