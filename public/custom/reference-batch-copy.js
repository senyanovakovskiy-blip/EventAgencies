/** A copy belongs to one panel and one ordered selection, never to a later render. */
export function setupReferenceBatchCopy({bar,getSelectedCards}){
 const doc=bar.ownerDocument,view=doc.defaultView;
 const button=bar.querySelector('[data-batch-copy]'),status=bar.querySelector('[data-batch-copy-status]');
 const manual=bar.querySelector('[data-batch-copy-manual]'),field=manual.querySelector('textarea'),select=manual.querySelector('button');
 let destroyed=false,revision=0,pending=false,disabled=true,snapshot='';
 function selection(){
  const cards=getSelectedCards();
  // Read only public headings and slugs: no card body, notes, contacts or return URL.
  const text=cards.map(card=>{
   const title=card.querySelector('h3')?.textContent.trim()||'Сохранённая работа';
   const url=new URL('/work/'+encodeURIComponent(card.dataset.savedReference),view.location.origin);
   return title+'\n'+url.href;
  }).join('\n\n');
  return {text,count:cards.length};
 }
 function reset(){
  revision++;pending=false;status.textContent='';manual.hidden=true;field.value='';
 }
 function sync({unavailable=disabled}={}){
  if(destroyed)return;
  const next=selection();
  if(next.text!==snapshot||unavailable){reset();snapshot=next.text;}
  disabled=unavailable||!next.count;
  button.disabled=disabled||pending;button.setAttribute('aria-busy',String(pending));
  button.textContent=pending?'Копируем…':'Скопировать ссылки'+(next.count?' · '+next.count:'');
  select.disabled=disabled;
 }
 function current(operation,text){
  return !destroyed&&operation===revision&&!disabled&&bar.isConnected&&button.isConnected&&status.isConnected&&manual.isConnected&&bar.contains(button)&&bar.contains(status)&&bar.contains(manual)&&selection().text===text;
 }
 async function copy(event){
  if(destroyed||event.isTrusted===false||button.disabled||!bar.isConnected)return;
  sync();if(button.disabled)return;
  event.preventDefault();reset();
  const text=snapshot,operation=revision,total=getSelectedCards().length;
  pending=true;sync();
  try{
   const clipboard=view.navigator.clipboard;
   if(typeof clipboard?.writeText!=='function')throw new Error('clipboard_unavailable');
   await clipboard.writeText(text);
   if(current(operation,text))status.textContent='Скопировано работ: '+total+'. Названия и ссылки готовы для вставки.';
  }catch{
   if(!current(operation,text))return;
   field.value=text;manual.hidden=false;
   // Async completion never moves focus, even if the user has left this panel.
   status.textContent='Автоматическое копирование недоступно. Скопируйте текст из поля ниже.';
  }finally{
   if(current(operation,text)){pending=false;sync();}
  }
 }
 function selectText(event){
  if(destroyed||event.isTrusted===false||!bar.isConnected||manual.hidden)return;
  sync();if(disabled||manual.hidden)return;
  field.focus({preventScroll:true});field.select();
 }
 button.addEventListener('click',copy);select.addEventListener('click',selectText);
 return {
  sync,reset,
  destroy(){
   if(destroyed)return;
   destroyed=true;reset();button.disabled=true;
   button.removeEventListener('click',copy);select.removeEventListener('click',selectText);
  }
 };
}
