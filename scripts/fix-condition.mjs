import { readFileSync, writeFileSync } from 'node:fs';

const corePath = 'src/lib/ai-core.mjs';
let core = readFileSync(corePath, 'utf8');
const anchor = "const text=z.string().max(500).default('');\n";
const helper = `const text=z.string().max(500).default('');
const conditionValues=['new','like-new','very-good','good','fair','poor'];
function normalizeCondition(value){
 if(value==null)return null;
 const raw=String(value).trim().toLowerCase().replace(/[_\\s]+/g,'-');
 if(!raw||['unknown','n-a','na','null','none','unspecified','desconocido'].includes(raw))return null;
 const aliases={'brand-new':'new','mint':'new','sealed':'new','nuevo':'new','like-new':'like-new','near-mint':'like-new','como-nuevo':'like-new','very-good':'very-good','verygood':'very-good','excellent':'very-good','muy-bueno':'very-good','good':'good','used':'good','pre-owned':'good','bueno':'good','fair':'fair','acceptable':'fair','regular':'fair','poor':'poor','damaged':'poor','malo':'poor'};
 return aliases[raw] || (conditionValues.includes(raw) ? raw : null);
}
`;
if (!core.includes(anchor)) throw new Error('text anchor not found');
core = core.replace(anchor, helper);
const oldCondition = "condition:z.enum(['new','like-new','very-good','good','fair','poor']).nullable().default(null),";
const newCondition = "condition:z.preprocess(normalizeCondition,z.enum(conditionValues).nullable()).default(null),";
if (!core.includes(oldCondition)) throw new Error('condition schema not found');
core = core.replace(oldCondition, newCondition);
writeFileSync(corePath, core);

const testsPath='tests/core.mjs';
let tests=readFileSync(testsPath,'utf8');
const marker="assert.equal(identification.hasBox,null);\n";
const addition=`assert.equal(identification.hasBox,null);
assert.equal(identificationSchema.parse({title:'Test mint',type:'funko',condition:'mint',confidence:.9,explanation:'x'}).condition,'new');
assert.equal(identificationSchema.parse({title:'Test used',type:'funko',condition:'used',confidence:.9,explanation:'x'}).condition,'good');
assert.equal(identificationSchema.parse({title:'Test unknown',type:'funko',condition:'unknown',confidence:.9,explanation:'x'}).condition,null);
`;
if (!tests.includes(marker)) throw new Error('test marker not found');
tests=tests.replace(marker,addition);
writeFileSync(testsPath,tests);
