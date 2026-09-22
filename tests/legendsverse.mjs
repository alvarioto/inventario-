import assert from 'node:assert/strict';
import { parseSharedStrings, parseWorksheetXml, findGuideTable, isMarvelLegends, chooseBestRow } from '../api/legendsverse-value.mjs';

const sharedXml='<sst><si><t>Figure</t></si><si><t>Wave</t></si><si><t>Exclusive</t></si><si><t>Release year</t></si><si><t>Retail price</t></si><si><t>Market value</t></si><si><t>Black Bolt &amp; Triton</t></si><si><t>Spider-Man (Spider-Man: Brand New Day)</t></si></sst>';
const shared=parseSharedStrings(sharedXml);
assert.equal(shared[6],'Black Bolt & Triton');

const sheet=[
'<worksheet><sheetData>',
'<row r="10"><c r="A10" t="s"><v>0</v></c><c r="B10" t="s"><v>1</v></c><c r="C10" t="s"><v>2</v></c><c r="D10" t="s"><v>3</v></c><c r="F10" t="s"><v>4</v></c><c r="G10" t="s"><v>5</v></c></row>',
'<row r="11"><c r="A11" t="s"><v>6</v></c><c r="D11"><v>2026</v></c><c r="F11"><v>57.99</v></c><c r="G11"><v>73.89</v></c></row>',
'<row r="12"><c r="A12" t="s"><v>7</v></c><c r="D12"><v>2026</v></c><c r="G12"><v>0</v></c></row>',
'</sheetData></worksheet>'
].join('');
const parsed=parseWorksheetXml(sheet,shared);
const guide=findGuideTable([sheet],shared);
assert.equal(parsed.length,3);
assert.equal(guide.rows.length,2);
assert.equal(guide.rows[0].figure,'Black Bolt & Triton');
assert.equal(guide.rows[0].market,73.89);
assert.equal(guide.rows[1].market,0);

assert.equal(isMarvelLegends({type:'figure',line:'Marvel Legends',manufacturer:'Hasbro',franchise:'Marvel'}),true);
assert.equal(isMarvelLegends({type:'figure',line:'DC Multiverse',manufacturer:'McFarlane',franchise:'DC'}),false);

const blackBolt=chooseBestRow({type:'figure',title:'Marvel Legends Black Bolt & Triton',character:'Black Bolt & Triton',line:'Marvel Legends',year:2026},guide.rows);
assert.equal(blackBolt.ambiguous,false);
assert.equal(blackBolt.row.market,73.89);

const spider=chooseBestRow({type:'figure',title:'Marvel Legends Spider-Man',character:'Spider-Man',line:'Marvel Legends',wave:'Spider-Man: Brand New Day',year:2026},guide.rows);
assert.equal(spider.ambiguous,false);
assert.equal(spider.row.market,0);

console.log('legendsverse: ok');
