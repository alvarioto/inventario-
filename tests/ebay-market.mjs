import assert from 'node:assert/strict';
import { exactMatch, aggregate, buildQueries } from '../api/ebay-market-value.mjs';

const batman={
  type:'figure',
  title:'NECA Batman 1989 18 inch',
  character:'Batman',
  manufacturer:'NECA',
  line:'Batman 1989',
  barcode:'634482612415',
  sku:''
};
const batmanExact={
  title:'NECA Batman 1989 18 inch Michael Keaton Figure',
  brand:'NECA',
  gtin:['634482612415'],
  categoryPath:'Toys & Hobbies > Action Figures',
  price:{value:'199.99',currency:'EUR'},
  itemId:'exact-batman',
  itemWebUrl:'https://www.ebay.es/itm/exact-batman',
  localizedAspects:[
    {name:'Brand',value:'NECA'},
    {name:'Character',value:'Batman'}
  ]
};
assert.equal(exactMatch(batman,batmanExact).ok,true);

const batmanWrongGame={
  title:'Batman Rise Of Sin Tzu Action Figure Commemorative Edition Xbox',
  gtin:['999999999999'],
  categoryPath:'Video Games & Consoles > Video Games',
  price:{value:'177.93',currency:'EUR'},
  localizedAspects:[{name:'Platform',value:'Microsoft Xbox'}]
};
assert.equal(exactMatch(batman,batmanWrongGame).ok,false);

const comic={
  type:'comic',
  title:'Star Wars Sombra de Maul',
  issueNumber:'1',
  edition:'Edición limitada 001 Variant Cover',
  manufacturer:'Planeta Cómic',
  isbn:''
};
const exactComic={
  title:'Star Wars Sombra de Maul #1 Edición Limitada 001 Variant Cover Planeta Cómic',
  categoryPath:'Books, Comics & Magazines > Comic Books & Memorabilia',
  localizedAspects:[
    {name:'Publisher',value:'Planeta Cómic'},
    {name:'Issue Number',value:'1'}
  ],
  price:{value:'29.90',currency:'EUR'}
};
assert.equal(exactMatch(comic,exactComic).ok,true);

const wrongTopps={
  title:'Darth Maul 2 #CC-10 Star Wars 2023 Topps Comic Cover Art',
  categoryPath:'Collectibles > Non-Sport Trading Cards > Star Wars Cards',
  localizedAspects:[{name:'Manufacturer',value:'Topps'}],
  price:{value:'1.34',currency:'EUR'}
};
assert.equal(exactMatch(comic,wrongTopps).ok,false);

const chase={
  type:'funko',
  title:'Funko Pop Disney Cruella De Vil #1663 Chase',
  character:'Cruella De Vil',
  manufacturer:'Funko',
  popNumber:'1663',
  funkoVariant:'Chase',
  funkoCategory:'Pop! Regular'
};
const regular={
  title:'Funko Pop Disney Cruella De Vil #1663',
  categoryPath:'Collectibles > Funko',
  localizedAspects:[{name:'Brand',value:'Funko'}],
  price:{value:'9.00',currency:'EUR'}
};
const exactChase={
  ...regular,
  title:'Funko Pop Disney Cruella De Vil #1663 Chase',
  price:{value:'15.00',currency:'EUR'}
};
assert.equal(exactMatch(chase,regular).ok,false);
assert.equal(exactMatch(chase,exactChase).ok,true);

const queries=buildQueries({
  type:'figure',title:'Marvel Legends Iron Man Mark LXXXV & Thanos',
  manufacturer:'Hasbro',line:'Marvel Legends',character:'Iron Man Mark LXXXV & Thanos',
  sku:'F0192',barcode:'5010993842353'
});
assert.equal(queries[0].kind,'gtin');
assert.equal(queries[0].value,'5010993842353');
assert.ok(queries.some(q=>q.kind==='q'&&q.value.includes('F0192')));

const market=aggregate([
  {title:'a',url:'',price:100,currency:'EUR',shipping:null,condition:'',score:120},
  {title:'b',url:'',price:110,currency:'EUR',shipping:null,condition:'',score:119},
  {title:'c',url:'',price:105,currency:'EUR',shipping:null,condition:'',score:118},
  {title:'d',url:'',price:1000,currency:'EUR',shipping:null,condition:'',score:117},
  {title:'e',url:'',price:95,currency:'EUR',shipping:null,condition:'',score:116}
]);
assert.equal(market.currency,'EUR');
assert.equal(market.count,4);
assert.equal(market.average,102.5);
assert.equal(market.min,95);
assert.equal(market.max,110);

console.log('ebay market tests ok');
