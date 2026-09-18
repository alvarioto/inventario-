from pathlib import Path

core=Path('src/lib/ai-core.mjs')
text=core.read_text(encoding='utf-8')

# Replace the narrow comic->figure guard with a generic physical-object-first classifier.
anchor="""function correctCollectibleType(row){
 if(!row||row.type!=='comic')return row;
 const manufacturer=normalizeComparableText(row.manufacturer);
 const line=normalizeComparableText(row.line);
 const evidence=normalizeComparableText(`${row.title||''} ${row.edition||''} ${row.explanation||''} ${Array.isArray(row.tags)?row.tags.join(' '):''}`);
 const toyBrand=/^(hasbro|mattel|mcfarlane toys|neca|mezco|bandai|super7)$/.test(manufacturer);
 const toyLine=/\bmarvel legends\b|\bblack series\b|\bmasters of the universe\b|\bgi joe classified\b|\baction figure\b/.test(line);
 const physicalFigure=/\baction figure\b|\bfigura articulada\b|\barticulated figure\b|\bblister\b|\bblister card\b|\bcarded figure\b|\bmuneco articulado\b|\baccesorios intercambiables\b|\binterchangeable accessories\b/.test(evidence);
 return (toyBrand||toyLine||physicalFigure)?{...row,type:'figure'}:row;
}
"""
replacement="""function correctCollectibleType(row){
 if(!row)return row;
 // Funko conserva su taxonomía especializada cuando la evidencia ya lo identifica como tal.
 if(row.type==='funko'||/\bfunko\b|\bpop!?\b/i.test(`${row.manufacturer||''} ${row.line||''}`))return row;
 const manufacturer=normalizeComparableText(row.manufacturer);
 const line=normalizeComparableText(row.line);
 const evidence=normalizeComparableText(`${row.title||''} ${row.edition||''} ${row.explanation||''} ${Array.isArray(row.tags)?row.tags.join(' '):''}`);
 const scores={figure:0,comic:0,manga:0,card:0,game:0,lego:0,plush:0,replica:0,movie:0,merch:0};
 const hit=(type,re,weight=3)=>{if(re.test(evidence)||re.test(line)||re.test(manufacturer))scores[type]+=weight;};

 // FIGURA física: articulaciones, blister, accesorios, estatua/figurine y líneas de juguetes.
 hit('figure',/\baction figure\b|\bfigura articulada\b|\barticulated figure\b|\bblister\b|\bblister card\b|\bcarded figure\b|\bmuneco articulado\b|\baccessor(?:y|ies)\b|\baccesorios? intercambiables?\b|\bfigurine\b|\bstatue\b|\bmaquette\b/,5);
 if(/^(hasbro|mattel|mcfarlane toys|neca|mezco|bandai|super7|jazwares|spin master)$/.test(manufacturer))scores.figure+=4;
 if(/\bmarvel legends\b|\bblack series\b|\bmasters of the universe\b|\bgi joe classified\b|\bclassified series\b|\bmafex\b|\bsh figuarts\b/.test(line))scores.figure+=6;

 // Publicaciones: requieren evidencia del OBJETO-libro/revista, no solo palabras impresas en otro packaging.
 hit('comic',/\bcomic book\b|\bgrapas?\b|\bsingle issue\b|\bnumero de comic\b|\bissue #?\d+\b|\bcomic de grapa\b|\bpages?\b|\bpaginas?\b/,4);
 hit('manga',/\bmanga\b|\btankobon\b|\bvolume?\s*\d+\b|\btomo\s*\d+\b/,4);
 if(String(row.isbn||'').trim()){scores.comic+=1;scores.manga+=2;}

 // Cartas: formato físico de carta/slab y metadatos TCG.
 hit('card',/\btrading card\b|\btcg\b|\bcollectible card\b|\bcarta coleccionable\b|\bslab\b|\bpsa\b|\bbgs\b|\bcgc card\b/,5);
 if(String(row.cardNumber||'').trim()||String(row.setName||'').trim()||row.graded)scores.card+=4;

 // Videojuegos: soporte físico/plataforma.
 hit('game',/\bvideo game\b|\bvideojuego\b|\bgame cartridge\b|\bcartucho\b|\bgame disc\b|\bblu[- ]?ray game\b|\bnintendo switch\b|\bplaystation\b|\bxbox\b|\bgame boy\b/,5);
 if(String(row.platform||'').trim())scores.game+=4;

 // LEGO y construcción.
 hit('lego',/\blego\b|\bminifigure\b|\bminifig\b|\bbrick set\b|\bconstruction set\b|\bset number\b/,6);
 if(manufacturer==='lego')scores.lego+=8;

 // Peluches.
 hit('plush',/\bplush\b|\bstuffed toy\b|\bstuffed animal\b|\bpeluche\b|\bsoft toy\b|\btela rellena\b/,6);

 // Réplicas/props.
 hit('replica',/\breplica\b|\bprop replica\b|\bhelmet replica\b|\bcasco replica\b|\blightsaber\b|\bespada replica\b|\bprop weapon\b|\b1:?1 scale replica\b/,6);

 // Películas/soporte audiovisual físico.
 hit('movie',/\bdvd\b|\bblu[- ]?ray\b|\b4k uhd\b|\bsteelbook\b|\bvideo cassette\b|\bvhs\b/,5);

 // Merchandising general: ropa, taza, pin, póster, etc.
 hit('merch',/\bt-?shirt\b|\bcamiseta\b|\bhoodie\b|\bsudadera\b|\bmug\b|\btaza\b|\bpin badge\b|\bposter\b|\bllavero\b|\bkeychain\b/,4);

 const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
 const [bestType,bestScore]=ranked[0];
 const secondScore=ranked[1]?.[1]||0;
 // Solo corrige la IA con evidencia fuerte y claramente superior; si no, respeta su tipo original.
 if(bestScore>=5&&bestScore>=secondScore+2&&bestType!==row.type)return {...row,type:bestType};
 return row;
}
"""
if anchor not in text: raise SystemExit('generic type guard anchor not found')
text=text.replace(anchor,replacement,1)

# Upgrade the general multimodal system prompt so physical nature always wins over printed artwork/text.
needle="""TIPO DE OBJETO CRÍTICO: decide type por el objeto físico real, nunca por logos/texto/arte del packaging. Si se ve una figura articulada en un blister con accesorios, type debe ser figure aunque aparezcan palabras como MARVEL COMICS, X-MEN o ilustraciones de cómic. type=comic exige que el objeto físico sea una publicación con páginas/grapas/lomo."""
replacement="""TIPO DE OBJETO CRÍTICO: decide type por la NATURALEZA FÍSICA del objeto, nunca por logos, franquicias, palabras ni ilustraciones impresas en su packaging. Primero pregúntate qué tienes delante físicamente: figura articulada/estatua, publicación con páginas, carta, cartucho/disco de videojuego, set de construcción, peluche, réplica/prop, soporte audiovisual o merchandising. Ejemplos: una figura en blister sigue siendo figure aunque el cartón diga MARVEL COMICS; una caja con dibujo de personaje no es comic si dentro hay un muñeco; una carta con arte de videojuego sigue siendo card; un steelbook con arte de cómic sigue siendo movie/game según el soporte físico. type=comic exige una publicación real con páginas/grapas/lomo; type=card exige una carta física; type=game exige soporte/videojuego identificable; type=lego exige piezas/set de construcción; type=plush exige objeto textil relleno; type=replica exige prop/reproducción física."""
if needle not in text: raise SystemExit('main physical prompt anchor not found')
text=text.replace(needle,replacement,1)

# Same principle for single-view fallback prompt.
needle="""TIPO DE OBJETO CRÍTICO: clasifica por el OBJETO FÍSICO visible, no por el diseño, logos ni palabras impresas en el embalaje. Una figura/muñeco articulado dentro de un blister es type=figure aunque el cartón diga MARVEL COMICS, X-MEN, DC COMICS o parezca una portada. Usa type=comic solo cuando el objeto físico sea realmente una publicación con páginas, grapas o lomo."""
replacement="""TIPO DE OBJETO CRÍTICO: clasifica por la NATURALEZA FÍSICA visible, no por diseño, logos ni palabras del embalaje. Distingue explícitamente figura/articulación o estatua, publicación con páginas, carta, videojuego físico, LEGO/construcción, peluche, réplica/prop, soporte audiovisual y merchandising. Una figura dentro de un blister es type=figure aunque el cartón diga MARVEL COMICS/X-MEN/DC COMICS. Una carta con arte de una película sigue siendo card. Un steelbook no es comic por su ilustración. Usa type=comic solo si el objeto físico es una publicación con páginas/grapas/lomo."""
if needle not in text: raise SystemExit('single-view physical prompt anchor not found')
text=text.replace(needle,replacement,1)

# Broaden research identity per object type so searches are based on exact physical product metadata.
anchor=""" if(item?.type==='figure'){
  const manufacturer=String(item?.manufacturer||'').trim();
  const line=String(item?.line||'').trim();
  const sku=String(item?.sku||'').trim();
  const barcode=String(item?.barcode||'').replace(/\\s/g,'');
  const cleanedTitle=title
   .replace(/\\bmarvel\\s+comics\\b/gi,' ')
   .replace(/\\bdc\\s+comics\\b/gi,' ')
   .replace(/\\s+/g,' ').trim();
  const identity=[manufacturer,line,cleanedTitle||String(item?.character||'').trim(),sku||barcode]
   .filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
  if(identity)return identity;
 }
 return (title||String(item?.character||'').trim()||String(item?.manufacturer||'').trim()||String(item?.line||'').trim()).replace(/\\s+/g,' ').trim();
}"""
replacement=""" if(item?.type==='figure'){
  const manufacturer=String(item?.manufacturer||'').trim();
  const line=String(item?.line||'').trim();
  const sku=String(item?.sku||'').trim();
  const barcode=String(item?.barcode||'').replace(/\\s/g,'');
  const cleanedTitle=title.replace(/\\bmarvel\\s+comics\\b/gi,' ').replace(/\\bdc\\s+comics\\b/gi,' ').replace(/\\s+/g,' ').trim();
  const identity=[manufacturer,line,cleanedTitle||String(item?.character||'').trim(),sku||barcode].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
  if(identity)return identity;
 }
 if(item?.type==='comic'||item?.type==='manga'){
  return [title||item?.character,item?.issueNumber?`#${item.issueNumber}`:'',item?.volume?`Vol ${item.volume}`:'',item?.edition,item?.isbn].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
 }
 if(item?.type==='card'){
  return [item?.franchise||item?.line||title,item?.setName,item?.cardNumber,item?.rarity,item?.gradingCompany,item?.grade].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
 }
 if(item?.type==='game'){
  return [title,item?.platform,item?.edition,item?.sku||item?.barcode].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
 }
 if(item?.type==='lego'){
  return ['LEGO',item?.sku||item?.barcode,title,item?.line].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
 }
 if(item?.type==='plush'||item?.type==='replica'||item?.type==='merch'||item?.type==='movie'){
  return [item?.manufacturer,title||item?.character,item?.line,item?.edition,item?.sku||item?.barcode].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
 }
 return (title||String(item?.character||'').trim()||String(item?.manufacturer||'').trim()||String(item?.line||'').trim()).replace(/\\s+/g,' ').trim();
}"""
if anchor not in text: raise SystemExit('research identity type anchor not found')
text=text.replace(anchor,replacement,1)

core.write_text(text,encoding='utf-8')

# Regression tests for several physical-object families.
tests=Path('tests/core.mjs')
t=tests.read_text(encoding='utf-8')
anchor="""assert.equal(buildResearchIdentity(weaponXFigure),'Hasbro Marvel Legends X-Men Weapon X Wolverine (Weapon X) G0644');"""
extra=r"""

// La naturaleza física manda sobre el arte/licencia impresa.
const physicalCases=[
 {input:{title:'Pokémon Charizard promo art',type:'comic',manufacturer:'The Pokémon Company',setName:'Scarlet & Violet',cardNumber:'199/165',explanation:'Trading card inside a PSA slab',graded:true},expected:'card'},
 {input:{title:'Batman artwork',type:'comic',manufacturer:'McFarlane Toys',line:'DC Multiverse',explanation:'Articulated action figure in blister packaging'},expected:'figure'},
 {input:{title:'The Last of Us cover art',type:'comic',platform:'PlayStation 5',explanation:'PS5 video game disc in plastic case'},expected:'game'},
 {input:{title:'Grogu',type:'figure',manufacturer:'LEGO',sku:'75318',explanation:'LEGO brick construction set'},expected:'lego'},
 {input:{title:'Pikachu',type:'figure',explanation:'Soft stuffed plush toy made of fabric'},expected:'plush'},
 {input:{title:'Iron Man helmet',type:'figure',explanation:'1:1 scale wearable prop replica helmet'},expected:'replica'}
];
for(const row of physicalCases){
 const fetcher=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...row.input,confidence:.95})}}]}),{status:200,headers:{'content-type':'application/json'}});
 const identified=await identify('data:image/jpeg;base64,PHYSICAL',{key:'test',fetcher});
 assert.equal(identified.type,row.expected);
}
"""
if anchor not in t: raise SystemExit('physical regression anchor not found')
t=t.replace(anchor,anchor+extra,1)
tests.write_text(t,encoding='utf-8')
print('Generic physical taxonomy applied')
