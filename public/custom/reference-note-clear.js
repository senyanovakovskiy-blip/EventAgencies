import {KEY} from './project-store.js';

const validSlug=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const noteKey=field=>field&&validSlug(field.dataset.workNote)&&validSlug(field.dataset.noteWork)?field.dataset.workNote+'/'+field.dataset.noteWork:null;
const errorText=code=>({
 changed:'Заметка уже изменилась. Показан текущий текст — повторите действие при необходимости.',
 storage_error:'Не удалось сохранить изменение. Разрешите хранение данных сайта и повторите попытку.',
 sending:'Заявка отправляется. Дождитесь результата, затем измените заметку.',
 unsaved:'Есть несохранённые изменения. Сначала сохраните текущий текст и повторите действие.',
 invalid:'Не удалось изменить эту заметку. Повторите действие.'
}[code]||'Не удалось изменить эту заметку. Повторите действие.');

/** Keep a page-local undo only after the project confirms a saved edit. */
export function setupReferenceNoteClear({root=document}={}){
 const doc=root.ownerDocument||root,view=doc.defaultView;
 const previousTexts=new Map(),applyingKeys=new Set();
 let destroyed=false;
 const entries=host=>[...(host?.matches?.('.reference-note-entry')?[host]:[]),...(host?.querySelectorAll?.('.reference-note-entry')||[])];
 const parts=entry=>({field:entry.querySelector('textarea[data-work-note]'),clear:entry.querySelector('[data-clear-reference-note]'),undo:entry.querySelector('[data-undo-reference-note-clear]'),status:entry.querySelector('[data-reference-note-clear-status]')});
 function updateEntry(entry){
  const {field,clear,undo}=parts(entry),key=noteKey(field);
  const canUndo=!destroyed&&Boolean(key&&previousTexts.has(key)&&field.value==='');
  const editable=Boolean(field&&!field.disabled&&!field.readOnly);
  if(clear)clear.disabled=destroyed||!key||!editable||field.value.length===0;
  if(undo){
   if(!canUndo&&doc.activeElement===undo&&field?.isConnected)field.focus({preventScroll:true});
   undo.hidden=!canUndo;undo.disabled=!canUndo||!editable;
  }
 }
 function invalidate(key,message='Возврат очищенного текста больше недоступен.'){
  if(!previousTexts.delete(key))return;
  for(const entry of entries(root)){
   const {field,status}=parts(entry);if(noteKey(field)!==key)continue;
   if(status)status.textContent=message;
   updateEntry(entry);
  }
 }
 function sync(host=root){
  if(destroyed)return;
  for(const field of root.querySelectorAll('textarea[data-work-note]')){
   const key=noteKey(field);if(key&&previousTexts.has(key)&&field.value!=='')invalidate(key);
  }
  for(const entry of entries(host))updateEntry(entry);
 }
 function resetUndo(){
  if(destroyed)return;
  for(const key of [...previousTexts.keys()])invalidate(key,'');
  sync();
 }
 function noteChanged(event){
  if(destroyed||!event.target?.matches?.('textarea[data-work-note]'))return;
  const key=noteKey(event.target);if(!key||applyingKeys.has(key))return;
  invalidate(key);sync();
 }
 function storageChanged(event){if(event.key===KEY||event.key===null)resetUndo();}
 function requestEdit(field,key,expected,value){
  const detail={expected,value,result:null};
  applyingKeys.add(key);
  try{
   const EventClass=view?.CustomEvent||CustomEvent;
   field.dispatchEvent(new EventClass('ea:reference-note-edit',{bubbles:true,detail}));
  }catch{detail.result={ok:false,code:'invalid'};}
  finally{applyingKeys.delete(key);}
  return detail.result?.ok===true?{ok:true}:{ok:false,code:detail.result?.code||'invalid'};
 }
 function handleClick(event){
  const button=event.target?.closest?.('[data-clear-reference-note],[data-undo-reference-note-clear]');
  if(destroyed||event.isTrusted===false||!button||!root.contains(button)||button.disabled)return;
  const entry=button.closest('.reference-note-entry');if(!entry)return;
  const {field,undo,status}=parts(entry),key=noteKey(field);
  if(!key||!status||field.disabled||field.readOnly)return;
  event.preventDefault();
  const restoring=button.hasAttribute('data-undo-reference-note-clear');
  if(restoring){
   if(!previousTexts.has(key)||field.value!==''){sync();return;}
   const previous=previousTexts.get(key),result=requestEdit(field,key,'',previous);
   if(result.ok){
    previousTexts.delete(key);status.textContent='Текст возвращён.';sync();
    if(field.isConnected)field.focus({preventScroll:true});
   }else{
    sync();status.textContent=errorText(result.code);
   }
   return;
  }
  if(field.value===''){sync(entry);return;}
  const previous=field.value,result=requestEdit(field,key,previous,'');
  if(result.ok){
   previousTexts.set(key,previous);status.textContent='Текст очищен. Можно вернуть его, пока вы на этой странице.';sync();
   if(undo?.isConnected&&!undo.hidden&&!undo.disabled)undo.focus({preventScroll:true});
  }else{
   sync();status.textContent=errorText(result.code);
  }
 }
 root.addEventListener('click',handleClick);
 root.addEventListener('input',noteChanged);
 root.addEventListener('ea:work-note-updated',noteChanged);
 root.addEventListener('ea:project-copy-restored',resetUndo);
 view?.addEventListener('storage',storageChanged);
 sync();
 return {
  sync,
  getPendingNotes(){return Object.fromEntries(previousTexts);},
  destroy(){
   if(destroyed)return;
   resetUndo();destroyed=true;
   root.removeEventListener('click',handleClick);root.removeEventListener('input',noteChanged);
   root.removeEventListener('ea:work-note-updated',noteChanged);root.removeEventListener('ea:project-copy-restored',resetUndo);
   view?.removeEventListener('storage',storageChanged);applyingKeys.clear();
   for(const entry of entries(root))updateEntry(entry);
  }
 };
}
