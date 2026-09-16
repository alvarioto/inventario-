import fs from 'node:fs';
const path='tests/core.mjs';
let t=fs.readFileSync(path,'utf8');
const old="const pcTextOnlyListings=parsePublicListings(pcTextOnlySources,{USD_EUR:.9});";
const next="const pcTextOnlyListings=parsePublicListings(pcTextOnlySources.map(source=>({...source,snippet:source.description||''})),{USD_EUR:.9});";
if(!t.includes(old)) throw new Error('PriceCharting text-only regression line not found');
t=t.replace(old,next);
fs.writeFileSync(path,t);
console.log('PriceCharting text-only regression test fixed');
