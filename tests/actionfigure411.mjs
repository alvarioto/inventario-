import assert from 'node:assert/strict';
import { chooseCatalog, parseMarvelRows, parseProductLinks, chooseBest, parseProductPage } from '../api/actionfigure411-value.mjs';

const marvelHtml = [
'<table><tr><td><a href="/marvel/marvel-legends-spider-man-brand-new-day-spider-man-13556.php"><img alt="Spider-Man"></a></td><td><strong>Spider-Man</strong><br/>Group: Spider Man: Brand New Day<br/>Year: 2026<br/>Avg Price: $40.37</td></tr></table>',
'<table><tr><td><a href="/marvel/marvel-legends-spider-man-brand-new-day-hulk-13557.php"><img alt="Hulk"></a></td><td><strong>Hulk</strong><br/>Group: Spider Man: Brand New Day<br/>Year: 2026<br/>Avg Price: $40.64</td></tr></table>',
'<table><tr><td><a href="/marvel/old-spider-man-100.php">Spider-Man</a></td><td><strong>Spider-Man</strong><br/>Group: Retro<br/>Year: 2020<br/>Avg Price: $75.00</td></tr></table>'
].join('\n');

const rows=parseMarvelRows(marvelHtml);
assert.equal(rows.length,3);
assert.equal(rows[0].title,'Spider-Man');
assert.equal(rows[0].group,'Spider Man: Brand New Day');
assert.equal(rows[0].year,2026);
assert.equal(rows[0].avg,40.37);
assert.match(rows[0].url,/13556\.php$/);

const links=parseProductLinks(marvelHtml);
assert.ok(links.some(x=>x.url.endsWith('13556.php')));

const choice=chooseBest({
  type:'figure', title:'Marvel Legends Spider-Man', character:'Spider-Man',
  franchise:'Marvel', manufacturer:'Hasbro', line:'Marvel Legends',
  wave:'Spider Man: Brand New Day', year:2026
},rows);
assert.equal(choice.ambiguous,false);
assert.equal(choice.row.group,'Spider Man: Brand New Day');
assert.equal(choice.row.avg,40.37);

assert.equal(chooseCatalog({type:'figure',franchise:'Marvel',manufacturer:'Hasbro',line:'Marvel Legends'}).id,'marvel-legends');
assert.equal(chooseCatalog({type:'figure',franchise:'DC',title:'Batman'}).id,'dc');
assert.equal(chooseCatalog({type:'funko',franchise:'Marvel',line:'Marvel Legends'}),null);

const productHtml=[
'<h1>Marvel Legends Spider Man: Brand New Day Spider-Man</h1>',
'Year: 2026 Retail: $27.99 UPC: 5010996404893 ASIN: B0G1TXWSG4',
'Set: Spider Man: Brand New Day Share:',
'The average price based upon the last <strong>23</strong> sold auctions is: <strong>$40.37</strong>',
'[High: $60.00/Low: $29.00].',
'The average Buy It Now price is <strong>$41.78</strong> based upon <strong>44</strong> filtered active auctions.'
].join('\n');
const product=parseProductPage(productHtml,'https://www.actionfigure411.com/marvel/test-13556.php');
assert.equal(product.soldCount,23);
assert.equal(product.soldAverage,40.37);
assert.equal(product.high,60);
assert.equal(product.low,29);
assert.equal(product.activeAverage,41.78);
assert.equal(product.activeCount,44);
assert.equal(product.upc,'5010996404893');
assert.equal(product.retail,27.99);

console.log('actionfigure411: ok');
