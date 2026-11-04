import {emptyDraft,normalizeDraft} from './project-store.js';
import {REFERENCE_KEY,normalizeReferences} from './reference-store.js';
import {makeProjectCopy} from './project-copy-model.js';
import {restoreProjectCopy} from './project-copy-client.js';

const errorText=error=>({browser_storage_unavailable:'Не удалось сохранить предыдущий вариант. Освободите место или разрешите хранение данных сайта и попробуйте снова.',restore_recovery_required:'Не удалось полностью восстановить данные браузера. Предыдущий вариант сохранён — освободите место и воспользуйтесь кнопкой возврата.'}[error?.code]||'Не удалось подготовить новый проект. Попробуйте ещё раз.');

export function setupNewProject({anchor,getState,canStart,onStarted,onStorageIssue}){
 const opener=document.createElement('button');opener.type='button';opener.className='project-new-opener';opener.textContent='Начать новый проект…';anchor.after(opener);
 const dialog=document.createElement('dialog');dialog.id='new-project-dialog';dialog.setAttribute('aria-labelledby','new-project-title');
 dialog.innerHTML='<button class="brief-close" type="button" data-close-new-project aria-label="Закрыть создание проекта">×</button><span class="eyebrow">Следующее мероприятие</span><h2 id="new-project-title">Начать новый проект</h2><p>Описание события и выбранные команды будут очищены. Выберите, что перенести в новый проект.</p><form><fieldset><legend class="visually-hidden">Что оставить</legend><label class="new-project-option"><input name="keepReferences" type="checkbox" checked><span>Сохранённые примеры и заметки к ним<small data-new-reference-count></small></span></label><label class="new-project-option"><input name="keepContact" type="checkbox" checked><span>Имя и контакт для ответа<small data-new-contact-hint></small></span></label></fieldset><div class="new-project-changes" data-new-project-changes></div><p class="new-project-backup">Предыдущий вариант останется в этом браузере для возврата. Копии в аккаунте и история заявок сохранятся.</p><p class="new-project-account-note">Для доступа к прежнему проекту с другого устройства сначала сохраните его через «Копии в аккаунте».</p><p class="brief-local-note" role="status" data-new-project-status></p><div class="new-project-actions"><button class="primary-action" type="submit">Создать и описать событие</button><button class="secondary-action" type="button" data-cancel-new-project>Отмена</button></div></form>';
 document.body.append(dialog);
 const form=dialog.querySelector('form'),references=form.elements.namedItem('keepReferences'),contact=form.elements.namedItem('keepContact'),changes=dialog.querySelector('[data-new-project-changes]'),status=dialog.querySelector('[data-new-project-status]'),submit=form.querySelector('[type=submit]');
 let source=null,continueToBrief=false;
 const readSource=()=>({draft:normalizeDraft(getState()),references:normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]'))});
 function nextCopy(){
  const draft=emptyDraft();draft.workNotes=source.draft.workNotes;
  if(contact.checked)draft.contact=source.draft.contact;
  return makeProjectCopy(draft,references.checked?source.references:[],{includeNotes:true,includeContact:true});
 }
 function changesProject(copy){return JSON.stringify(copy.draft)!==JSON.stringify(source.draft)||JSON.stringify(copy.references)!==JSON.stringify(source.references);}
 function render(){
  if(!source)return;
  const copy=nextCopy(),hasChanges=changesProject(copy);
  dialog.querySelector('[data-new-reference-count]').textContent=source.references.length?'Примеров: '+source.references.length:'Пока нет сохранённых примеров';
  dialog.querySelector('[data-new-contact-hint]').textContent=source.draft.contact.name||source.draft.contact.value?'Будет использован текущий контакт':'Контакт пока не заполнен';
  const removedNotes=Object.values(source.draft.workNotes).filter(note=>note.trim()).length-Object.values(copy.draft.workNotes).filter(note=>note.trim()).length;
  changes.replaceChildren();
  if(hasChanges){
   const label=document.createElement('strong');label.textContent='Что изменится';changes.append(label);
   const list=document.createElement('ul');
   const rows=[];
   if(Object.values(source.draft.brief).some(Boolean))rows.push('Описание события будет очищено.');
   if(source.draft.selection.length)rows.push('Выбранные команды будут убраны: '+source.draft.selection.length+'.');
   if(!references.checked&&source.references.length)rows.push('Сохранённые примеры будут убраны: '+source.references.length+'.');
   if(removedNotes)rows.push('Заметки, которые останутся только в предыдущем варианте: '+removedNotes+'.');
   if(!contact.checked&&(source.draft.contact.name||source.draft.contact.value))rows.push('Имя и контакт будут очищены.');
   if(!rows.length)rows.push('Будет подготовлен пустой черновик события.');
   for(const text of rows){const row=document.createElement('li');row.textContent=text;list.append(row);}changes.append(list);
  }else{const text=document.createElement('p');text.textContent='Проект уже готов к новому событию. Можно перейти к описанию.';changes.append(text);}
  submit.textContent=hasChanges?'Создать и описать событие':'Описать мероприятие';submit.disabled=false;
 }
 opener.addEventListener('click',()=>{
  if(dialog.open)return;continueToBrief=false;status.textContent='';references.checked=true;contact.checked=true;
  try{source=readSource();render();}catch(error){source=null;changes.replaceChildren();status.textContent=errorText(error);submit.disabled=true;}
  dialog.showModal();
 });
 references.addEventListener('change',render);contact.addEventListener('change',render);
 dialog.querySelector('[data-close-new-project]').addEventListener('click',()=>dialog.close());
 dialog.querySelector('[data-cancel-new-project]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{
  if(continueToBrief){continueToBrief=false;const edit=document.querySelector('.project-intro-actions [data-edit-brief]');document.getElementById('project-overview')?.scrollIntoView({block:'start'});edit?.click();}
  else opener.focus({preventScroll:true});
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!source)return;
  if(!canStart()){status.textContent='Дождитесь завершения отправки заявки или сохранения копии, затем повторите действие.';return;}
  try{
   const current=readSource();
   if(JSON.stringify(current)!==JSON.stringify(source)){source=current;render();status.textContent='Проект изменился. Описание изменений обновлено — нажмите кнопку ещё раз, чтобы продолжить.';return;}
   const copy=nextCopy();
   if(changesProject(copy)){restoreProjectCopy(copy,getState);onStarted();}
   continueToBrief=true;dialog.close();
  }catch(error){status.textContent=errorText(error);onStorageIssue();}
 });
}
