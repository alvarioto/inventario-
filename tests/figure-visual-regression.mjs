import assert from 'node:assert/strict';
import { identify, applyFigureVisualAudit, applyFigurePackageAudit } from '../server/core.mjs';

// Unit guard: a confident correction requires 2 independent visible clues.
const corrected=applyFigureVisualAudit({
  title:'Marvel Legends Wolverine (Old Man Logan)',type:'figure',franchise:'Marvel',
  character:'Old Man Logan',manufacturer:'Hasbro',line:'Marvel Legends Series',
  scale:'6 inch',wave:'',exclusive:'',edition:'',year:null,sku:'',barcode:'',
  confidence:.96,explanation:'Primera identificación',tags:[]
},{
  verdict:'correct',title:'Marvel Legends Wolverine (Weapon X)',franchise:'Marvel',
  character:'Wolverine (Weapon X)',manufacturer:'Hasbro',line:'Marvel Legends Series',
  scale:'6 inch',wave:'',exclusive:'',edition:'',year:2026,
  visualEvidence:['casco/cables de Weapon X visibles','arnés y apariencia de experimento Weapon X'],confidence:.94
});
assert.equal(corrected.title,'Marvel Legends Wolverine (Weapon X)');
assert.equal(corrected.character,'Wolverine (Weapon X)');
assert.equal(corrected.manufacturer,'Hasbro');

// A correction with only one clue must NOT replace the initial figure.
const weak=applyFigureVisualAudit({
  title:'McFarlane Batman',type:'figure',character:'Batman',manufacturer:'McFarlane Toys',
  line:'DC Multiverse',confidence:.9,explanation:'x',tags:[]
},{
  verdict:'correct',title:'McFarlane Batman Variant',character:'Batman',
  visualEvidence:['parece otro traje'],confidence:.99
});
assert.equal(weak.title,'McFarlane Batman');

// Regresión: la auditoría de packaging nunca puede romper identificationSchema
// aunque el modelo devuelva demasiadas etiquetas o textos demasiado largos.
const noisyAudit=applyFigurePackageAudit({
  title:'Hasbro Marvel Legends The Infinity Saga Iron Man Mark LXXXV & Thanos',
  type:'figure',franchise:'Marvel',character:'Iron Man Mark LXXXV & Thanos',
  manufacturer:'Hasbro',line:'Marvel Legends Series',edition:'The Infinity Saga',
  sku:'F0192',confidence:.95,explanation:'x',
  tags:Array.from({length:10},(_,i)=>`tag-base-${i}`)
},{
  printedNames:['Iron Man Mark LXXXV','Thanos'],
  line:'Marvel Legends Series',
  edition:'The Infinity Saga',
  sku:'F0192',
  visibleTexts:[
    'texto visible extremadamente largo que supera claramente los sesenta caracteres permitidos por el esquema de identificación',
    ...Array.from({length:12},(_,i)=>`texto-extra-${i}`)
  ],
  confidence:.99
});
assert.ok(noisyAudit.tags.length<=12);
assert.ok(noisyAudit.tags.every(tag=>tag.length<=60));

// End-to-end: figure => main vision + independent visual verification + package audit.
// The second call corrects a loose/misread figure even if the packaging audit has no text.
let calls=0;
const fetcher=async(_url,init)=>{
  calls++;
  const body=JSON.parse(init.body);
  const imageCount=body.messages?.[1]?.content?.filter(x=>x.type==='image_url').length||0;
  if(calls===1){
    assert.equal(imageCount,2);
    const initial={
      title:'Marvel Legends Wolverine (Old Man Logan)',type:'figure',franchise:'Marvel',
      character:'Old Man Logan',manufacturer:'Hasbro',line:'Marvel Legends Series',
      scale:'6 inch',confidence:.95,explanation:'Reconocimiento inicial',tags:[]
    };
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(initial)}}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(calls===2){
    assert.equal(imageCount,2);
    const audit={
      verdict:'correct',title:'Marvel Legends Wolverine (Weapon X)',franchise:'Marvel',
      character:'Wolverine (Weapon X)',manufacturer:'Hasbro',line:'Marvel Legends Series',
      scale:'6 inch',wave:'',exclusive:'',edition:'',year:2026,
      visualEvidence:['casco/cables característicos de Weapon X','arnés y torso de la versión Weapon X'],confidence:.95
    };
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(audit)}}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  const packageAudit={printedNames:[],line:'',edition:'',sku:'',visibleTexts:[],confidence:0};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(packageAudit)}}]}),{status:200,headers:{'content-type':'application/json'}});
};

const result=await identify([
  'data:image/jpeg;base64,FRONT',
  'data:image/jpeg;base64,SIDE'
],{key:'test',fetcher});
assert.equal(calls,3);
assert.equal(result.type,'figure');
assert.equal(result.title,'Marvel Legends Wolverine (Weapon X)');
assert.equal(result.character,'Wolverine (Weapon X)');
assert.match(result.explanation,/Verificación visual específica/i);

console.log('figure visual regression tests ok');
