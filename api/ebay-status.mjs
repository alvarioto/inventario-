const TOKEN_URL='https://api.ebay.com/identity/v1/oauth2/token';
const BROWSE_URL='https://api.ebay.com/buy/browse/v1/item_summary/search';

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

async function getApplicationToken(clientId,clientSecret){
  const basic=Buffer.from(clientId+':'+clientSecret).toString('base64');
  const body=new URLSearchParams({
    grant_type:'client_credentials',
    scope:'https://api.ebay.com/oauth/api_scope'
  });
  const response=await fetch(TOKEN_URL,{
    method:'POST',
    headers:{
      Authorization:'Basic '+basic,
      'Content-Type':'application/x-www-form-urlencoded'
    },
    body,
    signal:AbortSignal.timeout(15000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token){
    const detail=data.error_description||data.error||('HTTP '+response.status);
    throw new Error('OAuth eBay: '+detail);
  }
  return data.access_token;
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'GET only'});
  const clientId=String(process.env.EBAY_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.EBAY_CLIENT_SECRET||'').trim();
  const marketplace=String(process.env.EBAY_MARKETPLACE_ID||'EBAY_ES').trim();
  if(!clientId||!clientSecret)return json(res,500,{ok:false,error:'Faltan EBAY_CLIENT_ID o EBAY_CLIENT_SECRET en Production.'});
  try{
    const token=await getApplicationToken(clientId,clientSecret);
    const url=new URL(BROWSE_URL);
    url.searchParams.set('q','Funko');
    url.searchParams.set('limit','1');
    const response=await fetch(url,{
      headers:{
        Authorization:'Bearer '+token,
        'X-EBAY-C-MARKETPLACE-ID':marketplace
      },
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const detail=data.errors?.[0]?.message||data.errors?.[0]?.longMessage||('HTTP '+response.status);
      return json(res,502,{ok:false,oauth:true,browse:false,marketplace,error:'Browse API: '+detail});
    }
    return json(res,200,{
      ok:true,
      oauth:true,
      browse:true,
      marketplace,
      total:Number.isFinite(data.total)?data.total:null,
      sampleItemId:data.itemSummaries?.[0]?.itemId||null,
      sampleTitle:data.itemSummaries?.[0]?.title||null
    });
  }catch(error){
    return json(res,502,{ok:false,oauth:false,browse:false,marketplace,error:error instanceof Error?error.message:'Error eBay'});
  }
}
