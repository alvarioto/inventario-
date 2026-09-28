from pathlib import Path

p = Path('browser-extension/background.js')
s = p.read_text()

start = s.index('function buildTerms(item){')
end = s.index('\nfunction parseNumber', start)
new_build_terms = r'''function buildTerms(item){
  const out=[];
  const character=cleanName(item.character||'');
  const title=cleanName(item.title||'');
  const sku=String(item.sku||'').trim();
  const barcode=String(item.barcode||'').replace(/\D/g,'');
  const aliases=value=>{
    const raw=String(value||'').trim();
    if(!raw)return [];
    return [
      raw.replace(/\bmark\s+lxxxv\b/ig,'MK85').replace(/\bmark\s+85\b/ig,'MK85'),
      raw
    ].map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  };
  for(const term of [...aliases(character),...aliases(title),sku,barcode]){
    if(!term)continue;
    if(!out.some(existing=>normalize(existing)===normalize(term)))out.push(term);
  }
  return out.slice(0,5);
}'''
s = s[:start] + new_build_terms + s[end:]

start = s.index('async function visibleSearch(tabId,genre,term){')
end = s.index('\nasync function getDetail', start)
new_visible_search = r'''async function visibleSearch(tabId,genre,term){
  const sectionUrl=ACTIONFIGURE411+'/'+genre.slug+'/';
  await navigate(tabId,sectionUrl,tab=>tab.url?.startsWith(sectionUrl));

  const result=await run(tabId,async(query,genreSlug)=>{
    const input=document.querySelector('#queryInput');
    if(!input)return {ok:false,error:'No aparece el cuadro Search de ActionFigure411.'};

    const normalizeText=value=>String(value||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
    const queryTokens=normalizeText(query).split(' ').filter(x=>x.length>=2);
    const inputRect=input.getBoundingClientRect();

    input.focus();
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if(setter)setter.call(input,'');else input.value='';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    if(setter)setter.call(input,query);else input.value=query;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));

    const deadline=Date.now()+5000;
    while(Date.now()<deadline){
      const candidates=[...document.querySelectorAll('a[href]')]
        .map(a=>{
          const rect=a.getBoundingClientRect();
          const style=getComputedStyle(a);
          if(style.display==='none'||style.visibility==='hidden'||rect.width<20||rect.height<10)return null;
          let url;
          try{url=new URL(a.href,location.href)}catch{return null}
          if(url.hostname!=='www.actionfigure411.com')return null;
          if(!url.pathname.toLowerCase().startsWith('/'+genreSlug+'/')||!url.pathname.toLowerCase().endsWith('.php'))return null;
          if(rect.top<inputRect.bottom-15||rect.top>inputRect.bottom+320)return null;
          if(rect.right<inputRect.left-80||rect.left>inputRect.right+120)return null;
          const container=a.closest('li,tr,.ui-menu-item,.autocomplete-suggestion,.search-result,div')||a;
          const text=(container.textContent||a.textContent||a.querySelector('img')?.alt||'').replace(/\s+/g,' ').trim();
          const normalized=normalizeText(text);
          const hits=queryTokens.filter(token=>normalized.includes(token)).length;
          const ratio=queryTokens.length?hits/queryTokens.length:0;
          return {a,text,url:url.href,hits,ratio,top:rect.top};
        })
        .filter(Boolean)
        .filter(row=>row.hits>=2||row.ratio>=0.5)
        .sort((a,b)=>b.ratio-a.ratio||b.hits-a.hits||a.top-b.top);

      const best=candidates[0];
      if(best){
        const rowText=best.text;
        const title=(best.a.textContent||best.a.querySelector('img')?.alt||rowText).replace(/\s+/g,' ').trim();
        const url=best.url;
        best.a.click();
        return {ok:true,title,url,rowText};
      }
      await new Promise(resolve=>setTimeout(resolve,120));
    }
    return {ok:false,error:'ActionFigure411 no mostró una coincidencia debajo del buscador para “'+query+'”.'};
  },[term,genre.slug]);

  if(!result?.ok)throw new Error(result?.error||'No apareció una coincidencia en el autocompletado de ActionFigure411.');
  await waitForTab(tabId,tab=>{
    try{
      const url=new URL(tab.url||'');
      return url.hostname==='www.actionfigure411.com'&&url.pathname.toLowerCase().startsWith('/'+genre.slug+'/')&&url.pathname.toLowerCase().endsWith('.php')&&url.pathname!=='/'+genre.slug+'/';
    }catch{return false;}
  },12000);

  const page=await run(tabId,()=>({url:location.href,text:document.body?.innerText||''}));
  if(/verify you are human|access denied|too many requests|captcha/i.test(page?.text||''))throw new Error('ActionFigure411 ha pedido verificación en el navegador.');
  return {
    url:sectionUrl,
    text:page?.text||'',
    rows:[{title:result.title,url:result.url,rowText:result.rowText}]
  };
}'''
s = s[:start] + new_visible_search + s[end:]

p.write_text(s)

# Tests: el flujo local debe usar el autocompletado visible, no Enter ni search-results.php.
t = Path('tests/actionfigure411.mjs')
ts = t.read_text()
ts = ts.replace("assert.match(extensionSource,/common\\\\/search-results/);", "assert.match(extensionSource,/getBoundingClientRect/);\nassert.match(extensionSource,/best\\.a\\.click\\(\\)/);\nassert.match(extensionSource,/MK85/);\nassert.doesNotMatch(extensionSource,/KeyboardEvent/);\nassert.doesNotMatch(extensionSource,/search-results\\.php/);")
t.write_text(ts)
