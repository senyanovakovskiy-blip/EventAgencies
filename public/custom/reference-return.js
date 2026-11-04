import {referenceProjectMarker} from './reference-batch-session.js';
import {PREVIOUS_PROJECT_KEY} from './project-copy-client.js';

const PROJECT_KEY='eventagencies-reference-return-project-v1',HISTORY_KEY='eaReferenceReturn';
const validSlug=value=>typeof value==='string'&&value.length<=200&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const validToken=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);

// The address contains a public work slug and an opaque project token only.
// Filters and the group selection keep using their existing tab-local stores.
function projectToken(create=false){
 try{
  const marker=referenceProjectMarker();if(marker===null)return null;
  const saved=JSON.parse(localStorage.getItem(PROJECT_KEY)||'null');
  if(saved?.version===1&&saved.marker===marker&&validToken(saved.token))return saved.token;
  if(!create)return null;
  const token=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(PROJECT_KEY,JSON.stringify({version:1,marker,token}));return token;
 }catch{return null;}
}
function targetFromHash(hash){
 const match=/^#work-references\/([a-z0-9-]+)\/([a-f0-9]{32})$/.exec(hash);
 return match&&validSlug(match[1])?{slug:match[1],token:match[2]}:null;
}

export function setupReferenceReturn(){
 if(location.pathname.replace(/\/$/,'')!=='/my-project')return null;
 let pending=null,frame=0,interacted=false;
 const route=()=>location.pathname+location.search+location.hash;
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;pending=null;}
 function begin(historyReturn=false){
  stop();interacted=false;
  let target=null;
  try{
   if(historyReturn){
    const saved=history.state?.[HISTORY_KEY];
    if(saved?.version===1&&saved.route===route()&&validSlug(saved.slug)&&validToken(saved.token))target={slug:saved.slug,token:saved.token};
   }
  }catch{}
  target ||= targetFromHash(location.hash);
  if(target||location.hash==='#work-references')pending={target,marker:referenceProjectMarker()};
 }
 function workLink(slug){
  const token=projectToken(true),from='/my-project#work-references'+(token&&validSlug(slug)?'/'+slug+'/'+token:'');
  return '/work/'+encodeURIComponent(slug)+'?from='+encodeURIComponent(from);
 }
 function refreshLinks(){
  document.querySelectorAll('#work-references [data-saved-reference]').forEach(card=>{
   const slug=card.dataset.savedReference;if(!validSlug(slug))return;
   for(const link of card.querySelectorAll('a[href]')){
    const url=new URL(link.href,location.origin);
    if(url.origin===location.origin&&url.pathname==='/work/'+slug)link.href=workLink(slug);
   }
  });
 }
 function userIntent(event){if(event.isTrusted!==false){interacted=true;stop();}}
 for(const type of ['pointerdown','touchstart','wheel','keydown','input','click'])addEventListener(type,userIntent,{capture:true,passive:true});
 document.addEventListener('click',event=>{
  // Observe a normal departure without preventing or replacing navigation.
  if(event.isTrusted===false||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest('a[href]'),card=link?.closest('#work-references [data-saved-reference]');
  if(!card||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
  try{
   const url=new URL(link.href),from=new URL(url.searchParams.get('from')||'/',location.origin),target=targetFromHash(from.hash);
   if(url.origin!==location.origin||url.pathname!=='/work/'+card.dataset.savedReference||from.origin!==location.origin||from.pathname!=='/my-project'||!target)return;
   const previous=history.state;if(previous!==null&&(typeof previous!=='object'||Array.isArray(previous)))return;
   // Preserve the native history entry, its URL and every unrelated state field.
   history.replaceState({...previous,[HISTORY_KEY]:{version:1,route:route(),...target}},'');
  }catch{}
 });
 function projectChanged(){
  stop();try{localStorage.removeItem(PROJECT_KEY);}catch{}
  refreshLinks();
 }
 document.addEventListener('ea:project-started',projectChanged);
 document.addEventListener('ea:project-copy-restored',projectChanged);
 addEventListener('storage',event=>{
  try{if(event.storageArea!==localStorage||![PROJECT_KEY,PREVIOUS_PROJECT_KEY,null].includes(event.key))return;}catch{return;}
  stop();refreshLinks();
 });
 function message(host,text){
  let node=host.querySelector('[data-reference-return-message]');
  if(!node){node=document.createElement('p');node.className='reference-return-message';node.dataset.referenceReturnMessage='';node.setAttribute('role','status');(host.querySelector('.reference-heading')||host.querySelector('h2'))?.after(node);}
  node.textContent=text;
 }
 function rendered(host,{failed=false}={}){
  if(!pending||interacted)return;
  if(frame)cancelAnimationFrame(frame);
  const request=pending;
  frame=requestAnimationFrame(()=>{
   frame=0;
   if(pending!==request||interacted||!host.isConnected||host.inert)return;
   pending=null;
   if(request.marker===null||request.marker!==referenceProjectMarker())return;
   const target=request.target;
   if(target&&target.token!==projectToken()){
    message(host,'Проект изменился или место возврата больше недоступно. Показана текущая подборка.');return;
   }
   const card=target?[...host.querySelectorAll('[data-saved-reference]')].find(node=>node.dataset.savedReference===target.slug):null;
   const visible=card&&!card.hidden;
   if(target&&!visible)message(host,failed?'Не удалось загрузить сохранённый пример. Попробуйте загрузить подборку снова.':card?'Этот пример скрыт текущими фильтрами. Фильтры сохранены — измените их, чтобы найти работу.':'Этот пример больше не сохранён или недоступен. Вы вернулись к разделу примеров.');
   const destination=visible?card:host;
   let offset=110;
   const bar=host.querySelector('.reference-batch-bar');
   if(visible&&bar&&getComputedStyle(bar).position==='sticky')offset=Math.max(offset,(parseFloat(getComputedStyle(bar).top)||0)+bar.getBoundingClientRect().height+16);
   scrollTo({top:Math.max(0,scrollY+destination.getBoundingClientRect().top-offset),behavior:'instant'});
   if(visible){card.dataset.referenceReturned='true';card.querySelector('h3 a')?.focus({preventScroll:true});}
   else{host.setAttribute('tabindex','-1');host.focus({preventScroll:true});}
  });
 }
 let historyReturn=false;try{historyReturn=['back_forward','reload'].includes(performance.getEntriesByType('navigation')[0]?.type);}catch{}
 begin(historyReturn);
 return {workLink,rendered,suspend:stop,resume:()=>begin(true)};
}
