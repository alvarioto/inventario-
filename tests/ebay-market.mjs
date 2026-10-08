import assert from 'node:assert/strict';
import ebayHandler, { exactMatch, aggregate, buildQueries, validGtin, funkoIdentityFromAccepted } from '../api/ebay-market-value.mjs';

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

// Un GTIN exacto debe seguir validando el producto aunque el vendedor abrevie el título.
const batmanShortTitle={
  title:'NECA Batman 18" Michael Keaton New Factory Sealed',
  brand:'NECA',
  _matchedGtin:'634482612415',
  categoryPath:'Toys & Hobbies > Action Figures',
  price:{value:'249.99',currency:'EUR'},
  localizedAspects:[{name:'Brand',value:'NECA'}]
};
assert.equal(exactMatch(batman,batmanShortTitle).ok,true);

const batmanWrongGame={
  title:'Batman Rise Of Sin Tzu Action Figure Commemorative Edition Xbox',
  gtin:['999999999999'],
  categoryPath:'Video Games & Consoles > Video Games',
  price:{value:'177.93',currency:'EUR'},
  localizedAspects:[{name:'Platform',value:'Microsoft Xbox'}]
};
assert.equal(exactMatch(batman,batmanWrongGame).ok,false);

const appBatman={
  type:'figure',
  title:'NECA Batman (1989) Batman (1989) 1/4 Scale Action Figure 966W071213',
  character:'Batman (1989)',
  manufacturer:'NECA',
  line:'Batman (1989) 1/4 Scale Action Figure',
  sku:'966W071213'
};
const appBatmanExact={
  title:'NECA Batman 1989 Michael Keaton 1/4 Scale Action Figure',
  brand:'NECA',
  categoryPath:'Toys & Hobbies > Action Figures',
  localizedAspects:[{name:'Brand',value:'NECA'},{name:'Character',value:'Batman'}],
  price:{value:'199.99',currency:'EUR'}
};
assert.equal(exactMatch(appBatman,appBatmanExact).ok,true);
const appQueries=buildQueries(appBatman);
assert.ok(appQueries.some(q=>q.kind==='q'&&q.value==='966W071213'));
assert.ok(appQueries.some(q=>q.kind==='q'&&/NECA/i.test(q.value)&&/Batman/i.test(q.value)&&/1\/4/.test(q.value)&&!q.value.includes('966W071213')));

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

// Los GTIN inválidos se descartan y el SKU pasa a ser la identidad fuerte.
assert.equal(validGtin('889698903189'),'889698903189');
assert.equal(validGtin('889698710010'),'');
assert.equal(validGtin('889698710015'),'889698710015');

const ianMalcolm={
  type:'funko',
  title:'Funko Blockbuster Rewind Jurassic Park Ian Malcolm Chase',
  character:'Ian Malcolm',
  manufacturer:'Funko',
  funkoCategory:'REWIND',
  funkoVariant:'Chase',
  popNumber:'1982',
  sku:'71001',
  barcode:'889698710010'
};
const ianQueries=buildQueries(ianMalcolm);
assert.equal(ianQueries.some(q=>q.kind==='gtin'),false);
assert.ok(ianQueries[0].kind==='q'&&ianQueries[0].value.includes('71001'));
const ianExact={
  title:'Funko REWIND Jurassic Park Ian Malcolm Flare Variant CHASE',
  brand:'Funko',
  mpn:'71001',
  gtin:['889698710015'],
  categoryPath:'Collectibles > Funko',
  price:{value:'25.99',currency:'USD'},
  itemId:'ian-chase',
  localizedAspects:[
    {name:'Brand',value:'Funko'},
    {name:'MPN',value:'71001'},
    {name:'Product Line',value:'REWIND'},
    {name:'UPC',value:'889698710015'}
  ]
};
const ianMatch=exactMatch(ianMalcolm,ianExact);
assert.equal(ianMatch.ok,true);
const ianResolved=funkoIdentityFromAccepted(ianMalcolm,[{row:ianExact,match:ianMatch}]);
assert.equal(ianResolved.funkoCategory,'REWIND');
assert.equal(ianResolved.barcode,'889698710015');

const chestburster={
  type:'funko',
  title:'Pop! Movies Alien Chestburster',
  character:'Chestburster',
  manufacturer:'Funko',
  funkoCategory:'Pop! Regular',
  funkoVariant:'',
  popNumber:'1982',
  sku:'90318',
  barcode:'889698903189'
};
const chestbursterExact={
  title:'Funko Pop! Premium Alien Chestburster Light Up #1988',
  brand:'Funko',
  mpn:'90318',
  gtin:['889698903189'],
  categoryPath:'Collectibles > Funko',
  price:{value:'29.99',currency:'USD'},
  itemId:'chestburster-1988',
  localizedAspects:[
    {name:'Brand',value:'Funko'},
    {name:'MPN',value:'90318'},
    {name:'Product Line',value:'Pop! Premium'},
    {name:'UPC',value:'889698903189'},
    {name:'Box Number',value:'1988'}
  ]
};
const chestMatch=exactMatch(chestburster,chestbursterExact);
assert.equal(chestMatch.ok,true);
const chestResolved=funkoIdentityFromAccepted(chestburster,[{row:chestbursterExact,match:chestMatch}]);
assert.equal(chestResolved.popNumber,'1988');
assert.equal(chestResolved.funkoCategory,'Pop! Premium');
assert.equal(chestResolved.barcode,'889698903189');

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


// El endpoint debe aceptar la web Firebase por CORS y resolver OPTIONS sin tocar eBay.
{
  const headers={};
  let ended=false;
  const req={method:'OPTIONS',headers:{origin:'https://frikivault-alvarioto-2026.web.app'}};
  const res={
    statusCode:0,
    setHeader:(k,v)=>{headers[k]=v;},
    end:()=>{ended=true;}
  };
  await ebayHandler(req,res);
  assert.equal(res.statusCode,204);
  assert.equal(headers['Access-Control-Allow-Origin'],'https://frikivault-alvarioto-2026.web.app');
  assert.equal(headers['Access-Control-Allow-Methods'],'POST, OPTIONS');
  assert.equal(ended,true);
}

console.log('ebay market tests ok');
