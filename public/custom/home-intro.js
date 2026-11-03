const overlay=document.getElementById('ea-intro');
const root=document.getElementById('root');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let stopped=false,animations=[],timers=new Set();
const pause=ms=>new Promise(resolve=>{const id=setTimeout(()=>{timers.delete(id);resolve();},ms);timers.add(id);});
function finish(){
 if(stopped)return;stopped=true;
 const hadFocus=overlay?.contains(document.activeElement);
 animations.forEach(a=>a.cancel());
 delete document.documentElement.dataset.eaIntro;
 root?.removeAttribute('inert');
 clearTimeout(window.__eaIntroWatchdog);
 window.__eaResolveIntro?.();
 overlay?.remove();
 try{sessionStorage.setItem('ea-large-intro-v1','1');}catch{}
 if(hadFocus)root?.querySelector('a,button')?.focus({preventScroll:true});
 document.removeEventListener('keydown',key);
 motion.removeEventListener('change',onMotion);
}
function key(event){if(event.key==='Escape'){event.preventDefault();finish();}if(event.key==='Tab'&&!stopped){event.preventDefault();document.getElementById('ea-intro-skip')?.focus();}}
function onMotion(){if(motion.matches)finish();}
async function run(){
 await window.__eaNativeIntroDone;
 if(!overlay||document.documentElement.dataset.eaIntro!=='pending'){overlay?.remove();return;}
 root?.setAttribute('inert','');
 overlay.querySelector('button').addEventListener('click',finish);
 document.addEventListener('keydown',key);
 motion.addEventListener('change',onMotion);
 const bailout=setTimeout(finish,10000);
 try{
  const projects=JSON.parse(document.getElementById('ea-intro-projects').textContent);
  const stage=overlay.querySelector('.intro-stage');
  const status=overlay.querySelector('#ea-intro-status');
  let loaded=0;
  const photos=projects.map(p=>{const img=new Image();img.alt='';img.decoding='async';img.src=innerWidth<650?p.mobile:p.src;return {img,p,ready:img.decode().then(()=>{loaded++;if(!stopped)status.textContent='Фотографии '+loaded+' / '+projects.length;return true;},()=>false)};});
  if(motion.matches){await Promise.race([photos[0].ready,pause(350)]);finish();return;}
  await pause(450);
  let visible=0,previous=null;
  const ambient=document.createElement('div');ambient.className='intro-ambient';ambient.setAttribute('aria-hidden','true');overlay.prepend(ambient);
  for(let index=0;index<photos.length;index++){
   const photo=photos[index];const ready=await Promise.race([photo.ready,pause(1500).then(()=>false)]);
   if(stopped)return;if(!ready)continue;
   const glow=document.createElement('img');glow.src=photo.img.src;glow.alt='';ambient.append(glow);
   animations.push(glow.animate([{opacity:0},{opacity:1}],{duration:1000,fill:'forwards'}));
   if(ambient.children.length>2)ambient.firstElementChild.remove();
   if(previous){const old=previous;const exit=old.animate([{opacity:1,transform:old.style.transform},{opacity:0,transform:'translate3d(-3%, -2%, -160px) rotateY(5deg) scale(.94)',filter:'blur(4px)'}],{duration:850,easing:'ease-in-out',fill:'forwards'});animations.push(exit);exit.finished.then(()=>old.remove(),()=>{});}
   const card=document.createElement('figure');card.className='intro-photo';card.append(photo.img);
   const title=document.createElement('figcaption');title.textContent=photo.p.title;card.append(title);
   card.style.zIndex=String(index+1);stage.append(card);visible++;
   const angle=innerWidth<650?.6:(index%2===0?-1.4:1.4);
   const transform='translate3d(0,0,0) rotateX(2deg) rotateY('+(index%2===0?-3:3)+'deg) rotateZ('+angle+'deg)';card.style.transform=transform;previous=card;
   const a=card.animate([{opacity:0,transform:'translate3d(4%,45px,100px) rotateX(7deg) rotateY(-9deg) rotateZ(-2deg) scale(.96)'},{opacity:1,transform}],{duration:1050,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});animations.push(a);
   status.textContent=String(visible).padStart(2,'0')+' / '+String(photos.length).padStart(2,'0');
   await pause(1200);
   // Keep only two large cards; the entrance never becomes a wall of small tiles.
   while(stage.children.length>2)stage.firstElementChild.remove();
  }
  if(stopped)return;
  await pause(300);
  if(stopped)return;
  const fade=overlay.animate([{opacity:1},{opacity:0}],{duration:650,easing:'ease-in-out',fill:'forwards'});animations.push(fade);
  // Reveal the actual home photograph underneath the fading introduction.
  window.__eaResolveIntro?.();
  await fade.finished.catch(()=>{});
  finish();
 }catch{finish();}finally{clearTimeout(bailout);}
}
run();
