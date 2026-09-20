import assert from 'node:assert/strict';
import {buildSearchQuery,parseSearchRows,parseProductPage,chooseBest,choosePrice} from '../api/pricecharting-value.mjs';

const chase={type:'funko',manufacturer:'Funko',character:'Cruella De Vil',popNumber:'1663',funkoVariant:'Chase',hasBox:true};
assert.equal(buildSearchQuery(chase),'Cruella De Vil 1663 Chase Funko');

const html=`
<row id="product-1" data-product="1">
 <cell class="title"><a href="/game/funko-pop-disney/cruella-de-vil-1663">Cruella De Vil #1663</a></cell>
 <cell class="console phone-landscape-hidden">Funko POP Disney</cell>
 <cell class="price numeric used_price">$5.00</cell>
 <cell class="price numeric cib_price">$7.00</cell>
 <cell class="price numeric new_price">$9.00</cell>
</row>
<row id="product-2" data-product="2">
 <cell class="title"><a href="/game/funko-pop-disney/cruella-de-vil-chase-1663">Cruella De Vil [Chase] #1663</a></cell>
 <cell class="console phone-landscape-hidden">Funko POP Disney</cell>
 <cell class="price numeric used_price">$9.04</cell>
 <cell class="price numeric cib_price">$12.00</cell>
 <cell class="price numeric new_price">$15.06</cell>
</row>`;
const rows=parseSearchRows(html);
assert.equal(rows.length,2);
const best=chooseBest(chase,rows);
assert.ok(best.url.endsWith('/cruella-de-vil-chase-1663'));
assert.equal(best.prices.outOfBox,9.04);
assert.equal(best.prices.inBox,12);
assert.equal(best.prices.new,15.06);
assert.deepEqual(choosePrice(chase,best.prices),{condition:'In Box',amount:12});
assert.deepEqual(choosePrice({...chase,hasBox:false},best.prices),{condition:'Out of Box',amount:9.04});
assert.deepEqual(choosePrice({...chase,sealed:true},best.prices),{condition:'New',amount:15.06});

const classic=chooseBest({...chase,funkoVariant:''},rows);
assert.ok(classic.url.endsWith('/cruella-de-vil-1663'));

const page=parseProductPage(`
<title>Eomer #1982 Prices | Funko POP Movies | New & Loose Values</title>
<span id="used_price">$17.00</span>
<span id="cib_price">$22.00</span>
<span id="new_price">$25.00</span>
`,'https://www.pricecharting.com/game/funko-pop-movies/eomer-1982');
assert.equal(page.title,'Eomer #1982');
assert.deepEqual(page.prices,{outOfBox:17,inBox:22,new:25});

console.log('pricecharting tests ok');
