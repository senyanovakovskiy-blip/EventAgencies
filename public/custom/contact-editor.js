import {KEY,emptyDraft,normalizeDraft,updateContact,contactMethods} from './project-store.js';
import {PREVIOUS_PROJECT_KEY} from './project-copy-client.js';
import {referenceProjectMarker} from './reference-batch-session.js';

const groups=[
 {id:'name',keys:['name'],label:'имя'},
 {id:'address',keys:['method','value'],label:'способ связи и контакт'}
];
const keys=groups.flatMap(group=>group.keys);
const same=(a,b,fields=keys)=>fields.every(key=>a[key]===b[key]);
const pick=(value,fields)=>Object.fromEntries(fields.map(key=>[key,value[key]]));
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/**
 * The form owns the raw input buffer; the owner owns the freshly read draft.
 * onRead must only assign that draft, without rendering or filling this form.
 * onSaved may render after the saved groups' baselines have been advanced.
 * resetFromProject is an explicit discard/accept operation, never a render hook.
 */
export function setupContactEditor({form,presentation,onRead,onSaved,onStorageError,canEdit=()=>true,blockedMessage=()=> 'Дождитесь завершения отправки, затем сохраните введённый контакт.'}){
 if(!form)return null;
 const doc=form.ownerDocument,win=doc.defaultView;
 const fields=Object.fromEntries(keys.map(key=>[key,form.elements.namedItem(key)]));
 if(keys.some(key=>!fields[key]))return null;
 let status=form.querySelector('#contact-save-status');
 if(!status){status=doc.createElement('p');status.id='contact-save-status';status.className='brief-local-note';form.append(status);}
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');status.tabIndex=-1;
 const describedBy=new Set((form.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));describedBy.add(status.id);form.setAttribute('aria-describedby',[...describedBy].join(' '));
 const recovery=doc.createElement('div');recovery.className='contact-editor-recovery';recovery.hidden=true;recovery.setAttribute('role','group');recovery.setAttribute('aria-label','Сохранение контакта');
 const explanation=doc.createElement('p');recovery.append(explanation);
 const controls=new Map();
 function button(label,action){const node=doc.createElement('button');node.type='button';node.className='secondary-action';node.textContent=label;node.addEventListener('click',action);return node;}
 for(const group of groups){
  const row=doc.createElement('div'),current=doc.createElement('p');row.className='contact-editor-conflict';
  const accept=button('Принять из проекта: '+group.label,()=>acceptGroup(group));row.append(current,accept);recovery.append(row);controls.set(group.id,{row,current,accept});
 }
 const reset=button('Принять контакт из текущего проекта',()=>resetFromProject({focus:true}));
 const retry=button('Повторить сохранение контакта',()=>flush({focus:true}));recovery.append(reset,retry);status.after(recovery);
 let epoch=0,session={marker:null,existed:false,base:displayed(),latest:null,conflicts:new Set(),invalid:'unreadable',error:'',saved:false};

 function displayed(){return Object.fromEntries(keys.map(key=>[key,fields[key].value]));}
 function fill(contact,selected=keys){for(const key of selected)fields[key].value=contact[key];presentation?.sync();}
 function pending(){const input=displayed();return groups.filter(group=>!same(input,session.base,group.keys));}
 function snapshot(){
  const marker=referenceProjectMarker();if(marker===null)throw Error('storage');
  const raw=localStorage.getItem(KEY),source=raw===null?emptyDraft():JSON.parse(raw);
  // A corrupt, unsupported or truncated contact is not an empty project.
  if(!record(source)||source.version!==1||!record(source.contact)||keys.some(key=>!Object.hasOwn(source.contact,key)||typeof source.contact[key]!=='string'))throw Error('storage');
  const current=normalizeDraft(source);
  if(!same(source.contact,current.contact))throw Error('storage');
  if(referenceProjectMarker()!==marker||localStorage.getItem(KEY)!==raw)throw Error('changed');
  return {marker,raw,source,current};
 }
 function readFailed(error){
  session.error=error.message==='changed'?'Проект обновился во время чтения. Ввод остаётся в полях; повторите сохранение.':'Не удалось прочитать сохранённый проект. Ввод остаётся в полях; разрешите хранение данных сайта и повторите попытку.';
  if(error.message!=='changed')onStorageError?.();paint();
 }
 function paint(){
  const unsaved=pending(),conflicts=groups.filter(group=>session.conflicts.has(group.id)),editable=canEdit();
  const invalidText=session.invalid==='resume'?'Страница вернулась из истории. Ввод сохранён в полях; примите контакт текущего проекта перед продолжением.':session.invalid==='unreadable'?'Не удалось открыть сохранённый контакт. Ввод остаётся в полях; повторите чтение проекта.':session.invalid?'Проект изменился. Ввод остаётся в полях и не будет перенесён в другой проект.':'';
  const text=invalidText?(invalidText+(session.error?' '+session.error:'')):conflicts.length?'В проекте изменились: '+conflicts.map(group=>group.label).join(', ')+'. Ваш ввод оставлен в полях. Примите актуальные значения, чтобы продолжить.'+(session.error?' '+session.error:''):session.error|| (unsaved.length?(editable?'Есть несохранённые изменения контакта. Повторите сохранение.':blockedMessage()):!editable?blockedMessage():session.saved?'Контакт сохранён в этом браузере.':'Контакт сохраняется в этом браузере по мере заполнения.');
  if(status.textContent!==text)status.textContent=text;
  recovery.hidden=!session.invalid&&!conflicts.length&&!session.error&&!unsaved.length;
  explanation.textContent=session.invalid?'Принятие заменит имя, способ связи и контакт актуальными значениями проекта. Если нужен введённый текст, скопируйте его перед принятием.':conflicts.length?'Принятие заменит только указанную группу полей. Остальной ввод останется на странице.':'Введённый текст остаётся на странице. Не закрывайте её, пока изменения не сохранены.';
  reset.hidden=!session.invalid;
  retry.hidden=Boolean(session.invalid)||(!session.error&&!unsaved.some(group=>!session.conflicts.has(group.id)));
  reset.disabled=retry.disabled=!editable;
  for(const group of groups){
   const control=controls.get(group.id);control.row.hidden=Boolean(session.invalid)||!session.conflicts.has(group.id);control.accept.disabled=!editable;
   const contact=session.latest?.contact;
   control.current.textContent=contact?'В проекте: '+(group.id==='name'?(contact.name||'имя не указано'):(contactMethods[contact.method]+' — '+(contact.value||'контакт не указан'))):'';
  }
  form.dataset.contactState=session.invalid?'invalid':conflicts.length?'conflict':session.error?'error':unsaved.length?'pending':'saved';
  // Owners update only their handoff controls here, never reconcile or fill.
  form.dispatchEvent(new Event('ea:contact-editor-state'));
 }
 function invalidate(reason='project'){
  epoch++;session.invalid=reason==='resume'?'resume':'project';session.error='';paint();
 }
 function reconcileState(){
  let state;try{state=snapshot();}catch(error){readFailed(error);return null;}
  session.latest=state.current;onRead?.(state.current);
  if(session.invalid){paint();return null;}
  if(state.marker!==session.marker||(session.existed&&state.raw===null)){invalidate();return null;}
  session.existed ||= state.raw!==null;
  const input=displayed();let filled=false;
  for(const group of groups){
   if(session.conflicts.has(group.id)||same(state.current.contact,session.base,group.keys))continue;
   if(!same(input,session.base,group.keys))session.conflicts.add(group.id);
   else{
    Object.assign(session.base,pick(state.current.contact,group.keys));
    for(const key of group.keys)fields[key].value=state.current.contact[key];filled=true;
   }
  }
  if(filled)presentation?.sync();
  // A successful read does not prove that a failed write has been retried.
  paint();return state;
 }
 function reconcile(){const state=reconcileState();return Boolean(state&&!session.conflicts.size);}
 function ready(state){return Boolean(state&&!session.invalid&&!session.conflicts.size&&!pending().length);}
 function save(requested=groups){
  presentation?.sync();
  const state=reconcileState();if(!state)return false;
  if(!canEdit()){paint();return false;}
  const changed=pending().filter(group=>requested.includes(group)&&!session.conflicts.has(group.id));
  if(!changed.length){if(!pending().length&&!session.conflicts.size)session.error='';paint();return ready(state);}
  const input=displayed(),patch=Object.assign({},...changed.map(group=>pick(input,group.keys)));
  const normalized=updateContact(state.current,patch);
  // No format validation here: incomplete addresses and whitespace are saved
  // verbatim within the store limits. Never silently truncate an input buffer.
  if(changed.some(group=>!same(normalized.contact,input,group.keys))){session.error='Значение не помещается в сохранённый контакт. Сократите имя до 120 символов или контакт до 254 символов; введённый текст оставлен в полях.';paint();return false;}
  // Keep all unrelated fresh fields (including fields unknown to this editor).
  // writeDraft would normalize the entire document instead of only this patch.
  const next={...state.source,contact:{...state.source.contact,...patch},request:null};
  try{
   // Synchronous compare-and-write: no callback or await after these guards.
   const marker=referenceProjectMarker();if(marker===null)throw Error('storage');
   if(marker!==session.marker){invalidate();return false;}
   if(localStorage.getItem(KEY)!==state.raw){reconcileState();session.error='Проект обновился во время сохранения. Ввод остаётся в полях; повторите сохранение.';paint();return false;}
   localStorage.setItem(KEY,JSON.stringify(next));
  }catch{session.error='Не удалось сохранить контакт. Ввод остаётся в полях; разрешите хранение данных сайта и повторите сохранение.';onStorageError?.();paint();return false;}
  const saved=normalizeDraft(next);
  for(const group of changed)Object.assign(session.base,pick(saved.contact,group.keys));
  session.existed=true;session.saved=true;session.error='';session.latest=saved;
  onSaved?.(saved);paint();return ready(state);
 }
 function focusRecovery(){
  const control=[reset,...groups.map(group=>controls.get(group.id).accept),retry].find(node=>!node.hidden&&!node.disabled&&!node.parentElement.hidden);
  (control||status).focus({preventScroll:true});
 }
 function flush({focus=false}={}){
  const fromRecovery=recovery.contains(doc.activeElement),result=save();
  if(!result&&focus)focusRecovery();
  else if(result&&fromRecovery)fields.name.focus({preventScroll:true});
  return result;
 }
 function start(state,{resetErrors=false}={}){
  epoch++;session={marker:state.marker,existed:state.raw!==null,base:{...state.current.contact},latest:state.current,conflicts:new Set(),invalid:'',error:'',saved:false};
  fill(state.current.contact);if(resetErrors)presentation?.reset();onRead?.(state.current);paint();
 }
 function resetFromProject({focus=false}={}){
  if(!canEdit()){paint();return false;}
  let state;try{state=snapshot();}catch(error){readFailed(error);if(focus)focusRecovery();return false;}
  start(state,{resetErrors:true});if(focus)fields.name.focus({preventScroll:true});return true;
 }
 function acceptGroup(group){
  if(!canEdit())return false;
  const state=reconcileState();if(!state)return false;
  Object.assign(session.base,pick(state.current.contact,group.keys));session.conflicts.delete(group.id);session.error='';
  fill(state.current.contact,group.keys);paint();fields[group.keys[0]].focus({preventScroll:true});return true;
 }
 function createFreshnessGuard(){
  const state=reconcileState();if(!ready(state))return null;
  const capturedEpoch=epoch;
  // A new submission may await catalog data or a lock. The owner checks this
  // read-only guard in beforeNewRequest, after its final await. It is not a
  // gate for retrying an already persisted inquiry payload or its receipt.
  return ()=>{const current=reconcileState();return ready(current)&&epoch===capturedEpoch&&current.marker===state.marker&&current.raw===state.raw;};
 }
 for(const type of ['input','change'])form.addEventListener(type,event=>{
  const group=groups.find(group=>group.keys.some(key=>fields[key]===event.target));if(group)save([group]);
 });
 form.addEventListener('submit',event=>{event.preventDefault();flush({focus:true});});
 win?.addEventListener('storage',event=>{
  try{if(event.storageArea!==localStorage)return;}catch{readFailed(Error('storage'));return;}
  if(event.key===null||(event.key===KEY&&event.newValue===null&&(session.existed||event.oldValue!==null))){invalidate();return;}
  if(event.key===KEY||event.key===PREVIOUS_PROJECT_KEY)reconcile();
 });
 win?.addEventListener('pagehide',()=>invalidate('resume'));
 win?.addEventListener('pageshow',event=>{if(event.persisted)invalidate('resume');});
 try{start(snapshot());}catch(error){readFailed(error);}
 return {reconcile,flush,resetFromProject,invalidate,focusRecovery,createFreshnessGuard,
  get unsaved(){return pending().length>0;},
  get conflicted(){return session.conflicts.size>0;},
  get blocked(){return Boolean(session.invalid||session.conflicts.size||session.error);}
 };
}
