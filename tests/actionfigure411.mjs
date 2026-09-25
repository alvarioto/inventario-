import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {GENRES,inferGenres,buildSearchTerms,parseSearchResults,chooseBest,parseDetailPage,looksBlocked} from '../api/actionfigure411-value.mjs';

assert.equal(GENRES.length,14);
assert.equal(inferGenres({type:'figure',franchise:'Marvel',line:'Marvel Legends'})[0].g,2);
assert.equal(inferGenres({type:'figure',franchise:'Star Wars',line:'The Black Series'})[0].g,1);
assert.equal(inferGenres({type:'figure',franchise:'Transformers',character:'Optimus Prime'})[0].g,3);
assert.equal(inferGenres({type:'figure',franchise:'DC Comics',line:'DC Multiverse',manufacturer:'McFarlane Toys'})[0].g,8);

const terms=buildSearchTerms({type:'figure',character:'Spider-Man',title:'Hasbro Marvel Legends Ultimate Spider-Man',barcode:'630509402694'});
assert.equal(terms[0],'630509402694');
assert.ok(terms.includes('spider man'));

const marvel=GENRES.find(x=>x.g===2);
const searchHtml=`
<table>
<tr>
 <td><a href="/marvel/marvel-legends-hobgoblin-spider-man-200.php">Spider-Man</a></td>
 <td>Group: Spider Man</td><td>Wave: 2</td><td>Year: 2015</td><td>Retail: $19.99</td>
</tr>
<tr>
 <td><a href="/marvel/marvel-legends-space-venom-ultimate-spider-man-424.php">Ultimate Spider-Man</a></td>
 <td>Group: Spider Man</td><td>Wave: 4</td><td>Year: 2016</td><td>Retail: $19.99</td>
</tr>
<tr>
 <td><a href="/marvel/marvel-legends-retro-spider-man-999.php">Spider-Man (Retro)</a></td>
 <td>Group: Retro Collection</td><td>Wave: Fan</td><td>Year: 2021</td><td>Retail: $22.99</td>
</tr>
</table>`;
const rows=parseSearchResults(searchHtml,marvel);
assert.equal(rows.length,3);
const best=chooseBest({type:'figure',title:'Marvel Legends Ultimate Spider-Man',character:'Ultimate Spider-Man',franchise:'Marvel',line:'Marvel Legends',wave:'4',year:2016},rows);
assert.equal(best.ambiguous,false);
assert.match(best.row.url,/ultimate-spider-man-424\.php$/);
assert.equal(best.row.year,2016);
assert.equal(best.row.wave,'4');

const usd=parseDetailPage(`
<html><head><title>Ultimate Spider-Man | ActionFigure411</title></head><body>
<h1>Ultimate Spider-Man</h1>
<div>Group: Spider Man</div><div>Wave: 4</div><div>Year: 2016</div>
<div>Retail: $19.99</div><div>UPC: 630509402694</div>
<h3>Where to Buy:</h3>
<p>The average price based upon the last <b>2</b> sold auctions is: <b>$110.50</b></p>
<p>[High: $150.00/Low: $70.99]. The average Buy It Now price is <b>$99.20</b> based upon <b>22</b> filtered active auctions out of <b>58</b>.</p>
</body></html>`,'https://www.actionfigure411.com/marvel/example.php');
assert.equal(usd.title,'Ultimate Spider-Man');
assert.equal(usd.soldCount,2);
assert.equal(usd.soldAverage,110.50);
assert.equal(usd.soldHigh,150);
assert.equal(usd.soldLow,70.99);
assert.equal(usd.buyItNowAverage,99.20);
assert.equal(usd.activeFilteredCount,22);
assert.equal(usd.activeTotalCount,58);
assert.equal(usd.currency,'USD');
assert.equal(usd.year,2016);
assert.equal(usd.retail,19.99);
assert.equal(usd.upc,'630509402694');

const eur=parseDetailPage(`
<h1>Test Figure</h1>
<p>Where to Buy:</p>
<p>The average price based upon the last <strong>2</strong> sold auctions is: <strong>€8.04</strong></p>
<p>[High: €10.82/Low: €5.26]. The average Buy It Now price is <strong>€9.20</strong> based upon <strong>22</strong> filtered active auctions out of <strong>58</strong>.</p>
`,'https://www.actionfigure411.com/test.php');
assert.equal(eur.soldCount,2);
assert.equal(eur.soldAverage,8.04);
assert.equal(eur.soldHigh,10.82);
assert.equal(eur.soldLow,5.26);
assert.equal(eur.buyItNowAverage,9.20);
assert.equal(eur.activeFilteredCount,22);
assert.equal(eur.activeTotalCount,58);
assert.equal(eur.currency,'EUR');

const noSold=parseDetailPage('<h1>No Sales</h1><p>The average Buy It Now price is $18.00 based upon 3 filtered active auctions out of 8.</p>');
assert.equal(noSold.soldAverage,null);
assert.equal(noSold.soldCount,0);
assert.equal(noSold.buyItNowAverage,18);

assert.equal(looksBlocked('<h1>Verify you are human</h1>'),true);
assert.equal(looksBlocked('<h1>Marvel Action Figure Guides</h1>'),false);

const source=readFileSync(new URL('../api/actionfigure411-value.mjs',import.meta.url),'utf8');
assert.match(source,/waitForSelector\('#queryInput'/);
assert.match(source,/keyboard\.press\('Enter'\)/);
assert.match(source,/puppeteer-core/);
assert.match(source,/@sparticuz\/chromium-min/);
assert.doesNotMatch(source,/fetchPublic\(/);
assert.doesNotMatch(source,/ACTIONFIGURE411\+'\/common\/search-results\.php\?g='/);

console.log('actionfigure411 tests ok');
