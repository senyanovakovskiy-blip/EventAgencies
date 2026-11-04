import {KEY,emptyDraft,readDraft,writeDraft} from './project-store.js';
import {PREVIOUS_PROJECT_KEY} from './project-copy-client.js';
import {referenceProjectMarker} from './reference-batch-session.js';
import {INQUIRY_KEY} from './inquiry-model.js';

export const BRIEF_UNDO_GROUPS=[
 {id:'format',label:'формат',keys:['format']},{id:'city',label:'город',keys:['city']},
 {id:'date',label:'дата',keys:['date','dateUnknown']},{id:'guests',label:'гости',keys:['guests']},
 {id:'budget',label:'бюджет',keys:['budget','budgetHelp']},{id:'description',label:'пожелания',keys:['description']}
];
const fields=BRIEF_UNDO_GROUPS.flatMap(group=>group.keys);
const values=(brief,keys)=>Object.fromEntries(keys.map(key=>[key,brief[key]]));
const same=(a,b,keys)=>keys.every(key=>a[key]===b[key]);
const messages={
 project:'Проект изменился. Возврат прежнего описания в этот проект недоступен.',
 resume:'Страница вернулась из истории. Обновите редактор из проекта перед новыми изменениями.',
 changed:'Эти поля уже изменены другим действием или вкладкой. Автоматический возврат недоступен.',
 locked:'Возврат недоступен во время отправки, ожидания подтверждения или для принятой заявки.',
 storage:'Не удалось вернуть описание. Введённый текст и возможность возврата сохранены на странице. Разрешите хранение данных и попробуйте ещё раз.'
};

/** One open editing session and one previous saved session, in page memory only. */
export function setupBriefSessionUndo({form,dialog,canUndo,onRestored}){
 const cancel=form.querySelector('[data-undo-brief-session]');if(!cancel)return null;
 const doc=form.ownerDocument,inline=form.querySelector('[data-brief-undo-status]');
 const host=doc.createElement('div');host.className='project-brief-undo';host.hidden=true;
 host.innerHTML='<p role="status" aria-live="polite" tabindex="-1"></p><button class="secondary-action" type="button">Вернуть описание до редактирования</button><small>Доступно до обновления страницы. Возвращаются только изменённые поля описания.</small>';
 doc.querySelector('.project-intro-actions')?.after(host);
 const status=host.querySelector('p'),restore=host.querySelector('button');
 let active=null,previous=null,inlineMessage='',outsideMessage='',busy=false,trigger=null;
 function formBrief(){
  return Object.fromEntries(fields.map(key=>{const field=form.elements.namedItem(key);return [key,field.type==='checkbox'?field.checked:field.value];}));
 }
 function candidate(){
  if(!active)return null;
  const groups=new Map(active.groups),displayed=formBrief();
  // Unsaved input can also be explicitly cancelled, but only if the stored
  // group still equals its opening value. A failed undo leaves this input intact.
  for(const group of BRIEF_UNDO_GROUPS)if(active.touched.has(group.id)&&!groups.has(group.id)&&!same(displayed,active.before,group.keys))groups.set(group.id,{...group,before:values(active.before,group.keys),after:values(active.before,group.keys)});
  return {...active,groups};
 }
 function conflict(record,brief){
  if(!record||record.invalid)return;
  if([...record.groups.values()].some(group=>!same(brief,group.after,group.keys)))record.invalid='changed';
 }
 function inspect(record){
  if(!record||!record.groups.size)return '';
  if(record.invalid)return record.invalid;
  try{
   const marker=referenceProjectMarker();if(marker===null)return 'storage';
   if(marker!==record.marker){record.invalid='project';return 'project';}
   const current=readDraft(localStorage);conflict(record,current.brief);
   return record.invalid||(!canUndo(current)?'locked':'');
  }catch{return 'storage';}
 }
 function sync(){
  const change=candidate(),reason=inspect(change),previousReason=inspect(previous);
  if(active&&change?.invalid)active.invalid=change.invalid;
  cancel.disabled=busy||!change?.groups.size||Boolean(reason&&reason!=='storage');
  inline.textContent=inlineMessage||(reason?messages[reason]:change?.groups.size?'Отмена вернёт: '+[...change.groups.values()].map(group=>group.label).join(', ')+'.':'');
  inline.hidden=!inline.textContent;
  const closed=Boolean(previous?.groups.size);
  host.hidden=dialog.open||(!closed&&!outsideMessage);
  restore.hidden=!closed;restore.disabled=busy||Boolean(previousReason&&previousReason!=='storage');
  status.textContent=outsideMessage||(previousReason?messages[previousReason]:closed?'Можно вернуть поля последнего редактирования: '+[...previous.groups.values()].map(group=>group.label).join(', ')+'.':'');
 }
 function begin(brief){
  if(active)return;
  trigger=doc.activeElement;inlineMessage='';outsideMessage='';
  active={marker:referenceProjectMarker(),before:{...emptyDraft().brief,...values(brief,fields)},groups:new Map(),touched:new Set(),saved:false,invalid:''};
  sync();
 }
 // An untouched external field becomes this session's baseline, never its undo
 // target. Explicit acceptance of a conflicted group uses the same operation.
 function rebase(brief,ids){
  if(!active)return;
  for(const group of BRIEF_UNDO_GROUPS)if(ids.includes(group.id)){
   Object.assign(active.before,values(brief,group.keys));active.groups.delete(group.id);active.touched.delete(group.id);
  }
  if(active.invalid==='changed')active.invalid='';
  inlineMessage='';sync();
 }
 function restart(brief){const opener=trigger;active=null;begin(brief);trigger=opener||trigger;}
 // Inputs are the actual persisted brief values, never an optimistic draft.
 function record(savedBefore,savedAfter){
  if(!active||active.invalid==='project')return;
  const changed=BRIEF_UNDO_GROUPS.filter(group=>!same(savedBefore,savedAfter,group.keys));
  if(!changed.length){sync();return;}
  if(!active.saved){previous=null;active.saved=true;}
  const marker=referenceProjectMarker();if(marker!==null&&marker!==active.marker)active.invalid='project';
  for(const group of changed){
   const expected=active.groups.get(group.id)?.after||active.before;
   if(!same(savedBefore,expected,group.keys))active.invalid ||= 'changed';
   if(same(active.before,savedAfter,group.keys))active.groups.delete(group.id);
   else active.groups.set(group.id,{...group,before:values(active.before,group.keys),after:values(savedAfter,group.keys)});
  }
  inlineMessage='';sync();
 }
 function finish(){
  if(active?.saved)previous=active.groups.size?{marker:active.marker,groups:new Map(active.groups),invalid:active.invalid}:null;
  active=null;inlineMessage='';sync();
 }
 function reset(reason='project'){
  const hadChange=Boolean(previous?.groups.size||active?.groups.size);previous=null;
  if(active){active.groups.clear();active.saved=false;active.invalid=reason;}
  inlineMessage=active?messages[reason]||'': '';outsideMessage=hadChange?messages[reason]||'':'';sync();
 }
 function undo(inside){
  const change=inside?candidate():previous;if(busy||!change?.groups.size)return;
  let next,keys=[];
  const report=text=>{if(inside)inlineMessage=text;else outsideMessage=text;sync();};
  try{
   const marker=referenceProjectMarker();if(marker===null)throw Error('storage');
   if(marker!==change.marker){change.invalid='project';if(inside)active.invalid='project';report(messages.project);return;}
   const current=readDraft(localStorage);conflict(change,current.brief);
   if(change.invalid){if(inside)active.invalid=change.invalid;report(messages[change.invalid]);return;}
   if(!canUndo(current)){report(messages.locked);return;}
   const brief={...current.brief};
   for(const group of change.groups.values()){Object.assign(brief,group.before);keys.push(...group.keys);}
   const latestMarker=referenceProjectMarker();if(latestMarker===null)throw Error('storage');
   if(latestMarker!==change.marker){change.invalid='project';if(inside)active.invalid='project';report(messages.project);return;}
   // Preserve selection, contact, notes and request metadata from the fresh draft.
   // Do not call updateBrief/persist: those intentionally clear request state.
   next=writeDraft(localStorage,{...current,brief});
  }catch{report(messages.storage);return;}
  busy=true;
  if(inside){
   for(const key of keys){const field=form.elements.namedItem(key);if(field.type==='checkbox')field.checked=next.brief[key];else field.value=next.brief[key];}
   active.groups.clear();active.saved=false;
  }else previous=null;
  outsideMessage=inside?'Изменения этого сеанса отменены.':'Последнее редактирование описания отменено.';
  try{onRestored(next,{keys,inside});}catch{outsideMessage+=' Не удалось обновить отображение — обновите страницу.';}
  busy=false;
  if(inside){
   dialog.close();
   const visible=node=>node?.isConnected&&!node.disabled&&node.getClientRects().length;
   const target=visible(trigger)?trigger:[...doc.querySelectorAll('[data-edit-brief]')].find(visible)||doc.getElementById('project-overview');
   target?.focus({preventScroll:true});
  }
  sync();if(!inside)status.focus({preventScroll:true});
 }
 cancel.addEventListener('click',()=>undo(true));restore.addEventListener('click',()=>undo(false));
 dialog.addEventListener('close',finish);
 for(const type of ['input','change'])form.addEventListener(type,event=>{
  const group=BRIEF_UNDO_GROUPS.find(group=>group.keys.includes(event.target.name));
  if(active&&group)active.touched.add(group.id);
  queueMicrotask(sync);
 });
 document.addEventListener('ea:project-started',()=>reset('project'));
 document.addEventListener('ea:project-copy-restored',()=>reset('project'));
 document.addEventListener('ea:inquiry-accepted',()=>reset('locked'));
 addEventListener('storage',event=>{
  try{if(event.storageArea!==localStorage)return;}catch{return;}
  if(event.key===PREVIOUS_PROJECT_KEY||event.key===null||event.key===KEY&&event.newValue===null){reset('project');return;}
  // The group editor reconciles untouched fields before this check. Inspect
  // current storage, not a possibly superseded storage-event payload.
  if(event.key===KEY||event.key===INQUIRY_KEY)sync();
 });
 addEventListener('pageshow',()=>sync());
 return {begin,record,sync,reset,rebase,restart};
}
