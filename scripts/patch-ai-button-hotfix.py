from pathlib import Path
import re

core = Path('src/lib/ai-core.mjs')
s = core.read_text()

new_deepseek = r'''export async function deepseek(messages,{key,model='deepseek-flash',fetcher=fetch,maxTokens=1800,timeoutMs=55000,retries=0,jsonMode=true}){
 if(!key)throw new Error('Falta configurar DEEPSEEK_API_KEY en el servidor.');
 let lastError=null;
 for(let attempt=0;attempt<=retries;attempt++){
  try{
   const body={model,messages,max_tokens:maxTokens,stream:false,thinking:{type:'disabled'},reasoning_effort:'none'};
   if(jsonMode)body.response_format={type:'json_object'};
   const response=await fetcher('https://api.deepseek.com/chat/completions',{
    method:'POST',
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(timeoutMs)
   });
   if(!response.ok){
    const providerMessages={401:'DeepSeek ha rechazado la clave API.',402:'DeepSeek no tiene saldo disponible.',429:'DeepSeek ha limitado las peticiones. Prueba más tarde.'};
    const detail=await response.text().catch(()=> '');
    const base=providerMessages[response.status]||`DeepSeek devolvió HTTP ${response.status}.`;
    const error=new Error(detail?`${base} ${detail.slice(0,220)}`:base);
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

s, n = re.subn(r"export async function deepseek\([\s\S]*?\n}\n\nasync function identifySingleView", new_deepseek + "\nasync function identifySingleView", s, count=1)
if n != 1:
    raise SystemExit('deepseek function not found')

new_identify = r'''export async function identify(input,config){
 const images=(Array.isArray(input)?input:[input]).filter(x=>typeof x==='string'&&x.startsWith('data:image/')).slice(0,5);
 if(!images.length)throw new Error('Añade al menos una foto válida del artículo.');
 const system=`Devuelve SOLO un objeto JSON con title,type,franchise,character,manufacturer,line,edition,issueNumber,volume,setName,cardNumber,rarity,platform,year,barcode,isbn,sku,country,language,condition,hasBox,sealed,signed,graded,gradingCompany,grade,confidence,explanation,tags. type: ${itemTypes.join(',')}. title debe ser el nombre comercial/canónico real, jamás una descripción de la fotografía. Datos desconocidos: cadena vacía; booleanos desconocidos: null; year null. confidence 0..1. No inventes precios ni datos personales.`;
 const makeContent=(rows)=>[
  {type:'text',text:`Identifica UN único artículo de colección usando ${rows.length} foto(s). La FOTO 1 es la vista PRINCIPAL y manda para el nombre comercial. Las demás son evidencia complementaria para trasera, códigos, caja, edición y detalles. Nunca sustituyas un nombre comercial por “caja”, “dorso”, “barcode”, “código de barras” o “Item No.”. En Funko, Item No./Item Number pertenece a sku. Devuelve únicamente JSON.`},
  ...rows.map((url,index)=>({type:'image_url',image_url:{url},detail:index===0?'high':'low'}))
 ];
 const call=rows=>deepseek([
  {role:'system',content:system},
  {role:'user',content:makeContent(rows)}
 ],{...config,maxTokens:1200,timeoutMs:30000,retries:1,jsonMode:false});
 let result;
 try{
  result=await call(images);
 }catch(primaryError){
  if(images.length===1)throw primaryError;
  try{
   result=await deepseek([
    {role:'system',content:system},
    {role:'user',content:makeContent([images[0]])}
   ],{...config,maxTokens:1200,timeoutMs:25000,retries:0,jsonMode:false});
   if(result&&typeof result==='object')result.explanation=`${result.explanation||''} Identificación recuperada usando la foto principal porque el análisis conjunto falló.`.trim();
  }catch{
   throw primaryError;
  }
 }
 return finalizeIdentification(result,[result]);
}
'''

s, n = re.subn(r"export async function identify\(input,config\)\{[\s\S]*?\n}\n\nexport async function research", new_identify + "\nexport async function research", s, count=1)
if n != 1:
    raise SystemExit('identify function not found')

s = s.replace("max_uses:5,", "max_uses:3,")
s = s.replace("signal:AbortSignal.timeout(50000)", "signal:AbortSignal.timeout(28000)")

core.write_text(s)
print('AI button hotfix applied')
# trigger
