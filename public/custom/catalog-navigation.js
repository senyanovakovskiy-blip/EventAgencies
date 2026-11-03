// Each history entry owns its catalogue position; URLs continue to own filters.
(()=>{
  const isCatalog=location.pathname.replace(/\/$/,'')==='/catalog', isAgency=/^\/agency\/[a-z0-9-]+\/?$/.test(location.pathname);
  if(!isCatalog&&!isAgency)return;
  const storeKey='ea.catalog.positions.v1', pendingKey='ea.catalog.navigation.v1';
  const path=()=>location.pathname+location.search;
  const read=key=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}};
  const entryId=()=>history.state?.eaCatalogEntry;
  const historyData=()=>history.state&&typeof history.state==='object'?history.state:{};
  const positions=()=>read(storeKey)||{};
  const valid=context=>context&&context.route?.startsWith('/catalog')&&Date.now()-context.time<12*60*60*1000;
  const getContext=id=>{const context=positions()[id];return valid(context)?context:null;};
  const pending=read(pendingKey), arrival=pending?.to===path()&&Date.now()-pending.time<30000?pending:null;
  if(arrival){try{sessionStorage.removeItem(pendingKey);}catch{}}
  if(isCatalog){
    history.scrollRestoration='manual';
    const returning=getContext(arrival?.entry);
    const id=arrival?.entry?crypto.randomUUID():entryId()||crypto.randomUUID();
    history.replaceState({...historyData(),eaCatalogEntry:id},'');
    if(returning)write(storeKey,{...positions(),[id]:returning});
  }
  const navigation=performance.getEntriesByType('navigation')[0]?.type;
  let restore=isCatalog&&(arrival?.entry||['back_forward','reload'].includes(navigation))?getContext(entryId()):null;
  if(restore?.route!==path())restore=null;
  let waiting=Boolean(arrival||restore||(isAgency&&navigation==='back_forward')), leaving=false, generation=0, pageAnimation, lastCard=null, lastAgency=null;
  let revealStarted=false, interacted=false;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const observed=new WeakSet();
  if(waiting)document.documentElement.dataset.catalogEntering='';
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const timeout=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  // A failed script/data request must never leave the page permanently hidden.
  const watchdog=setTimeout(()=>{delete document.documentElement.dataset.catalogEntering;},6000);
  function animate(node,frames,duration){
    if(reduced.matches||!node?.animate)return Promise.resolve();
    pageAnimation?.cancel();
    const animation=node.animate(frames,{duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
    pageAnimation=animation;
    return animation.finished.catch(()=>{}).finally(()=>{animation.cancel();if(pageAnimation===animation)pageAnimation=null;});
  }
  function photoEntrance(){
    for(const image of document.querySelectorAll('#content .work-cover img')){
      if(observed.has(image))continue;observed.add(image);
      if(image.complete&&image.naturalWidth)continue;
      image.style.opacity='0';
      const reveal=async()=>{
        try{await image.decode();}catch{}
        image.style.removeProperty('opacity');
        if(image.naturalWidth&&!reduced.matches&&image.isConnected)image.animate([{opacity:0},{opacity:1}],{duration:320,easing:'ease-out'});
      };
      image.addEventListener('load',reveal,{once:true});
      image.addEventListener('error',()=>image.style.removeProperty('opacity'),{once:true});
      if(image.complete)reveal();
    }
  }
  function save(card,agency){
    if(!isCatalog||document.getElementById('catalog-results')?.getAttribute('aria-busy')!=='false'||waiting)return null;
    const cards=[...document.querySelectorAll('[data-catalog-key]')];
    if(card&&!card.isConnected)card=cards.find(node=>node.dataset.catalogKey===card.dataset.catalogKey);
    const visible=cards.find(node=>{const box=node.getBoundingClientRect();return box.bottom>120&&box.top<innerHeight;});
    const old=lastCard&&cards.find(node=>node.dataset.catalogKey===lastCard);
    card=card||((old&&old.getBoundingClientRect().bottom>0&&old.getBoundingClientRect().top<innerHeight)?old:visible);
    const context={route:path(),top:scrollY,key:card?.dataset.catalogKey||null,offset:card?.getBoundingClientRect().top||0,width:innerWidth,height:innerHeight,filtersOpen:document.querySelector('.filter-options')?.open,agency:agency||lastAgency,time:Date.now()};
    lastCard=context.key;lastAgency=context.agency;
    const data=positions();data[entryId()]=context;
    const recent=Object.entries(data).filter(([,value])=>valid(value)).sort((a,b)=>b[1].time-a[1].time).slice(0,20);
    write(storeKey,Object.fromEntries(recent));return context;
  }
  function restorePosition(context){
    if(!context||interacted)return;
    const card=[...document.querySelectorAll('[data-catalog-key]')].find(node=>node.dataset.catalogKey===context.key);
    let top=context.top;
    if(card){
      const sameWidth=Math.abs(innerWidth-context.width)<40;
      const offset=sameWidth?context.offset:Math.max(24,Math.min(innerHeight*.45,context.offset/context.height*innerHeight));
      top=scrollY+card.getBoundingClientRect().top-offset;
    }
    window.scrollTo({top:Math.max(0,top),behavior:'instant'});
    lastCard=context.key;lastAgency=context.agency;
  }
  async function reveal(context=restore){
    const main=document.getElementById('content');if(!main||leaving||revealStarted)return;
    revealStarted=true;const token=++generation;
    try{
      photoEntrance();
      if(context&&document.querySelector('.filter-options'))document.querySelector('.filter-options').open=context.filtersOpen;
      if(waiting){
        await Promise.race([document.fonts?.ready||Promise.resolve(),timeout(500)]);
        if(token!==generation)return;
        restorePosition(context);await frame();restorePosition(context);
        const visible=[...main.querySelectorAll('.work-cover img')].filter(image=>{const r=image.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;});
        await Promise.race([Promise.allSettled(visible.map(image=>image.decode())),timeout(700)]);
        if(token!==generation)return;
        restorePosition(context);
      }
      delete document.documentElement.dataset.catalogEntering;clearTimeout(watchdog);
      const shouldAnimate=waiting;waiting=false;
      if(shouldAnimate)await animate(main,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],innerWidth<=900?300:380);
      if(token!==generation||leaving)return;
      if(context?.agency){
        const card=[...main.querySelectorAll('[data-catalog-key]')].find(node=>node.dataset.catalogKey===context.key);
        const link=[...card?.querySelectorAll('a[href]')||[]].find(link=>new URL(link.href).pathname===context.agency);
        link?.focus({preventScroll:true});
      }
      main.dataset.catalogReady='true';
    }finally{if(token===generation)revealStarted=false;}
  }
  function catalogReturn(){
    const query=new URLSearchParams(location.search), context=getContext(query.get('catalogEntry'));
    let from=query.get('from');
    try{const url=new URL(from,location.origin);if(url.origin!==location.origin||url.pathname!=='/catalog')return null;from=url.pathname+url.search;}catch{return null;}
    return {route:from,entry:context?.route===from?query.get('catalogEntry'):null};
  }
  async function leave(to,entry){
    if(leaving)return;leaving=true;++generation;pageAnimation?.cancel();
    write(pendingKey,{to,entry,time:Date.now()});
    const main=document.getElementById('content'), wasInert=main?.inert;
    if(main)main.inert=true;
    await animate(main,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-4px)'}],150);
    if(main){main.style.opacity='0';main.inert=wasInert;}
    location.assign(to);
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.target==='_blank'||link.hasAttribute('download'))return;
    const url=new URL(link.href,location.origin);if(url.origin!==location.origin)return;
    if(isCatalog&&/^\/agency\/[a-z0-9-]+\/?$/.test(url.pathname)){
      const card=link.closest('[data-catalog-key]');
      document.dispatchEvent(new Event('ea:catalog-flush'));
      save(card,url.pathname);
      url.searchParams.set('from',path());url.searchParams.set('catalogEntry',entryId());
      event.preventDefault();leave(url.pathname+url.search,null);
    }else if(isAgency&&url.pathname==='/catalog'&&(link.hasAttribute('data-catalog-back')||!url.search)){
      const destination=catalogReturn();
      event.preventDefault();leave(destination?.route||'/catalog',destination?.entry||null);
    }
  });
  document.addEventListener('ea:catalog-render',()=>{
    photoEntrance();
    if(!revealStarted&&(waiting||document.getElementById('content')?.dataset.catalogReady!=='true'))reveal();
  });
  document.addEventListener('ea:catalog-error',()=>{waiting=false;delete document.documentElement.dataset.catalogEntering;});
  document.addEventListener('DOMContentLoaded',()=>{
    if(isAgency){
      const back=document.querySelector('[data-catalog-back]'), destination=catalogReturn();
      if(back&&destination){back.href=destination.route;back.textContent='← Вернуться в каталог';}
      reveal(null);
    }else if(document.getElementById('catalog-results')?.getAttribute('aria-busy')==='false')reveal();
  });
  window.addEventListener('pagehide',()=>{
    if(isCatalog)save();
    ++generation;pageAnimation?.cancel();
    const main=document.getElementById('content');if(main)main.style.removeProperty('opacity');
  });
  window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    leaving=false;revealStarted=false;interacted=false;
    const main=document.getElementById('content');if(main){main.style.removeProperty('opacity');main.inert=false;}
    restore=isCatalog?getContext(entryId()):null;if(restore?.route!==path())restore=null;
    waiting=true;document.documentElement.dataset.catalogEntering='';reveal(restore);
  });
  window.addEventListener('popstate',()=>{
    if(!isCatalog)return;
    restore=getContext(entryId());if(restore?.route!==path())restore=null;
    waiting=Boolean(restore);revealStarted=false;interacted=false;
    if(waiting)document.documentElement.dataset.catalogEntering='';
  });
  for(const type of ['wheel','touchstart'])window.addEventListener(type,()=>{if(waiting)interacted=true;},{passive:true});
  reduced.addEventListener('change',()=>{if(reduced.matches)pageAnimation?.cancel();});
})();
