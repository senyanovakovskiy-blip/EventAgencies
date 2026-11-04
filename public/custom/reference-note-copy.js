/** Copy a note only after its button is pressed; never change the project. */
export function setupReferenceNoteCopy({root=document}={}){
 const doc=root.ownerDocument||root,view=doc.defaultView;
 const pending=new WeakSet(),operations=new Set();
 let destroyed=false,syncQueued=false;
 const buttons=host=>[...(host?.matches?.('[data-copy-reference-note]')?[host]:[]),...(host?.querySelectorAll?.('[data-copy-reference-note]')||[])];
 const fieldFor=button=>button.closest('.reference-note-entry')?.querySelector('textarea[data-work-note]');
 function sync(host=root){
  if(destroyed)return;
  for(const button of buttons(host)){
   const field=fieldFor(button);
   button.disabled=pending.has(button)||!field||!field.value.trim();
  }
 }
 function scheduleSync(event){
  if(destroyed||syncQueued||!event.target?.matches?.('textarea[data-work-note]'))return;
  syncQueued=true;
  queueMicrotask(()=>{syncQueued=false;if(!destroyed)sync();});
 }
 function usable(operation){
  return !destroyed&&operation.button.isConnected&&operation.field.isConnected&&operation.status.isConnected&&root.contains(operation.button)&&operation.entry.contains(operation.field)&&operation.entry.contains(operation.status);
 }
 function removeFocusTracking(operation){
  doc.removeEventListener('focusin',operation.onFocus);
  doc.removeEventListener('pointerdown',operation.onPointer);
  view?.removeEventListener('blur',operation.onBlur);
 }
 async function copyNote(event){
  const button=event.target?.closest?.('[data-copy-reference-note]');
  if(destroyed||event.isTrusted===false||!button||!root.contains(button)||button.disabled||pending.has(button))return;
  const entry=button.closest('.reference-note-entry'),field=fieldFor(button),status=entry?.querySelector('[data-reference-note-copy-status]');
  if(!entry||!field||!status||!field.value.trim()){sync(entry||root);return;}
  event.preventDefault();
  const value=field.value;
  const operation={button,entry,field,status,focusLeft:false,focusStartedHere:entry.contains(doc.activeElement)};
  operation.onFocus=focusEvent=>{if(focusEvent.target!==doc.body&&!entry.contains(focusEvent.target))operation.focusLeft=true;};
  operation.onPointer=pointerEvent=>{if(!entry.contains(pointerEvent.target))operation.focusLeft=true;};
  operation.onBlur=()=>{operation.focusLeft=true;};
  doc.addEventListener('focusin',operation.onFocus);
  doc.addEventListener('pointerdown',operation.onPointer);
  view?.addEventListener('blur',operation.onBlur);
  operations.add(operation);pending.add(button);button.disabled=true;status.textContent='';
  try{
   const clipboard=view?.navigator?.clipboard;
   if(typeof clipboard?.writeText!=='function')throw new Error('clipboard_unavailable');
   await clipboard.writeText(value);
   if(usable(operation))status.textContent=field.value===value?'Заметка скопирована.':'Скопирован текст до последних правок.';
  }catch{
   if(!usable(operation))return;
   if(!field.value.trim()){
    status.textContent='Автоматическое копирование не удалось. Заметка теперь пуста — добавьте текст перед копированием.';
    return;
   }
   const hasFocus=typeof doc.hasFocus!=='function'||doc.hasFocus();
   const canSelect=!operation.focusLeft&&hasFocus&&(entry.contains(doc.activeElement)||(operation.focusStartedHere&&doc.activeElement===doc.body));
   let selected=false;
   if(canSelect){
    try{field.focus({preventScroll:true});field.select();selected=doc.activeElement===field;}catch{}
   }
   status.textContent=selected?'Автоматическое копирование недоступно. Текущий текст выделен — скопируйте его командой «Копировать».':'Автоматическое копирование недоступно. Выделите текст заметки и используйте команду «Копировать».';
  }finally{
   removeFocusTracking(operation);operations.delete(operation);pending.delete(button);
   if(!destroyed&&button.isConnected)sync(entry);
  }
 }
 root.addEventListener('click',copyNote);
 root.addEventListener('input',scheduleSync);
 sync();
 return {
  sync,
  destroy(){
   if(destroyed)return;
   destroyed=true;root.removeEventListener('click',copyNote);root.removeEventListener('input',scheduleSync);
   for(const operation of operations)removeFocusTracking(operation);
   operations.clear();
   for(const button of buttons(root))button.disabled=true;
  }
 };
}
