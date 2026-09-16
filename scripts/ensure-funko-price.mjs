import fs from 'node:fs';

const corePath='src/lib/ai-core.mjs';
let core=fs.readFileSync(corePath,'utf8');

const startNeedle=' if(usdEurRate==null&&webSources.some(';
const endNeedle=' const sources=limitPricingSources(uniqueSources(webSources),item);';
const start=core.indexOf(startNeedle);
const end=start<0?-1:core.indexOf(endNeedle,start);
if(start<0||end<0)throw new Error('research pricing block not found');
const endPos=end+endNeedle.length;
const newBlock=[
 " let usedFallbackRate=false;",
 " if(usdEurRate==null&&webSources.some(source=>/\\$|\\bUSD\\b/i.test(`${source.title} ${source.snippet}`))){",
 "  usdEurRate=await fetchUsdEurRate(fetcher);",
 "  if(usdEurRate==null){",
 "   usdEurRate=.87;",
 "   usedFallbackRate=true;",
 "   warnings.push('No se pudo obtener el cambio USD/EUR en directo; se usa una conversión orientativa para conservar el precio público encontrado.');",
 "  }",
 " }",
 " let listings=[...parsePublicListings(webSources.filter(source=>source.kind!=='pricecharting-api'),{USD_EUR:usdEurRate}),...priceChartingListings];",
 " let comparables=conservativeFallbackComparables(item,listings,webSources).slice(0,6);",
 " let asking=summarizeListings(comparables);",
 " let usedOrientativeEstimate=false;",
 "",
 " // Un Funko nunca se queda sin valor visible. Primero usamos las cotizaciones públicas;",
 " // si no son legibles, pedimos una estimación conservadora y, como último recurso,",
 " // mostramos un valor base claramente marcado como orientativo.",
 " if(isFunko&&!asking.count){",
 "  let estimate=null;",
 "  if(config.key){",
 "   try{",
 "    const ai=await deepseek([",
 "     {role:'system',content:'Estima de forma conservadora el valor actual en euros de un Funko concreto para inventario personal. Devuelve SOLO JSON con median, min, max y reason. No inventes ventas ni fuentes. median debe ser un número EUR razonable. Considera número Pop, variante y si tiene caja o está sellado.'},",
 "     {role:'user',content:`Artículo: ${identity}. Variante: ${item.funkoVariant||'normal'}. Caja: ${item.hasBox===false?'no':item.hasBox===true?'sí':'desconocido'}. Sellado: ${item.sealed?'sí':'no/desconocido'}.`}",
 "    ],{...config,maxTokens:300,timeoutMs:18000,retries:0});",
 "    const candidate=Number(ai?.median);",
 "    if(Number.isFinite(candidate)&&candidate>=3&&candidate<=5000)estimate=Number(candidate.toFixed(2));",
 "   }catch{}",
 "  }",
 "  if(estimate==null){",
 "   let base=item.sealed?18:item.hasBox===false?10:15;",
 "   const variant=normalizeComparableText(item.funkoVariant||'');",
 "   if(variant.includes('chase'))base*=1.6;",
 "   else if(variant)base*=1.25;",
 "   estimate=Number(base.toFixed(2));",
 "  }",
 "  const estimateUrl='https://www.pricecharting.com/search-products?type=prices&q='+encodeURIComponent(identity);",
 "  const estimateRow={",
 "   id:'funko-orientative-estimate',title:`Estimación orientativa · ${identity}`,url:estimateUrl,",
 "   price:estimate,currency:'EUR',shipping:null,condition:'Estimación orientativa · sin cotización pública legible',",
 "   sourceType:'market',originalPrice:estimate,originalCurrency:'EUR'",
 "  };",
 "  listings=[...listings,estimateRow];",
 "  comparables=[estimateRow];",
 "  asking=summarizeListings(comparables);",
 "  usedOrientativeEstimate=true;",
 "  warnings.push('No se pudo leer una cotización pública suficientemente fiable; se muestra una estimación orientativa para que la ficha no quede sin valor.');",
 " }",
 " const sources=limitPricingSources(uniqueSources(webSources),item);"
].join('\n');
core=core.slice(0,start)+newBlock+core.slice(endPos);

const oldSummary="  summary=`Valoración calculada localmente a partir de precios públicos del producto exacto. ${baremo}`;\n  facts=[{label:'Baremo de mercado',value:baremo,sourceId:comparables[0].id},...comparables.slice(0,6).map(row=>({label:'Precio comparable',value:`${euro(row.price)} · ${row.condition}`,sourceId:row.id}))];";
const newSummary=[
 "  summary=usedOrientativeEstimate",
 "   ?`Estimación orientativa para ${identity}: ${euro(asking.median)}. No es una venta cerrada ni una cotización pública verificada.`",
 "   :`Valoración calculada localmente a partir de precios públicos del producto exacto.${usedFallbackRate?' Conversión USD/EUR orientativa.':''} ${baremo}`;",
 "  facts=[{label:usedOrientativeEstimate?'Estimación orientativa':'Baremo de mercado',value:baremo,sourceId:sources[0]?.id||comparables[0].id},...comparables.slice(0,6).map(row=>({label:usedOrientativeEstimate?'Valor estimado':'Precio comparable',value:`${euro(row.price)} · ${row.condition}`,sourceId:sources[0]?.id||row.id}))];"
].join('\n');
if(!core.includes(oldSummary))throw new Error('research summary block not found');
core=core.replace(oldSummary,newSummary);
fs.writeFileSync(corePath,core);

const testPath='tests/core.mjs';
let tests=fs.readFileSync(testPath,'utf8');
const marker="console.log('core tests ok');";
if(!tests.includes(marker))throw new Error('test marker not found');
const extra=[
 "// Un Funko debe terminar SIEMPRE con un valor visible aunque las fuentes públicas no devuelvan importe legible.",
 "let orientativeAiCalls=0;",
 "const noPriceFunkoFetch=async(url,init)=>{",
 " if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[]}]}),{status:200,headers:{'content-type':'application/json'}});",
 " if(String(url).includes('/chat/completions')){orientativeAiCalls++;return new Response(JSON.stringify({choices:[{message:{content:'{\"median\":17.5,\"min\":14,\"max\":21,\"reason\":\"estimación conservadora\"}'}}]}),{status:200,headers:{'content-type':'application/json'}});}",
 " return new Response('{}',{status:404,headers:{'content-type':'application/json'}});",
 "};",
 "const orientativeFunko=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',hasBox:true}},{key:'test',fetcher:noPriceFunkoFetch});",
 "assert.equal(orientativeAiCalls,1);",
 "assert.equal(orientativeFunko.asking.median,17.5);",
 "assert.match(orientativeFunko.summary,/Estimación orientativa/i);",
 "",
 "// Incluso si también falla la estimación IA, la ficha conserva un valor base orientativo.",
 "const totalFailureFetch=async(url)=>{",
 " if(String(url).includes('/anthropic/v1/messages'))return new Response(JSON.stringify({content:[{type:'web_search_tool_result',content:[]}]}),{status:200,headers:{'content-type':'application/json'}});",
 " if(String(url).includes('/chat/completions'))return new Response('error',{status:500});",
 " return new Response('{}',{status:404,headers:{'content-type':'application/json'}});",
 "};",
 "const guaranteedFunko=await research({confirmed:true,item:{title:'Funko Pop! Movies: The Lord of the Rings - Éomer #1982',type:'funko',manufacturer:'Funko',character:'Éomer',popNumber:'1982',hasBox:true}},{key:'test',fetcher:totalFailureFetch});",
 "assert.equal(guaranteedFunko.asking.median,15);",
 "assert.ok(guaranteedFunko.asking.median>0);",
 "assert.match(guaranteedFunko.summary,/Estimación orientativa/i);",
 "",
 marker
].join('\n');
tests=tests.replace(marker,extra);
fs.writeFileSync(testPath,tests);
console.log('Funko guaranteed-price fallback applied');
