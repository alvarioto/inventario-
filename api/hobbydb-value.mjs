const HOBBYDB = 'https://www.hobbydb.com';

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function decodeHtml(value){return String(value||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/\s+/g,' ').trim();}
async function hobbydbFetch(path,cookie,accept='text/html'){const response=await fetch(path.startsWith('http')?path:HOBBYDB+path,{method:'GET',headers:{Accept:accept,Cookie:cookie,'User-Agent':'Mozilla/5.0 FrikiVault/1.0',Referer:HOBBYDB+'/marketplaces/hobbydb'},redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(15000)});if(response.status===401||response.status===403){const error=new Error('La sesión de hobbyDB ha caducado.');error.code='SESSION_EXPIRED';throw error;}if(!response.ok)throw new Error(`hobbyDB HTTP ${response.status}`);return response;}
function extractCandidates(html){const result=[],seen=new Set();const rx=/<a\b[^>]*href=["']([^"']*\/marketplaces\/hobbydb\/catalog_items\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let match;while((match=rx.exec(html))){const rawHref=match[1];if(/\/select_type(?:\?|$)/i.test(rawHref))continue;const url=new URL(rawHref,HOBBYDB).href;if(seen.has(url))continue;seen.add(url);const title=decodeHtml(match[2]);if(title)result.push({url,title});}return result;}
function extractTitle(html){const match=String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);return decodeHtml(match?.[1]||'');}
function extractCatalogItemId(html){for(const pattern of [/flag_formCatalogItem(\d{3,})/i,/CatalogItem(\d{3,})/,/catalog-item-id=["'](\d{3,})["']/i,/catalog_item_id=(\d{3,})/i,/"catalogItemId"\s*:\s*"?(\d{3,})/i]){const match=String(html).match(pattern);if(match)return match[1];}return null;}
function extractField(text,label){const safe=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const match=String(text).match(new RegExp(`${safe}\\s*:\\s*(.{1,180}?)(?=\\s(?:Brand|Series|Released|Production Status|Packaging Details|Characteristics|Dimensions|Reference Numbers|Reference #|UPC|HDBID|Metadata)\\s*:|$)`,'i'));return String(match?.[1]||'').trim();}
function requestedVariant(item){const raw=normalize(item.funkoVariant||'');if(!raw||['classic','standard','regular','normal'].includes(raw))return 'classic';if(raw.includes('chase'))return 'chase';if(raw.includes('flocked'))return 'flocked';if(raw.includes('glow')||raw.includes('gitd'))return 'glow';if(raw.includes('metallic'))return 'metallic';if(raw.includes('diamond'))return 'diamond';if(raw.includes('black light'))return 'black light';if(raw.includes('chrome'))return 'chrome';return raw;}
function pageVariant(text,title=''){const hay=normalize(`${title} ${extractField(text,'Production Status')}`);if(/\bchase\b/.test(hay))return 'chase';if(/\bflocked\b/.test(hay))return 'flocked';if(/\bglow in the dark\b|\bgitd\b/.test(hay))return 'glow';if(/\bmetallic\b/.test(hay))return 'metallic';if(/\bdiamond\b/.test(hay))return 'diamond';if(/\bblack light\b/.test(hay))return 'black light';if(/\bchrome\b/.test(hay))return 'chrome';return 'classic';}
function exactMatch(item,html,candidateTitle=''){const text=decodeHtml(html);const title=extractTitle(html)||candidateTitle;const brand=extractField(text,'Brand');const series=extractField(text,'Series');const ref=extractField(text,'Reference #');const character=normalize(item.character);if(brand&&!/\bfunko\b/i.test(brand))return {ok:false,reason:'brand'};if(series&&!/\bpop!?\b/i.test(series))return {ok:false,reason:'series'};if(character&&!normalize(`${title} ${text.slice(0,900)}`).includes(character))return {ok:false,reason:'name'};if(item.popNumber&&ref&&String(ref).match(/\d{1,5}/)?.[0]!==String(item.popNumber))return {ok:false,reason:'number'};const wanted=requestedVariant(item),actual=pageVariant(text,title);if(wanted==='classic'&&actual!=='classic')return {ok:false,reason:`variant:${actual}`};if(wanted!=='classic'&&wanted!==actual)return {ok:false,reason:`variant:${actual}`};return {ok:true,variant:actual,title,text};}
function candidateScore(item,candidate,detailHtml){const checked=exactMatch(item,detailHtml,candidate.title);if(!checked.ok)return -999;const title=normalize(checked.title||candidate.title);const body=normalize(checked.text);const character=normalize(item.character);const pop=String(item.popNumber||'').trim();let score=0;if(character&&title.includes(character))score+=45;if(pop&&new RegExp(`(^|[^0-9])${pop}([^0-9]|$)`).test(body))score+=45;if(/\bfunko\b/.test(body))score+=10;return score;}
async function inspectCandidate(item,url,cookie,candidateTitle=''){const response=await hobbydbFetch(url,cookie);const html=await response.text();const id=extractCatalogItemId(html);if(!id)return null;const match=exactMatch(item,html,candidateTitle);if(!match.ok)return null;return {id,url,title:match.title||candidateTitle,score:candidateScore(item,{url,title:candidateTitle},html),variant:match.variant};}
async function searchCandidates(query,cookie){const path=`/marketplaces/hobbydb/catalog_items?filters[q][0]=${encodeURIComponent(query)}`;const response=await hobbydbFetch(path,cookie);const html=await response.text();return extractCandidates(html);}
async function resolveItem(item,cookie){
 if(item.hobbydbUrl){const url=new URL(item.hobbydbUrl);if(!['hobbydb.com','www.hobbydb.com'].includes(url.hostname))throw new Error('URL de hobbyDB no válida.');try{const direct=await inspectCandidate(item,url.href,cookie);if(direct)return direct;}catch{}}
 const wanted=requestedVariant(item);
 const queries=[
  [item.character,item.popNumber,wanted==='classic'?'':item.funkoVariant].filter(Boolean).join(' '),
  [item.character,item.popNumber].filter(Boolean).join(' '),
  [item.character,wanted==='classic'?'':item.funkoVariant].filter(Boolean).join(' '),
  String(item.character||'').trim(),
  String(item.popNumber||'').trim()
 ].map(x=>x.trim()).filter(Boolean);
 const uniqueQueries=[...new Set(queries)];
 const candidateMap=new Map();
 for(const query of uniqueQueries){
  try{
   const found=await searchCandidates(query,cookie);
   for(const candidate of found){if(!candidateMap.has(candidate.url))candidateMap.set(candidate.url,candidate);if(candidateMap.size>=24)break;}
  }catch{}
  if(candidateMap.size>=24)break;
 }
 const candidates=[...candidateMap.values()].slice(0,24);
 if(!candidates.length)throw new Error('No se encontró una ficha candidata en hobbyDB.');
 const checked=[];
 for(const candidate of candidates){try{const row=await inspectCandidate(item,candidate.url,cookie,candidate.title);if(row)checked.push(row);}catch{}}
 checked.sort((a,b)=>b.score-a.score);
 const best=checked[0];
 if(!best||best.score<45)throw new Error('No se encontró una ficha de hobbyDB que coincida exactamente con número y variante.');
 return best;
}
async function readPriceGuide(catalogItemId,cookie){const response=await hobbydbFetch(`/api/price_guide?catalog_item_id=${encodeURIComponent(catalogItemId)}`,cookie,'application/json');const payload=await response.json();const attributes=payload?.data?.[0]?.attributes;const amount=Number(attributes?.estimated_value);if(!Number.isFinite(amount)||amount<=0)return null;return {amount,currency:'USD',timestamp:attributes?.timestamp||null,calculatedFor:attributes?.calculated_for||null};}
export default async function handler(req,res){const origin=String(req.headers.origin||'');const allowedOrigin=String(process.env.APP_ORIGIN||'').replace(/\/$/,'');if(origin&&allowedOrigin&&origin!==allowedOrigin)return json(res,403,{error:'Origen no autorizado.'});if(origin&&allowedOrigin)res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});
 try{const cookie=String(process.env.HOBBYDB_COOKIE||'').trim();if(!cookie)return json(res,503,{error:'La sesión de hobbyDB no está configurada.'});const body=typeof req.body==='string'?JSON.parse(req.body):(req.body||{});const item=body.item||{};if(!item.character||!/^\d{1,5}$/.test(String(item.popNumber||'')))return json(res,400,{error:'Faltan personaje o número Pop.'});const match=await resolveItem(item,cookie);const guide=await readPriceGuide(match.id,cookie);if(!guide)return json(res,404,{error:'Sin valor publicado en hobbyDB.'});return json(res,200,{status:'completed',value:{amount:guide.amount,currency:'USD',url:match.url,evidence:`Estimated Value $${guide.amount}`,variant:match.variant==='classic'?'Classic':match.variant,title:match.title,catalogItemId:match.id,timestamp:guide.timestamp,calculatedFor:guide.calculatedFor}});}catch(error){const message=String(error?.message||'No se pudo leer hobbyDB.');const status=error?.code==='SESSION_EXPIRED'?401:502;return json(res,status,{error:message});}}
