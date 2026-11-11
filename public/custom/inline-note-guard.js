import {KEY,readDraft,writeDraft,updateWorkNote,workNoteKey} from './project-store.js';

// All writes compare the exact value shown by the editor with the latest draft.
// Pending input lives in a dialog outside the parts of the page that are rebuilt.
export function setupInlineNoteGuard({document:doc,storage,marker,onSaved,canSave=()=>true}){
 const dialog=doc.createElement('dialog');dialog.className='project-note-editor';
 dialog.setAttribute('aria-labelledby','inline-note-conflict-title');
 dialog.innerHTML='<h2 id="inline-note-conflict-title">Заметка изменилась</h2><p data-conflict-message role="status"></p><label>Ваш текст<textarea data-conflict-local rows="5" maxlength="1000"></textarea></label><label>Текущий сохранённый текст<textarea data-conflict-current rows="5" readonly></textarea></label><div><button type="button" data-use-current>Открыть текущую и отбросить мой текст</button> <button type="button" data-save-local>Сохранить мой текст</button></div>';
 doc.body.append(dialog);
 const local=dialog.querySelector('[data-conflict-local]'),remote=dialog.querySelector('[data-conflict-current]'),message=dialog.querySelector('[data-conflict-message]'),save=dialog.querySelector('[data-save-local]');
 const baselines=new WeakMap();let pending=null,pageMarker=marker(),pageExisted=false;
 try{pageExisted=storage.getItem(KEY)!==null;}catch{}
 const fields=()=>[...doc.querySelectorAll('textarea[data-work-note]')];
 const identity=field=>({agency:field.dataset.workNote,work:field.dataset.noteWork,key:workNoteKey(field.dataset.workNote,field.dataset.noteWork)});
 const exists=()=>storage.getItem(KEY)!==null;
 const latest=()=>{const raw=storage.getItem(KEY);if(raw!==null){const value=JSON.parse(raw);if(!value||typeof value!=='object'||value.version!==1)throw Error('invalid project');}return readDraft(storage);};
 const register=field=>{if(!baselines.has(field)){let existed=pageExisted;try{existed=existed||exists();}catch{}baselines.set(field,{value:field.defaultValue,marker:pageMarker,existed});}return baselines.get(field);};
 function apply(key,value){
  for(const field of fields())if(identity(field).key===key){if(field.value!==value)field.value=value;field.defaultValue=value;baselines.set(field,{value,marker:pageMarker,existed:exists()});}
 }
 function describe(){
  const currentMarker=marker(),changedProject=pending.projectChanged||pending.marker===null||(currentMarker!==null&&currentMarker!==pending.marker);
  save.disabled=Boolean(changedProject||pending.blockUnsaved);
  message.textContent=pending.blockUnsaved?'В проекте есть несохранённые изменения. Скопируйте ваш текст перед закрытием окна и сначала сохраните проект.':changedProject?'Проект изменился или его не удалось определить. Ваш текст сохранён в этом окне: скопируйте его перед закрытием.':currentMarker===null?'Не удалось проверить проект. Ваш текст сохранён в этом окне; повторите попытку.':'Заметка изменена в другой вкладке. Выберите актуальный текст или сохраните свой.';
 }
 function conflict(field,base,current,projectChanged=false){
  if(pending)return;
  const {agency,work,key}=identity(field);
  pending={agency,work,key,marker:base.marker,existed:base.existed,baseline:base.value,current,projectChanged};local.value=field.value;remote.value=current;describe();
  if(!dialog.open)dialog.showModal();
 }
 function update(current){
  const currentMarker=marker();if(currentMarker!==null)pageMarker=currentMarker;pageExisted=exists();
  for(const field of fields()){
   const key=identity(field).key,value=current.workNotes[key]||'';
   if(pending?.key===key)continue;
   const base=register(field);if(field.value!==base.value)continue;
   if(field.value!==value)field.value=value;field.defaultValue=value;baselines.set(field,{value,marker:pageMarker,existed:exists()});
  }
 }
 function reconcile(current,{projectChanged=false}={}){
  if(pending&&(projectChanged||(marker()!==null&&marker()!==pending.marker))){pending.projectChanged=true;describe();}
  const active=doc.activeElement,all=fields(),candidate=all.find(field=>field.value!==register(field).value)||all.find(field=>field===active);
  if(candidate&&!pending){const base=register(candidate),value=current.workNotes[identity(candidate).key]||'',currentMarker=marker(),changed=projectChanged||base.marker===null||(currentMarker!==null&&base.marker!==currentMarker);
   if(changed||currentMarker===null||base.value!==value||candidate.value!==base.value)conflict(candidate,base,value,changed);
  }
  update(current);
 }
 function input(field){
  const base=register(field),{agency,work,key}=identity(field);let current;
  try{
   current=latest();const currentMarker=marker(),value=current.workNotes[key]||'',projectChanged=base.marker===null||(currentMarker!==null&&currentMarker!==base.marker)||(base.existed&&!exists());
   if(pending)return {ok:false,current};
   if(currentMarker===null){conflict(field,base,value);describe();return {ok:false,current};}
   if(projectChanged||value!==base.value){conflict(field,base,value,projectChanged);return {ok:false,current};}
   const next=writeDraft(storage,updateWorkNote(current,agency,work,field.value));pageMarker=currentMarker;pageExisted=true;apply(key,field.value);return {ok:true,current:next};
  }catch{conflict(field,base,current?.workNotes[key]||base.value);message.textContent='Не удалось сохранить. Ваш текст остался в этом окне; проверьте доступ к хранилищу и повторите выбор.';return {ok:false,current:current||null};}
 }
 function resetBaseline(field,value=field.value){field.defaultValue=value;baselines.set(field,{value,marker:pageMarker,existed:exists()});}
 function guarded(key){return Boolean(pending&&pending.key===key);}
 function defer(field){const base=register(field);conflict(field,base,base.value);if(pending){pending.blockUnsaved=true;describe();}}
 function check(field,expected){
  const base=register(field),current=latest(),value=current.workNotes[identity(field).key]||'',currentMarker=marker(),changed=base.marker===null||(currentMarker!==null&&currentMarker!==base.marker)||(base.existed&&!exists());
  if(pending)return false;
  if(changed||currentMarker===null||value!==expected||value!==base.value){conflict(field,base,value,changed);return false;}
  return true;
 }
 dialog.querySelector('[data-use-current]').addEventListener('click',()=>{
  if(!canSave()){pending.blockUnsaved=true;describe();}
  if(pending.blockUnsaved){const key=pending.key,value=pending.baseline;pending=null;dialog.close();for(const field of fields())if(identity(field).key===key)field.value=value;return;}
  try{const current=latest();pageMarker=marker();const key=pending.key;pending=null;dialog.close();apply(key,current.workNotes[key]||'');onSaved(current,key);}catch{message.textContent='Не удалось загрузить текущую заметку. Скопируйте ваш текст и повторите попытку.';}
 });
 save.addEventListener('click',()=>{
  if(!canSave()){pending.blockUnsaved=true;describe();return;}
  if(pending.blockUnsaved)return;
  try{
   const current=latest(),currentMarker=marker(),value=current.workNotes[pending.key]||'';
   if(currentMarker===null){message.textContent='Не удалось проверить проект. Ваш текст остался в этом окне; повторите попытку.';return;}
   if(pending.projectChanged||pending.marker===null||currentMarker!==pending.marker||(pending.existed&&!exists())){pending.projectChanged=true;describe();return;}
   if(value!==pending.current){pending.current=value;remote.value=value;message.textContent='Заметка снова изменилась. Сравните текст и повторите выбор.';return;}
   const key=pending.key,next=writeDraft(storage,updateWorkNote(current,pending.agency,pending.work,local.value));pageMarker=currentMarker;const saved=local.value;pending=null;dialog.close();apply(key,saved);onSaved(next,key);
  }catch{message.textContent='Не удалось сохранить. Ваш текст остаётся в этом окне.';}
 });
 dialog.addEventListener('cancel',event=>event.preventDefault());
 return {input,reconcile,register,resetBaseline,guarded,check,defer,hasPending:()=>Boolean(pending)};
}
