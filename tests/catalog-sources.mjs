import assert from 'node:assert/strict';
import { buildCanonicalIdentity, normalizeScale, routeCatalogSources } from '../api/catalog-plan.mjs';

assert.equal(normalizeScale('1/4'), '1:4');
assert.equal(normalizeScale('1:4'), '1:4');
assert.equal(normalizeScale('18 inches'), '18in');

const batman = buildCanonicalIdentity({
  type: 'figure',
  title: 'Batman',
  character: 'Batman',
  manufacturer: 'NECA',
  line: 'Quarter Scale',
  franchise: 'DC',
  scale: '1/4',
  year: 2019,
  sku: 'NECA-BATMAN-QS'
});
assert.equal(batman.scale, '1:4');
assert.equal(batman.manufacturer, 'NECA');
assert.match(batman.query, /NECA/);
assert.match(batman.query, /Batman/);
assert.match(batman.query, /1:4/);

const plan = routeCatalogSources({
  type: 'figure',
  title: 'Batman',
  character: 'Batman',
  manufacturer: 'NECA',
  scale: '1/4',
  edition: '1989',
  hasBox: true
});

const ids = plan.catalog.map(x => x.id);
assert.deepEqual(ids.slice(0, 3), ['figure-realm','figure-stash','coleka']);
assert.ok(ids.includes('legendsverse'));
assert.ok(ids.includes('icollect'));
assert.ok(ids.includes('actionfigure411'));
assert.equal(plan.marketReference.id, 'ebay');
assert.equal(plan.marketReference.mode, 'informational-only');
assert.equal(plan.pricePolicy.priceChartingUntouched, true);
assert.equal(plan.pricePolicy.ebayInformationalOnly, true);
assert.equal(plan.pricePolicy.noInventedPrice, true);

const broad = routeCatalogSources({ type: 'replica', title: 'Batmobile replica', manufacturer: 'Hot Wheels' });
assert.ok(broad.catalog.some(x => x.id === 'coleka'));
assert.equal(broad.catalog.some(x => x.id === 'figure-realm'), false);

console.log('catalog-sources: ok');
