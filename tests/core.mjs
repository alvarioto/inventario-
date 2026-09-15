import assert from 'node:assert/strict';
import { identificationSchema, summarizeListings, safeUrl } from '../server/core.mjs';
const identification = identificationSchema.parse({title:'Batman #125',type:'comic',confidence:.8,explanation:'Texto visible'});
assert.equal(identification.franchise,'');
assert.equal(safeUrl('javascript:alert(1)'),null);
assert.deepEqual(summarizeListings([{price:10,currency:'EUR',shipping:2},{price:20,currency:'EUR',shipping:0}]),{kind:'asking',currency:'EUR',count:2,min:12,max:20,median:16,label:'Precios solicitados con envío conocido; no son ventas cerradas.'});
console.log('core tests ok');
