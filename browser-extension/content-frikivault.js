const WEB_SOURCE='frikivault-web';
const EXT_SOURCE='frikivault-af411-extension';

window.addEventListener('message',(event)=>{
  if(event.source!==window)return;
  const data=event.data;
  if(!data||data.source!==WEB_SOURCE||!data.requestId)return;

  if(data.type==='AF411_PING'){
    window.postMessage({source:EXT_SOURCE,type:'AF411_READY',requestId:data.requestId,payload:{ready:true}},'*');
    return;
  }

  if(data.type==='AF411_LOOKUP'){
    chrome.runtime.sendMessage({type:'AF411_LOOKUP',requestId:data.requestId,payload:data.payload},(reply)=>{
      const error=chrome.runtime.lastError?.message;
      window.postMessage({
        source:EXT_SOURCE,
        type:'AF411_RESULT',
        requestId:data.requestId,
        payload:error?{ok:false,error}:{...(reply||{ok:false,error:'El puente no devolvió respuesta.'})}
      },'*');
    });
  }
});
