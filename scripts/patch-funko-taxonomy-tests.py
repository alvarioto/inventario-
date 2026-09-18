from pathlib import Path

path = Path('tests/core.mjs')
text = path.read_text(encoding='utf-8')
old = "assert.equal(mergedIdentification.funkoCategory,'Movies');"
new = "assert.equal(mergedIdentification.funkoCategory,'Pop! Regular');"
if old not in text:
    raise SystemExit('Old Funko category assertion not found')
text = text.replace(old, new, 1)

anchor = "assert.equal(buildResearchIdentity(chaseIdentification),'Cruella De Vil 1663 Chase');"
extra = """

// Formato/línea y variante son dimensiones distintas. Kinder NO es una variante.
const kinderMax={title:'Max Mayfield',type:'funko',character:'Max Mayfield',manufacturer:'Funko',line:'Stranger Things',funkoCategory:'Kinder / Promotional',funkoVariant:'',popNumber:'',sku:'VC265'};
assert.equal(buildResearchIdentity(kinderMax),'Max Mayfield Kinder');
assert.equal(buildResearchIdentity({...kinderMax,funkoVariant:'Upside Down'}),'Max Mayfield Kinder Upside Down');
"""
if anchor not in text:
    raise SystemExit('Chase anchor not found')
text = text.replace(anchor, anchor + extra, 1)
path.write_text(text, encoding='utf-8')
print('Funko taxonomy tests updated')
