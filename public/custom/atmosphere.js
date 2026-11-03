// A shared canvas follows the current work, company or photograph without reloading the page.
(()=>{
 const canvas=document.createElement('div');canvas.className='ea-atmosphere';canvas.setAttribute('aria-hidden','true');
 canvas.innerHTML='<div class="ea-atmosphere-layer"></div><div class="ea-atmosphere-layer"></div><div class="ea-atmosphere-shade"></div>';
 document.body.prepend(canvas);
 const layers=[...canvas.querySelectorAll('.ea-atmosphere-layer')];
 let current='',active=0,request=0,observer;
 let homeScene=location.pathname==='/'?(document.body.dataset.scene||''):null;
 const captionObserver=new ResizeObserver(entries=>{for(const entry of entries){if(!entry.target.isConnected||!entry.contentRect.height)continue;const value=Math.ceil(entry.contentRect.height)+'px';if(document.documentElement.style.getPropertyValue('--ea-caption-height')===value)continue;document.documentElement.style.setProperty('--ea-caption-height',value);requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}});
 function scene(src){
  if(src&&(/no-photo|placeholder/i.test(src)||!/^\/(?!\/)/.test(src)))src='';
  src=src||'';if(current===src)return;current=src;const token=++request;
  if(!src){layers.forEach(l=>l.classList.remove('is-visible'));return;}
  const picture=new Image();picture.decoding='async';picture.src=src;
  const reveal=()=>{if(token!==request)return;const next=1-active;layers[next].style.backgroundImage=`url(${JSON.stringify(src)})`;layers[next].classList.add('is-visible');layers[active].classList.remove('is-visible');active=next;};
  picture.decode().then(reveal).catch(()=>{if(picture.complete&&picture.naturalWidth)reveal();});
 }
 function route(path,image){
  document.body.dataset.sceneView=path.startsWith('/work/')?'work':path.startsWith('/agency/')?'agency':path==='/catalog'?'catalog':path==='/about'?'about':path==='/playground'?'gallery':'home';
  if(path==='/'&&homeScene!==null)scene(homeScene);else if(image)scene(image);else if(path==='/about'||path==='/playground')scene('');
 }
 route(location.pathname,document.body.dataset.scene||'');
 window.addEventListener('ea:work',event=>{homeScene=event.detail.image||'';if(location.pathname==='/')scene(homeScene);});
 window.addEventListener('ea:route',event=>{route(event.detail.path,event.detail.image);schedule();});
 // In a gallery the photograph being viewed changes the entire canvas.
 let timer;
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(observePictures,100);};
 function observePictures(){
  captionObserver.disconnect();
  const caption=document.querySelector('.ea-work-caption');if(caption)captionObserver.observe(caption);
  observer?.disconnect();
  const pictures=[...document.querySelectorAll('.pm-hero img,.pm-tile img,.agency-content .work-cover img,.pg-tile img')];
  if(!pictures.length)return;
  observer=new IntersectionObserver(entries=>{
   if(!['work','agency','gallery'].includes(document.body.dataset.sceneView))return;
   const visible=entries.filter(e=>e.isIntersecting&&e.intersectionRatio>.45).sort((a,b)=>b.intersectionRatio-a.intersectionRatio);
   if(visible.length){const img=visible[0].target;const raw=img.getAttribute('src');if(raw)scene(raw);}
  },{threshold:[.45,.65,.85],root:document.querySelector('.pr-scroll.is-detail')||null});
  pictures.forEach(p=>observer.observe(p));
 }
 new MutationObserver(changes=>{if(changes.some(c=>[...c.addedNodes].some(n=>n.nodeType===1&&!(n.matches?.('.orbit-sec,.orbit-ch-in,.orbit-lines')))))schedule();}).observe(document.getElementById('root')||document.getElementById('content'),{childList:true,subtree:true});
 document.addEventListener('pointerover',event=>{const card=event.target.closest('.company-card,.work-card');if(card&&!card.contains(event.relatedTarget)){const img=card.querySelector('img');if(img)scene(img.getAttribute('src'));}});
 document.addEventListener('focusin',event=>{const img=event.target.closest('.company-card,.work-card')?.querySelector('img');if(img)scene(img.getAttribute('src'));});
 observePictures();
})();
