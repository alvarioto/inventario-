import { inflateRawSync } from 'node:zlib';

const GUIDE_URL='https://legendsverse.com/storage/legendsverse-price-guide.xlsx';
const PRICE_GUIDE_URL='https://legendsverse.com/price-guide';
const CACHE_TTL_MS=6*60*60*1000;
const cache=globalThis.__frikivaultLegendsVerseCache||(globalThis.__frikivaultLegendsVerseCache={at:0,rows:[],updated:''});

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}
function decodeXml(value){
  return String(value||'')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function textFromXml(fragment){
  return [...String(fragment||'').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(m=>decodeXml(m[1])).join('');
}
function normalize(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
function columnIndex(cellRef){
  const letters=String(cellRef||'').match(/^[A-Z]+/i)?.[0]?.toUpperCase()||'A';
  let n=0;
  for(const ch of letters)n=n*26+(ch.charCodeAt(0)-64);
  return Math.max(0,n-1);
}
function findEocd(buffer){
  const min=Math.max(0,buffer.length-0xffff-22);
  for(let i=buffer.length-22;i>=min;i--)if(buffer.readUInt32LE(i)===0x06054b50)return i;
  throw new Error('El XLSX de LegendsVerse no tiene un ZIP válido.');
}
function zipEntries(buffer){
  const eocd=findEocd(buffer);
  const total=buffer.readUInt16LE(eocd+10);
  let offset=buffer.readUInt32LE(eocd+16);
  const out=new Map();
  for(let i=0;i<total;i++){
    if(buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('Directorio XLSX no válido.');
    const method=buffer.readUInt16LE(offset+10);
    const compSize=buffer.readUInt32LE(offset+20);
    const nameLen=buffer.readUInt16LE(offset+28);
    const extraLen=buffer.readUInt16LE(offset+30);
    const commentLen=buffer.readUInt16LE(offset+32);
    const localOffset=buffer.readUInt32LE(offset+42);
    const name=buffer.subarray(offset+46,offset+46+nameLen).toString('utf8');
    out.set(name,{method,compSize,localOffset});
    offset+=46+nameLen+extraLen+commentLen;
  }
  return out;
}
function unzipText(buffer,entries,name){
  const entry=entries.get(name);
  if(!entry)return '';
  const p=entry.localOffset;
  if(buffer.readUInt32LE(p)!==0x04034b50)throw new Error('Entrada XLSX no válida.');
  const nameLen=buffer.readUInt16LE(p+26);
  const extraLen=buffer.readUInt16LE(p+28);
  const start=p+30+nameLen+extraLen;
  const compressed=buffer.subarray(start,start+entry.compSize);
  const data=entry.method===0?compressed:entry.method===8?inflateRawSync(compressed):null;
  if(!data)throw new Error('Compresión XLSX no compatible.');
  return data.toString('utf8');
}
function parseSharedStrings(xml){
  if(!xml)return[];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(m=>textFromXml(m[1]));
}
function parseWorksheetXml(xml,sharedStrings=[]){
  const rows=[];
  for(const rm of String(xml||'').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)){
    const row=[];
    for(const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/c>)/gi)){
      const attrs=cm[1]||'', body=cm[2]||'';
      const ref=attrs.match(/\br=["']([^"']+)["']/i)?.[1]||'A1';
      const type=attrs.match(/\bt=["']([^"']+)["']/i)?.[1]||'n';
      let value=null;
      if(type==='inlineStr')value=textFromXml(body);
      else{
        const raw=decodeXml(body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1]||'');
        if(type==='s')value=sharedStrings[Number(raw)]??'';
        else if(type==='str')value=raw;
        else if(raw!==''){
          const n=Number(raw);
          value=Number.isFinite(n)?n:raw;
        }
      }
      row[columnIndex(ref)]=value;
    }
    rows.push(row);
  }
  return rows;
}
function findGuideTable(worksheets,sharedStrings){
  for(const xml of worksheets){
    const rows=parseWorksheetXml(xml,sharedStrings);
    const headerIndex=rows.findIndex(row=>{
      const cells=row.map(normalize);
      return cells.includes('figure')&&cells.includes('market value')&&cells.includes('release year');
    });
    if(headerIndex<0)continue;
    const header=Array.from({length:rows[headerIndex].length},(_,i)=>String(rows[headerIndex][i]??'').trim());
    const indexes=Object.fromEntries(Array.from({length:header.length},(_,i)=>[normalize(header[i]),i]));
    const data=[];
    for(const row of rows.slice(headerIndex+1)){
      const figure=String(row[indexes['figure']]??'').trim();
      if(!figure)continue;
      const market=Number(row[indexes['market value']]??0);
      const retail=Number(row[indexes['retail price']]??0);
      const yearRaw=row[indexes['release year']];
      const year=Number(yearRaw)||null;
      data.push({
        figure,
        wave:String(row[indexes['wave']]??'').trim(),
        exclusive:String(row[indexes['exclusive']]??'').trim(),
        year,
        retail:Number.isFinite(retail)&&retail>0?retail:null,
        market:Number.isFinite(market)&&market>0?market:0
      });
    }
    const updated=rows.slice(0,headerIndex).flat().map(v=>String(v??'')).find(v=>/market value updated on/i.test(v))||'';
    return{rows:data,updated};
  }
  throw new Error('No se encontró la tabla de precios de LegendsVerse.');
}
const STOP=new Set(['marvel','legends','hasbro','action','figure','figures','collectible','toy','toys','series','the','and','with','of','a','an']);
function tokens(value){return normalize(value).split(' ').filter(x=>x.length>1&&!STOP.has(x));}
function overlap(a,b){
  const aa=[...new Set(tokens(a))],bb=new Set(tokens(b));
  if(!aa.length)return 0;
  return aa.filter(x=>bb.has(x)).length/aa.length;
}
function isMarvelLegends(item={}){
  if(normalize(item.type)!=='figure')return false;
  const line=normalize(item.line),title=normalize(item.title),manufacturer=normalize(item.manufacturer),franchise=normalize(item.franchise);
  return line.includes('marvel legends')||title.includes('marvel legends')||(manufacturer.includes('hasbro')&&franchise.includes('marvel'));
}
function scoreRow(item,row){
  const names=[item.character,item.title].filter(Boolean);
  const rowName=normalize(row.figure);
  let nameScore=0;
  for(const name of names){
    const n=normalize(String(name).replace(/marvel legends/ig,' '));
    if(!n)continue;
    if(n===rowName)nameScore=Math.max(nameScore,300);
    else if(rowName.includes(n)||n.includes(rowName))nameScore=Math.max(nameScore,225);
    nameScore=Math.max(nameScore,overlap(n,row.figure)*180);
  }
  if(nameScore<80)return -1;
  let score=nameScore;
  const meta=[item.wave,item.edition,item.exclusive].filter(Boolean).join(' ');
  const rowMeta=[row.figure,row.wave,row.exclusive].filter(Boolean).join(' ');
  if(meta)score+=overlap(meta,rowMeta)*130;
  if(item.wave&&row.wave&&normalize(item.wave)===normalize(row.wave))score+=80;
  if(item.exclusive&&row.exclusive&&normalize(item.exclusive)===normalize(row.exclusive))score+=60;
  const year=Number(item.year)||null;
  if(year&&row.year){
    if(year===row.year)score+=120;
    else score-=Math.min(180,Math.abs(year-row.year)*45);
  }
  return score;
}
function chooseBestRow(item,rows){
  const ranked=rows.map(row=>({row,score:scoreRow(item,row)})).filter(x=>x.score>=90).sort((a,b)=>b.score-a.score);
  if(!ranked.length)return null;
  if(ranked[1]&&ranked[0].score-ranked[1].score<20){
    const a=normalize([ranked[0].row.figure,ranked[0].row.wave,ranked[0].row.exclusive,ranked[0].row.year].join(' '));
    const b=normalize([ranked[1].row.figure,ranked[1].row.wave,ranked[1].row.exclusive,ranked[1].row.year].join(' '));
    if(a!==b)return{ambiguous:true,candidates:ranked.slice(0,5)};
  }
  return{ambiguous:false,...ranked[0]};
}
async function loadGuide(){
  if(cache.rows.length&&Date.now()-cache.at<CACHE_TTL_MS)return{rows:cache.rows,updated:cache.updated};
  const response=await fetch(GUIDE_URL,{headers:{'Accept':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','User-Agent':'FrikiVault/1.0 personal collection lookup'},redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(25000)});
  if(response.status===403||response.status===429)throw new Error('LegendsVerse ha limitado temporalmente la descarga pública.');
  if(!response.ok)throw new Error('LegendsVerse HTTP '+response.status);
  const buffer=Buffer.from(await response.arrayBuffer());
  if(buffer.length>25*1024*1024)throw new Error('La guía de LegendsVerse supera el tamaño permitido.');
  const entries=zipEntries(buffer);
  const shared=parseSharedStrings(unzipText(buffer,entries,'xl/sharedStrings.xml'));
  const worksheetNames=[...entries.keys()].filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort();
  const worksheets=worksheetNames.map(name=>unzipText(buffer,entries,name));
  const guide=findGuideTable(worksheets,shared);
  cache.at=Date.now();cache.rows=guide.rows;cache.updated=guide.updated;
  return guide;
}
async function resolveLegendsVerse(item){
  if(!isMarvelLegends(item))throw new Error('LegendsVerse se reserva para Marvel Legends.');
  const guide=await loadGuide();
  const chosen=chooseBestRow(item,guide.rows);
  if(!chosen)throw new Error('No se encontró una coincidencia suficientemente precisa en LegendsVerse.');
  if(chosen.ambiguous)throw new Error('LegendsVerse tiene varias figuras demasiado parecidas; no se usará un precio ambiguo.');
  const row=chosen.row;
  if(!(row.market>0))throw new Error('La figura existe en LegendsVerse, pero su Market Value todavía es 0.');
  return{status:'completed',value:{
    source:'LegendsVerse',
    amount:row.market,
    currency:'USD',
    url:PRICE_GUIDE_URL,
    title:row.figure,
    wave:row.wave,
    exclusive:row.exclusive,
    year:row.year,
    retail:row.retail,
    updated:guide.updated,
    evidence:[
      row.wave?'wave '+row.wave:'',
      row.exclusive?'exclusiva '+row.exclusive:'',
      row.year?'año '+row.year:'',
      guide.updated
    ].filter(Boolean).join(' · '),
    methodology:'Market Value publicado por LegendsVerse a partir de ventas completadas de eBay; la guía pública se actualiza periódicamente.'
  }};
}
function configuredOrigins(){
  const values=String(process.env.APP_ORIGIN||'').split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);
  return new Set(['https://frikivault-alvarioto-2026.web.app','https://frikivault-alvarioto-2026.firebaseapp.com',...values]);
}
function applyCors(req,res){
  const origin=String(req.headers.origin||'').replace(/\/$/,'');
  if(!origin)return true;
  if(!configuredOrigins().has(origin))return false;
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age','86400');
  return true;
}

export { decodeXml, parseSharedStrings, parseWorksheetXml, findGuideTable, isMarvelLegends, scoreRow, chooseBestRow, resolveLegendsVerse };

export default async function handler(req,res){
  if(!applyCors(req,res))return json(res,403,{error:'Origen no autorizado.'});
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});
    const item=body.item||{};
    if(!item.title&&!item.character)return json(res,400,{error:'Faltan datos de la figura.'});
    return json(res,200,await resolveLegendsVerse(item));
  }catch(error){
    return json(res,502,{error:String(error?.message||'No se pudo consultar LegendsVerse.')});
  }
}
