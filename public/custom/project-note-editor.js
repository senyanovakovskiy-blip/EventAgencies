import {KEY,readDraft,writeDraft,updateWorkNote,workNoteKey,normalizeDraft} from './project-store.js';
import {PREVIOUS_PROJECT_KEY} from './project-copy-client.js';
import {referenceProjectMarker} from './reference-batch-session.js';
import {restoreProjectActionFocus} from './project-action-focus.js';

const errors={
 project:'Проект изменился. Этот текст не сохранён в новый проект. Вы можете скопировать его перед закрытием окна.',
 selection:'Агентство или выбранная работа изменились. Ваш ввод оставлен в окне; закройте его и откройте заметку для текущего выбора.',
 note:'Заметка уже изменена в другом месте. Новый текст не перезаписан. Ваш ввод оставлен в окне: скопируйте его перед закрытием, затем откройте актуальную заметку.',
 storage:'Не удалось сохранить. Ваш ввод остался в окне. Разрешите хранение данных сайта и нажмите «Сохранить заметку» ещё раз.'
};
const linked=(work,agencySlug)=>work.agencySlug===agencySlug||work.agencySlugs?.includes(agencySlug);
const currentOpener=(opener,{agencySlug,workSlug,path})=>Boolean(opener.isConnected&&!opener.disabled&&!opener.closest('[hidden],[inert]')&&opener.getClientRects().length&&getComputedStyle(opener).visibility!=='hidden'&&opener.dataset.editComparisonNote===agencySlug&&opener.dataset.noteWork===workSlug&&location.pathname+location.search===path);

export function setupProjectNoteEditor({getData,canEdit,onSaved,onError}){
 const dialog=document.createElement('dialog');dialog.id='project-note-editor';dialog.setAttribute('aria-labelledby','project-note-editor-title');
 dialog.innerHTML=`<button class="brief-close" type="button" data-close-note-editor aria-label="Закрыть редактор заметки">×</button><span class="eyebrow">Только для вас</span><h2 id="project-note-editor-title">Личная заметка</h2><dl class="project-note-context"><div><dt>Агентство</dt><dd data-note-editor-agency></dd></div><div><dt>Выбранная работа</dt><dd data-note-editor-work></dd></div></dl><details class="project-note-description" data-note-editor-description hidden><summary>Описание выбранной работы</summary><dl data-note-editor-description-fields></dl></details><p class="project-note-description-empty" data-note-editor-description-empty hidden>Описание этой работы пока не опубликовано.</p><form><label for="project-note-editor-text">Что нравится в этой работе?</label><p id="project-note-editor-prompt">Что хочется взять для своего события, изменить или обсудить с командой?</p><textarea id="project-note-editor-text" rows="8" maxlength="1000" aria-describedby="project-note-editor-prompt project-note-editor-help project-note-editor-count"></textarea><p id="project-note-editor-count" class="project-note-count"></p><p id="project-note-editor-help">Личная заметка сохраняется в этом браузере. В пожелания и заявку автоматически не добавляется.</p><p class="project-note-editor-status" data-note-editor-status role="status" aria-live="polite"></p><div class="project-note-editor-actions"><button class="primary-action" type="submit">Сохранить заметку</button><button class="secondary-action" type="button" data-close-note-editor>Отмена</button></div></form>`;
 document.body.append(dialog);
 const form=dialog.querySelector('form'),field=dialog.querySelector('textarea'),submit=form.querySelector('[type=submit]'),status=dialog.querySelector('[data-note-editor-status]'),count=dialog.querySelector('#project-note-editor-count');
 const description=dialog.querySelector('[data-note-editor-description]'),descriptionFields=dialog.querySelector('[data-note-editor-description-fields]'),descriptionEmpty=dialog.querySelector('[data-note-editor-description-empty]');
 let active=null,opening=false,busy=false,epoch=0,trigger=null;
 function clearDescription(){
  description.open=false;description.hidden=true;descriptionFields.replaceChildren();descriptionEmpty.hidden=true;
 }
 function showDescription(work){
  clearDescription();
  for(const [key,label] of [['lead','Коротко'],['intro','Описание'],['fit','Если вам близко'],['participation','Участие команды']]){
   const text=work.presentation?.[key];if(typeof text!=='string'||!text.trim())continue;
   const row=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');
   term.textContent=label;value.textContent=text;row.append(term,value);descriptionFields.append(row);
  }
  const published=descriptionFields.childElementCount>0;description.hidden=!published;descriptionEmpty.hidden=published;
 }
 function sync(){
  count.textContent=field.value.length+' / 1000';
  submit.disabled=busy||!active||Boolean(active.invalid)||field.value===active.expected;
  submit.textContent=busy?'Сохраняем…':'Сохранить заметку';submit.setAttribute('aria-busy',String(busy));
  field.readOnly=busy;
  dialog.querySelectorAll('[data-close-note-editor]').forEach(button=>{button.disabled=busy;});
 }
 function conflict(code){if(!active)return;active.invalid ||= code;status.textContent=errors[active.invalid];sync();}
 function changed(current,session=active){
  const entry=current.selection.find(item=>item.agencySlug===session.agencySlug);
  if(!entry||entry.workSlug!==session.workSlug)return 'selection';
  if((current.workNotes[session.key]||'')!==session.expected)return 'note';
  return null;
 }
 async function open(opener){
  if(opening||dialog.open)return;
  const context={agencySlug:opener.dataset.editComparisonNote,workSlug:opener.dataset.noteWork,path:location.pathname+location.search};
  if(!currentOpener(opener,context))return;
  if(!canEdit()){onError('Сначала дождитесь отправки заявки и сохраните текущие изменения проекта.');return;}
  opening=true;const version=epoch,marker=referenceProjectMarker();
  try{
   const data=await getData();if(version!==epoch||!currentOpener(opener,context))return;
   const {agencySlug,workSlug,path}=context;
   const current=readDraft(localStorage),entry=current.selection.find(item=>item.agencySlug===agencySlug),agency=data.agencies.find(item=>item.slug===agencySlug),work=data.projects.find(item=>item.slug===workSlug&&linked(item,agencySlug));
   if(marker===null||marker!==referenceProjectMarker())throw Error('project');
   if(opener.dataset.noteProject&&opener.dataset.noteProject!==marker){onError('Проект уже изменился. Откройте заметку из текущего выбора.');return;}
   if(!canEdit()||!entry||entry.workSlug!==workSlug||!agency||!work){onError('Выбранная работа уже изменилась или недоступна. Откройте заметку для текущего выбора.');return;}
   const key=workNoteKey(agencySlug,workSlug);
   active={agencySlug,workSlug,key,marker,path,expected:current.workNotes[key]||'',invalid:null};trigger=opener;
   field.value=active.expected;status.textContent='';
   dialog.querySelector('[data-note-editor-agency]').textContent=agency.name;
   dialog.querySelector('[data-note-editor-work]').textContent=work.fullTitle;
   // Keep the validated work's published description as a snapshot for this edit.
   showDescription(work);
   sync();dialog.showModal();field.focus({preventScroll:true});
  }catch{if(version===epoch&&currentOpener(opener,context))onError('Не удалось открыть актуальную заметку. Проверьте доступ к хранилищу браузера и попробуйте снова.');}
  finally{opening=false;}
 }
 document.addEventListener('click',event=>{const opener=event.target.closest('[data-edit-comparison-note]');if(opener&&!opener.disabled){event.preventDefault();open(opener);}});
 field.addEventListener('input',()=>{if(!active?.invalid)status.textContent='';sync();});
 dialog.querySelectorAll('[data-close-note-editor]').forEach(button=>button.addEventListener('click',()=>{if(!busy)dialog.close();}));
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>{
  const {agencySlug,workSlug,path}=active||{};active=null;epoch++;field.value='';status.textContent='';
  clearDescription();
  restoreProjectActionFocus({trigger,agencySlug,workSlug,path,action:'note'});trigger=null;
 });
 // A delayed catalog load must not reopen a dialog after leaving and returning.
 addEventListener('pagehide',()=>{epoch++;});
 const projectChanged=()=>{epoch++;conflict('project');};
 document.addEventListener('ea:project-started',projectChanged);
 document.addEventListener('ea:project-copy-restored',projectChanged);
 addEventListener('storage',event=>{
  if(!active)return;
  try{if(event.storageArea!==localStorage)return;}catch{return;}
  if(event.key===PREVIOUS_PROJECT_KEY||event.key===null){projectChanged();return;}
  if(event.key===KEY){
   try{const code=changed(normalizeDraft(JSON.parse(event.newValue||'null')));if(code)conflict(code);}catch{conflict('project');}
  }
 });
 document.addEventListener('ea:work-note-updated',event=>{
  if(!active||event.target.dataset?.workNote!==active.agencySlug||event.target.dataset?.noteWork!==active.workSlug)return;
  if(event.target.value!==active.expected)conflict('note');
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!active||active.invalid||busy||field.value===active.expected)return;
  if(!canEdit()){status.textContent='Дождитесь завершения отправки и сохраните текущие изменения проекта, затем повторите попытку.';return;}
  const session=active,value=field.value;if(value.length>1000)return;
  let next;
  try{
   // No await between reading, checking and writing the latest shared draft.
   const marker=referenceProjectMarker();if(marker===null)throw Error('storage');
   if(marker!==session.marker){conflict('project');return;}
   const current=readDraft(localStorage),code=changed(current,session);
   if(code){conflict(code);return;}
   const latestMarker=referenceProjectMarker();if(latestMarker===null)throw Error('storage');
   if(latestMarker!==session.marker){conflict('project');return;}
   next=writeDraft(localStorage,updateWorkNote(current,session.agencySlug,session.workSlug,value));
  }catch{status.textContent=errors.storage;sync();return;}
  session.expected=value;busy=true;status.textContent='';sync();
  try{
   await onSaved(next,{agencySlug:session.agencySlug,workSlug:session.workSlug,value,trigger,marker:session.marker,path:session.path});
   if(active===session&&!session.invalid)dialog.close();
  }catch{status.textContent='Заметка сохранена. Не удалось обновить отображение — закройте окно и обновите страницу.';}
  finally{busy=false;sync();}
 });
}
