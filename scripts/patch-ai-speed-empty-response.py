from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing pattern: {label}')
    return text.replace(old, new, 1)

p = Path('src/lib/ai-core.mjs')
s = p.read_text()

old_deepseek = '''export async function deepseek(messages,{key,model='deepseek-flash',fetcher=fetch}){
 if(!key)throw new Error('Falta configurar DEEPSEEK_API_KEY en el servidor.');
 const response=await fetcher('https://api.deepseek.com/chat/completions',{
  method:'POST',
  headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({model,messages,response_format:{type:'json_object'},max_tokens:2500,stream:false}),
  signal:AbortSignal.timeout(90000)
 });
 if(!response.ok){
  const messages={401:'DeepSeek ha rechazado la clave API.',402:'DeepSeek no tiene saldo disponible.',429:'DeepSeek ha limitado las peticiones. Prueba más tarde.'};
  throw new Error(messages[response.status]||`DeepSeek devolvió HTTP ${response.status}.`);
 }
 const data=await response.json();
 const content=data.choices?.[0]?.message?.content;
 return parseDeepSeekJson(content);
}
'''
new_deepseek = '''export async function deepseek(messages,{key,model='deepseek-flash',fetcher=fetch,maxTokens=1800,timeoutMs=55000,retries=1}){
 if(!key)throw new Error('Falta configurar DEEPSEEK_API_KEY en el servidor.');
 let lastError=null;
 for(let attempt=0;attempt<=retries;attempt++){
  try{
   const response=await fetcher('https://api.deepseek.com/chat/completions',{
    method:'POST',
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,messages,response_format:{type:'json_object'},max_tokens:maxTokens,stream:false}),
    signal:AbortSignal.timeout(timeoutMs)
   });
   if(!response.ok){
    const providerMessages={401:'DeepSeek ha rechazado la clave API.',402:'DeepSeek no tiene saldo disponible.',429:'DeepSeek ha limitado las peticiones. Prueba más tarde.'};
    const error=new Error(providerMessages[response.status]||`DeepSeek devolvió HTTP ${response.status}.`);
    if(response.status<500&&response.status!==429)throw error;
    lastError=error;
   }else{
    const data=await response.json();
    const content=data.choices?.[0]?.message?.content;
    try{return parseDeepSeekJson(content);}
    catch(error){lastError=error;}
   }
  }catch(error){
   lastError=error;
   const message=error instanceof Error?error.message:String(error);
   if(/clave API|saldo disponible/i.test(message))throw error;
  }
  if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
 }
 throw lastError instanceof Error?lastError:new Error('DeepSeek no devolvió una respuesta utilizable.');
}
'''
s = replace_once(s, old_deepseek, new_deepseek, 'deepseek retry implementation')

old_single_call = ''' ],config);
 return identificationSchema.parse(result);
}

export async function identify(input,config){'''
new_single_call = ''' ],{...config,maxTokens:1300,timeoutMs:45000,retries:1});
 return identificationSchema.parse(result);
}

function identificationRichness(row){
 const useful=['title','franchise','character','manufacturer','line','edition','issueNumber','volume','setName','cardNumber','rarity','platform','barcode','isbn','sku','country','language','gradingCompany','grade'];
 const filled=useful.reduce((sum,key)=>sum+(String(row?.[key]??'').trim()?1:0),0);
 return (Number(row?.confidence)||0)*10+filled;
}

function bestIdentification(analyses,reason=''){
 const best=[...analyses].sort((a,b)=>identificationRichness(b)-identificationRichness(a))[0];
 if(!best)return null;
 return identificationSchema.parse({
  ...best,
  explanation:reason?`${best.explanation} ${reason}`.trim():best.explanation
 });
}

export async function identify(input,config){'''
s = replace_once(s, old_single_call, new_single_call, 'single view config and helpers')

old_one_photo = '''   ]}
  ],config);
  return identificationSchema.parse(result);
 }'''
new_one_photo = '''   ]}
  ],{...config,maxTokens:1400,timeoutMs:45000,retries:1});
  return identificationSchema.parse(result);
 }'''
s = replace_once(s, old_one_photo, new_one_photo, 'one-photo optimized call')

old_multi = ''' // Con varias fotos, analizamos cada vista de forma independiente para que una
 // imagen secundaria no degrade una identificación correcta de la principal.
 const analyses=[];
 const errors=[];
 for(let i=0;i<images.length;i++){
  try{analyses.push(await identifySingleView(images[i],i,images.length,config));}
  catch(error){errors.push(error instanceof Error?error.message:String(error));}
 }
 if(!analyses.length)throw new Error(errors[0]||'No se pudo analizar ninguna de las fotos.');
 if(analyses.length===1)return analyses[0];

 // Fusión final SOLO con las evidencias extraídas. Todas las fichas parciales son
 // vistas del mismo objeto; se debe conservar la identificación más específica.
 const merged=await deepseek([
  {role:'system',content:`Recibirás análisis parciales de varias fotografías DEL MISMO artículo de colección. Debes fusionarlos en una única ficha JSON con title,type,franchise,character,manufacturer,line,edition,issueNumber,volume,setName,cardNumber,rarity,platform,year,barcode,isbn,sku,country,language,condition,hasBox,sealed,signed,graded,gradingCompany,grade,confidence,explanation,tags. type: ${itemTypes.join(',')}. No trates los análisis como objetos distintos. Si una vista identifica el producto de forma exacta y otra solo de forma genérica, conserva la identificación exacta. Prioriza texto literal, números de producto, EAN/UPC/ISBN, fabricante y colección. Ante conflictos, elige el dato respaldado por más evidencias o el más específico que no contradiga códigos/textos exactos. No inventes datos nuevos. confidence entre 0 y 1. explanation debe indicar brevemente qué aportó cada vista y por qué la combinación aumenta o limita la confianza.`},
  {role:'user',content:JSON.stringify({sameArticle:true,photoCount:images.length,successfulAnalyses:analyses.length,analyses})}
 ],config);
 return identificationSchema.parse(merged);'''
new_multi = ''' // Con varias fotos, cada vista se analiza de forma independiente, pero EN PARALELO.
 // Así 2-5 fotos no multiplican linealmente el tiempo de espera.
 const settled=await Promise.allSettled(images.map((image,index)=>identifySingleView(image,index,images.length,config)));
 const analyses=settled.filter(row=>row.status==='fulfilled').map(row=>row.value);
 const errors=settled.filter(row=>row.status==='rejected').map(row=>row.reason instanceof Error?row.reason.message:String(row.reason));
 if(!analyses.length)throw new Error(errors[0]||'No se pudo analizar ninguna de las fotos.');
 if(analyses.length===1)return bestIdentification(analyses,'Solo una de las vistas devolvió una respuesta utilizable; se ha conservado esa identificación.')||analyses[0];

 // Fusión final SOLO con las evidencias extraídas. Si DeepSeek devuelve vacío o JSON
 // defectuoso aquí, NO tiramos todo el análisis: conservamos la vista más completa.
 try{
  const merged=await deepseek([
   {role:'system',content:`Recibirás análisis parciales de varias fotografías DEL MISMO artículo de colección. Debes fusionarlos en una única ficha JSON con title,type,franchise,character,manufacturer,line,edition,issueNumber,volume,setName,cardNumber,rarity,platform,year,barcode,isbn,sku,country,language,condition,hasBox,sealed,signed,graded,gradingCompany,grade,confidence,explanation,tags. type: ${itemTypes.join(',')}. No trates los análisis como objetos distintos. Si una vista identifica el producto de forma exacta y otra solo de forma genérica, conserva la identificación exacta. Prioriza texto literal, números de producto, EAN/UPC/ISBN, fabricante y colección. Ante conflictos, elige el dato respaldado por más evidencias o el más específico que no contradiga códigos/textos exactos. No inventes datos nuevos. confidence entre 0 y 1. explanation debe ser breve: resume únicamente las coincidencias y conflictos importantes.`},
   {role:'user',content:JSON.stringify({sameArticle:true,photoCount:images.length,successfulAnalyses:analyses.length,analyses})}
  ],{...config,maxTokens:1300,timeoutMs:40000,retries:1});
  return identificationSchema.parse(merged);
 }catch(error){
  const reason=error instanceof Error?error.message:'fallo de fusión';
  return bestIdentification(analyses,`La fusión automática de las ${analyses.length} vistas no respondió correctamente (${reason}); se conserva la identificación más completa obtenida de las fotos.`)||analyses[0];
 }'''
s = replace_once(s, old_multi, new_multi, 'parallel multi-photo identification and fallback')
p.write_text(s)

p = Path('tests/core.mjs')
s = p.read_text()

anchor = "assert.equal(fencedResult.value,'recuperado');\n"
addition = '''

// Una respuesta vacía de DeepSeek se reintenta una vez sin obligar al usuario a empezar de nuevo.
let emptyRetryCalls=0;
const emptyThenOkFetch=async()=>{
 emptyRetryCalls++;
 const content=emptyRetryCalls===1?'':JSON.stringify({ok:true,recovered:true});
 return new Response(JSON.stringify({choices:[{message:{content}}]}),{status:200,headers:{'content-type':'application/json'}});
};
const recovered=await deepseek([{role:'user',content:'retry empty'}],{key:'test',fetcher:emptyThenOkFetch,retries:1,timeoutMs:1000});
assert.equal(recovered.recovered,true);
assert.equal(emptyRetryCalls,2);
'''
s = replace_once(s, anchor, anchor+addition, 'empty response retry test')

old_multi_test = '''let visualCall=0;
const multiImageFetch=async(_url,init)=>{
  const body=JSON.parse(init.body); identifyBodies.push(body);
  const hasImage=body.messages?.some(message=>Array.isArray(message.content)&&message.content.some(block=>block.type==='image_url'));
  const result=hasImage ? partials[visualCall++] : {...partials[0],confidence:0.99,explanation:'Las tres vistas coinciden en personaje, línea y número 1982'};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'content-type':'application/json'}});
};'''
new_multi_test = '''let visualCall=0,activeVisual=0,maxConcurrentVisual=0;
const multiImageFetch=async(_url,init)=>{
  const body=JSON.parse(init.body); identifyBodies.push(body);
  const hasImage=body.messages?.some(message=>Array.isArray(message.content)&&message.content.some(block=>block.type==='image_url'));
  if(hasImage){
    const result=partials[visualCall++];
    activeVisual++; maxConcurrentVisual=Math.max(maxConcurrentVisual,activeVisual);
    await new Promise(resolve=>setTimeout(resolve,20));
    activeVisual--;
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  const result={...partials[0],confidence:0.99,explanation:'Las tres vistas coinciden en personaje, línea y número 1982'};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'content-type':'application/json'}});
};'''
s = replace_once(s, old_multi_test, new_multi_test, 'parallel test fetcher')

anchor2 = "assert.equal(mergedIdentification.sku,'1982');\n"
addition2 = "assert.ok(maxConcurrentVisual>1,'Las vistas deben analizarse en paralelo');\n"
s = replace_once(s, anchor2, anchor2+addition2, 'parallel assertion')

# Fusion failure should fall back to the best individual analysis rather than erroring.
addition3 = '''

let fallbackMergeVisual=0;
const emptyMergeFetch=async(_url,init)=>{
 const body=JSON.parse(init.body);
 const hasImage=body.messages?.some(message=>Array.isArray(message.content)&&message.content.some(block=>block.type==='image_url'));
 if(hasImage){
  const result=partials[Math.min(fallbackMergeVisual++,partials.length-1)];
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 return new Response(JSON.stringify({choices:[{message:{content:''}}]}),{status:200,headers:{'content-type':'application/json'}});
};
const mergeFallback=await identify(['data:image/jpeg;base64,AAAA','data:image/jpeg;base64,BBBB'],{key:'test',fetcher:emptyMergeFetch});
assert.equal(mergeFallback.sku,'1982');
assert.match(mergeFallback.explanation,/fusión automática/i);
'''
s = replace_once(s, anchor2+addition2, anchor2+addition2+addition3, 'merge fallback test')
p.write_text(s)
print('patch applied')
