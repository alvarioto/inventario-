import assert from 'node:assert/strict';
import { identify, applyFigurePackageAudit, applyFigureVisualAudit, buildResearchIdentity } from '../server/core.mjs';

// Guardia 1: el camino visual estable de Funko no puede heredar thinking/reasoning
// activado para mejoras exclusivas de figuras.
let calls=0;
const funkoFetch=async(_url,init)=>{
  calls++;
  const body=JSON.parse(init.body);
  assert.equal(body.thinking?.type,'disabled');
  assert.equal(body.reasoning_effort,undefined);
  const images=body.messages?.[1]?.content?.filter(block=>block.type==='image_url')||[];
  assert.equal(images.length,3);
  const result={
    title:'Funko Pop! Éomer #1982',type:'funko',franchise:'The Lord of the Rings',
    character:'Éomer',manufacturer:'Funko',line:'Pop! Movies',sku:'90310',
    confidence:.99,explanation:'Frontal principal; trasera para referencia.'
  };
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{
    status:200,headers:{'content-type':'application/json'}
  });
};
const eomer=await identify([
  'data:image/jpeg;base64,AAAA','data:image/jpeg;base64,BBBB','data:image/jpeg;base64,CCCC'
],{key:'test',fetcher:funkoFetch});
assert.equal(calls,1);
assert.equal(eomer.type,'funko');
assert.equal(eomer.title,'Funko Pop! Éomer #1982');
assert.equal(eomer.sku,'90310');
assert.equal(eomer.popNumber,'1982');
assert.equal(eomer.funkoCategory,'Pop! Regular');
assert.equal(buildResearchIdentity(eomer),'Éomer 1982');

// Guardia 2: CHASE sigue detectándose aunque el proveedor omita funkoVariant
// y solo lo describa en la evidencia visual.
const chaseFetch=async(_url,init)=>{
  const body=JSON.parse(init.body);
  assert.equal(body.thinking?.type,'disabled');
  assert.equal(body.reasoning_effort,undefined);
  const result={
    title:'Funko Pop! 101 Dalmatians Cruella De Vil #1663',type:'funko',
    character:'Cruella De Vil',manufacturer:'Funko',line:'Pop! Disney',
    popNumber:'1663',funkoVariant:'',confidence:.98,
    explanation:'Pegatina amarilla CHASE visible en el frontal',tags:[]
  };
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{
    status:200,headers:{'content-type':'application/json'}
  });
};
const chase=await identify('data:image/jpeg;base64,CHASEPHOTO',{key:'test',fetcher:chaseFetch});
assert.equal(chase.type,'funko');
assert.equal(chase.funkoVariant,'Chase');
assert.equal(buildResearchIdentity(chase),'Cruella De Vil 1663 Chase');

// Guardia 3: cualquier auditoría exclusiva de figuras debe ser un NO-OP absoluto
// sobre un Funko, aunque reciba datos muy convincentes de otra figura.
const protectedFunko={
  title:'Funko Pop! Éomer #1982',type:'funko',character:'Éomer',manufacturer:'Funko',
  line:'Pop! Movies',popNumber:'1982',sku:'90310',confidence:.99,
  explanation:'Identificación Funko',tags:[]
};
const afterFigureAudit=applyFigurePackageAudit(protectedFunko,{
  printedNames:['Wolverine (Weapon X)'],line:'Marvel Legends Series',sku:'G0644',
  visibleTexts:['X-Men','Weapon X'],confidence:1
});
assert.deepEqual(afterFigureAudit,protectedFunko);

const afterVisualFigureAudit=applyFigureVisualAudit(protectedFunko,{
  verdict:'correct',title:'Marvel Legends Wolverine (Weapon X)',franchise:'Marvel',
  character:'Wolverine',manufacturer:'Hasbro',line:'Marvel Legends Series',
  scale:'6 inch',wave:'',exclusive:'',edition:'',year:2026,
  visualEvidence:['máscara visible','traje amarillo y azul'],confidence:1
});
assert.deepEqual(afterVisualFigureAudit,protectedFunko);

console.log('funko regression tests ok');
