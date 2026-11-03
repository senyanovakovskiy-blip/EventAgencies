const easing = 'cubic-bezier(.22,1,.36,1)';
const rect = element => {
  const r = element.getBoundingClientRect();
  return {x:r.x, y:r.y, width:r.width, height:r.height};
};
const pixels = image => ({width:image?.naturalWidth || (image?.tagName === 'CANVAS' && image.width), height:image?.naturalHeight || (image?.tagName === 'CANVAS' && image.height)});
function fit(box, ratio) {
  const width = Math.min(box.width, box.height * ratio), height = width / ratio;
  return {x:box.x + (box.width-width)/2, y:box.y + (box.height-height)/2, width, height};
}
function photoRect(image) {
  const size = pixels(image);
  if(!size.width)return null;
  const box=rect(image), ratio=size.width/size.height;
  // A cropped cover cannot expand from a different visible composition.
  if(getComputedStyle(image).objectFit==='cover'&&Math.abs(box.width/box.height-ratio)>.02)return null;
  return fit(box,ratio);
}
const inView = box => box && box.width > 0 && box.height > 0 && box.y < innerHeight && box.y + box.height > 0 && box.x < innerWidth && box.x + box.width > 0;
function snapshot(image) {
  const size = pixels(image);
  if (!size.width) return null;
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0);
  return canvas;
}
function place(node, box) {
  Object.assign(node.style, {left:box.x+'px', top:box.y+'px', width:box.width+'px', height:box.height+'px', transform:'none', opacity:'1'});
}
function transform(from, to) {
  return `translate(${from.x-to.x}px,${from.y-to.y}px) scale(${from.width/to.width},${from.height/to.height})`;
}

export function createPhotoViewer({media, rootRef, onPreviewScrollLock, onPreviewScrollRestore, onIndex}) {
  const photos = media.map((item,index)=>({...item,index})).filter(item=>item.type==='image'&&!item.live);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cache = new Map(), animations = new Set();
  let dialog, stage, backdrop, count, status, closeButton, canvas, current=0, requested=0;
  let phase='closed', epoch=0, disposed=false, loadingTimer, unlock, opener, hidden=[], pointers=new Map(), swipe;
  let width=innerWidth, height=innerHeight, suppressClickUntil=0;
  const small = () => innerWidth <= 900;
  const tile = index => rootRef.current?.querySelector(`[data-media-index="${photos[index].index}"]`);
  const tilePhoto = index => tile(index)?.querySelector('.ea-photo-preview') || tile(index)?.querySelector('img');
  const destination = node => fit(rect(stage), node.width/node.height);
  const animate = (node, frames, duration) => {
    if (reduced.matches || !node.animate) return Promise.resolve();
    const animation = node.animate(frames,{duration,easing,fill:'both'});
    animations.add(animation);
    return animation.finished.catch(()=>{}).finally(()=>{animations.delete(animation);animation.cancel();});
  };
  const cancelAnimations = () => { for (const animation of animations) animation.cancel(); animations.clear(); };
  const restoreHidden = () => { hidden.forEach(([node,value])=>node.style.visibility=value); hidden=[]; };
  const hideTile = index => {
    for (const node of tile(index)?.querySelectorAll('img,.ea-photo-preview') || []) {
      hidden.push([node,node.style.visibility]); node.style.visibility='hidden';
    }
  };
  function decorate(node,index) {
    node.className='ea-gallery-photo'; node.dataset.index=String(index);
    node.setAttribute('role','img'); node.setAttribute('aria-label',photos[index].alt||photos[index].title||'Фотография проекта');
    return node;
  }
  function label() {
    count.textContent=`${current+1} / ${photos.length}`;
    dialog.dataset.index=String(current);
    dialog.setAttribute('aria-label',photos[current].title||'Фотографии проекта');
    onIndex(photos[current].index);
  }
  function load(index) {
    if (cache.has(index)) return cache.get(index);
    const image = new Image(); image.decoding='async';
    const original = tile(index)?.querySelector('img');
    image.src = original?.getAttribute('src') || photos[index].src;
    const promise = image.decode().then(()=>image).catch(error=>{cache.delete(index);throw error;});
    cache.set(index,promise);
    return promise;
  }
  function warm() {
    if (navigator.connection?.saveData || photos.length<2) return;
    for (const delta of [-1,1]) load((current+delta+photos.length)%photos.length).catch(()=>{});
  }
  function freezePage() {
    const home=rootRef.current?.closest('.home'), scroll=rootRef.current?.closest('.pr-scroll');
    const top=scrollY, detailTop=scroll?.scrollTop||0, mobile=small();
    const saved=[];
    const change=(node,values)=>{if(!node)return;for(const [key,value] of Object.entries(values)){saved.push([node,key,node.style[key]]);node.style[key]=value;}};
    const background=[...document.body.children].filter(node=>!['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node=>[node,node.inert]);
    background.forEach(([node])=>node.inert=true);
    if(!mobile)onPreviewScrollLock?.();
    const gap=innerWidth-document.documentElement.clientWidth;
    if(gap)change(document.body,{paddingRight:parseFloat(getComputedStyle(document.body).paddingRight)+gap+'px'});
    change(document.documentElement,{overflow:'hidden',scrollBehavior:'auto'});
    change(document.body,{overflow:'hidden'});
    if(mobile&&home){
      const fullHeight=home.scrollHeight;
      change(document.body,{height:fullHeight+'px'});
      change(home,{position:'fixed',top:-top+'px',left:'0',right:'0',bottom:'auto',width:'100%',height:fullHeight+'px'});
    }else if(mobile)change(document.body,{position:'fixed',top:-top+'px',left:'0',right:'0',width:'100%'});
    else change(scroll,{overflow:'hidden'});
    return ()=>{
      for(const [node,key,value] of saved.reverse())node.style[key]=value;
      background.forEach(([node,value])=>node.inert=value);
      if(mobile)window.scrollTo({top,behavior:'instant'});
      else if(onPreviewScrollRestore)onPreviewScrollRestore(detailTop);
      else if(scroll)scroll.scrollTop=detailTop;
    };
  }
  function cleanup(focus=true) {
    ++epoch;clearTimeout(loadingTimer);cancelAnimations();restoreHidden();
    dialog?.remove();dialog=null;canvas=null;phase='closed';pointers.clear();swipe=null;
    unlock?.();unlock=null;
    window.removeEventListener('keydown',key,true);
    window.removeEventListener('popstate',route,true);
    window.removeEventListener('resize',resize);
    reduced.removeEventListener('change',motion);
    if(!disposed)onIndex(null);
    if(focus&&opener?.isConnected)opener.focus({preventScroll:true});
  }
  function button(label,text,action,className='') {
    const node=document.createElement('button');node.type='button';node.className=className;
    node.setAttribute('aria-label',label);node.textContent=text;node.addEventListener('click',action);return node;
  }
  function build() {
    dialog=document.createElement('div');dialog.className='ea-gallery';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;
    backdrop=document.createElement('div');backdrop.className='ea-gallery-backdrop';backdrop.setAttribute('aria-hidden','true');
    stage=document.createElement('div');stage.className='ea-gallery-stage';
    closeButton=button('Закрыть фотографии','Закрыть ×',close,'ea-gallery-close');
    const bar=document.createElement('div');bar.className='ea-gallery-bar';
    count=document.createElement('span');count.className='ea-gallery-count';count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');
    status=document.createElement('span');status.className='ea-gallery-status';status.setAttribute('role','status');
    const prev=button('Предыдущая фотография','←',()=>step(-1));
    const next=button('Следующая фотография','→',()=>step(1));
    prev.hidden=next.hidden=photos.length<2;
    bar.append(prev,count,next);dialog.append(backdrop,stage,closeButton,bar,status);
    dialog.addEventListener('click',event=>{if(performance.now()<suppressClickUntil)return;if(event.target===backdrop||event.target===stage)close();});
    dialog.addEventListener('pointerdown',pointerDown);dialog.addEventListener('pointerup',pointerUp);
    dialog.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);swipe=null;});
    document.body.append(dialog);
    window.addEventListener('keydown',key,true);window.addEventListener('popstate',route,true);
    window.addEventListener('resize',resize);reduced.addEventListener('change',motion);
  }
  async function open(index,node) {
    if(disposed||phase!=='closed')return;
    const photoIndex=photos.findIndex(item=>item.index===index);
    if(photoIndex<0)return;
    current=requested=photoIndex;opener=node;phase='opening';const token=++epoch;
    const source=tilePhoto(current), from=source&&photoRect(source);
    canvas=decorate(snapshot(source)||document.createElement('canvas'),current);
    const ready=!!pixels(source).width;
    unlock=freezePage();build();label();width=innerWidth;height=innerHeight;
    closeButton.focus({preventScroll:true});
    if(!ready){
      status.textContent='Загружаем фото…';
      try{const image=await load(current);if(token!==epoch)return;canvas=decorate(snapshot(image),current);}
      catch{if(token===epoch){status.textContent='Фото не загрузилось. Попробуйте ещё раз.';phase='idle';}return;}
    }
    if(token!==epoch)return;
    status.textContent='';dialog.append(canvas);const to=destination(canvas);place(canvas,to);hideTile(current);
    await Promise.all([
      animate(backdrop,[{opacity:0},{opacity:1}],small()?340:440),
      animate(canvas,inView(from)?[{transform:transform(from,to)},{transform:'none'}]:[{opacity:0,transform:'scale(.985)'},{opacity:1,transform:'none'}],small()?440:580)
    ]);
    if(token!==epoch)return;
    restoreHidden();phase='idle';warm();
    // Keep the decoded opening frame while a sharper version is fetched.
    const openingCanvas=canvas, openingIndex=current;
    load(current).then(image=>{
      if(phase!=='idle'||canvas!==openingCanvas||current!==openingIndex||!dialog)return;
      const context=canvas.getContext('2d');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;context.drawImage(image,0,0);
    }).catch(()=>{});
    if(requested!==current)showRequested();
  }
  function step(delta) {
    if(phase==='closed'||phase==='closing'||photos.length<2)return;
    requested=(requested+delta+photos.length)%photos.length;
    if(phase==='idle'||phase==='loading')showRequested();
  }
  async function showRequested() {
    const index=requested, token=++epoch;
    clearTimeout(loadingTimer);status.textContent='';
    if(index===current){phase='idle';return;}
    phase='loading';
    loadingTimer=setTimeout(()=>{if(token===epoch)status.textContent='Загружаем фото…';},350);
    let image;
    try{image=await load(index);}catch{
      if(token===epoch){clearTimeout(loadingTimer);status.textContent='Фото не загрузилось. Попробуйте ещё раз.';requested=current;phase='idle';}return;
    }
    if(token!==epoch||!dialog)return;
    clearTimeout(loadingTimer);status.textContent='';phase='switching';
    const previous=canvas, next=decorate(snapshot(image),index);
    const direction=(index-current+photos.length)%photos.length<=photos.length/2?1:-1;
    current=index;canvas=next;dialog.append(next);place(next,destination(next));label();
    previous?.setAttribute('aria-hidden','true');
    const duration=small()?360:460;
    await Promise.all([
      previous&&animate(previous,[{opacity:1,transform:'none'},{opacity:0,transform:`translateX(${-direction*10}px) scale(.995)`}],duration),
      animate(next,[{opacity:0,transform:`translateX(${direction*12}px) scale(.99)`},{opacity:1,transform:'none'}],duration)
    ]);
    if(token!==epoch)return;
    previous?.remove();phase='idle';warm();if(requested!==current)showRequested();
  }
  async function close() {
    if(phase==='closed'||phase==='closing')return;
    const token=++epoch;phase='closing';clearTimeout(loadingTimer);status.textContent='';
    const nodes=[...dialog.querySelectorAll('.ea-gallery-photo')];
    const chosen=nodes.sort((a,b)=>Number(getComputedStyle(b).opacity)-Number(getComputedStyle(a).opacity))[0];
    const from=chosen&&rect(chosen), shade=getComputedStyle(backdrop).opacity;
    cancelAnimations();restoreHidden();nodes.forEach(node=>{if(node!==chosen)node.remove();});
    let frames=[{opacity:1,transform:'none'},{opacity:0,transform:'scale(.985)'}];
    if(chosen){
      place(chosen,from);const index=Number(chosen.dataset.index), source=tilePhoto(index), to=source&&photoRect(source);
      if(inView(to)){hideTile(index);frames=[{transform:'none'},{transform:transform(to,from)}];}
    }
    await Promise.all([animate(backdrop,[{opacity:shade},{opacity:0}],small()?300:400),chosen&&animate(chosen,frames,small()?360:480)]);
    if(token===epoch)cleanup();
  }
  function key(event) {
    if(!dialog)return;
    if(['Escape','ArrowRight','ArrowLeft','Tab'].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation();
      if(event.key==='Escape')close();
      else if(event.key==='ArrowRight')step(1);
      else if(event.key==='ArrowLeft')step(-1);
      else{
        const buttons=[...dialog.querySelectorAll('button:not([hidden])')];
        const index=buttons.indexOf(document.activeElement), next=(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length;
        buttons[next].focus({preventScroll:true});
      }
    }
  }
  function pointerDown(event) {
    if(event.pointerType==='mouse'||event.target.closest('button'))return;
    pointers.set(event.pointerId,true);
    try{dialog.setPointerCapture(event.pointerId);}catch{}
    swipe=pointers.size===1?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;
  }
  function pointerUp(event) {
    pointers.delete(event.pointerId);const start=swipe;swipe=null;
    if(!start||start.id!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.abs(dx)>=42&&Math.abs(dx)>Math.abs(dy)*1.3){suppressClickUntil=performance.now()+450;event.preventDefault();step(dx<0?1:-1);}
  }
  function resize() {
    if(!dialog||width===innerWidth&&height===innerHeight)return;
    width=innerWidth;height=innerHeight;
    if(phase==='closing'){cleanup();return;}
    cancelAnimations();for(const node of dialog.querySelectorAll('.ea-gallery-photo'))place(node,destination(node));
  }
  function motion(){if(reduced.matches)cancelAnimations();}
  function route(){if(dialog)cleanup(false);}
  return {open,suspend(){cleanup(false);},destroy(){disposed=true;cleanup(false);cache.clear();}};
}
