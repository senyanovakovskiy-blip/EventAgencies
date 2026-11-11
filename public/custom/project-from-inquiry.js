import {emptyDraft,contactMethods} from './project-store.js';
import {validReceipt} from './inquiry-model.js';
import {makeProjectCopy} from './project-copy-model.js';
import {prepareCopyPreview,copyTeamsMarkup,copyAvailabilityMarkup} from './project-copy-preview.js';
import {restoreProjectCopy} from './project-copy-client.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const errorText=error=>({browser_storage_unavailable:'Не удалось сохранить текущий проект для возврата. Освободите место или разрешите хранение данных сайта и попробуйте снова.',restore_recovery_required:'Не удалось полностью восстановить данные браузера. Предыдущий вариант сохранён — освободите место и воспользуйтесь кнопкой возврата.'}[error?.code]||'Не удалось подготовить проект. Закройте окно и попробуйте ещё раз.');

export function setupProjectFromInquiry({getState,getData,briefRows,canCreate,blockedMessage=()=> 'Дождитесь завершения отправки заявки или сохранения копии, затем повторите действие.',onCreated,onStorageIssue}){
 const dialog=document.createElement('dialog');dialog.id='request-project-dialog';dialog.setAttribute('aria-labelledby','request-project-title');
 dialog.innerHTML='<button class="brief-close" type="button" data-cancel-request-project aria-label="Закрыть создание проекта">×</button><span class="eyebrow">На основе отправленной заявки</span><h2 id="request-project-title">Новый проект из заявки</h2><p class="request-project-intro">Описание и выбранные команды станут основой нового проекта. Дату нужно указать заново. После создания откроется форма описания события.</p><div class="account-copy-preview" data-request-project-preview></div><form><label class="request-project-contact"><input name="useContact" type="checkbox"><span>Использовать контакт из этой заявки<small data-request-source-contact></small></span></label><p class="request-project-effect">Текущий контакт сохранится, если не выбрать перенос. Сохранённые примеры и личные заметки останутся в проекте. Предыдущий вариант будет доступен для возврата в этом браузере.</p><p class="request-project-effect">Исходная заявка останется в истории. Повторная отправка происходит отдельно, через форму заявки.</p><p class="brief-local-note" role="status" data-request-project-status></p><div class="request-project-actions"><button class="primary-action" type="submit" disabled>Создать и указать дату</button><button class="secondary-action" type="button" data-cancel-request-project>Отмена</button></div></form>';
 document.body.append(dialog);
 const body=dialog.querySelector('[data-request-project-preview]'),form=dialog.querySelector('form'),contact=form.elements.namedItem('useContact'),status=dialog.querySelector('[data-request-project-status]'),submit=form.querySelector('[type=submit]');
 let active=null,version=0,returnFocus=null,continueToBrief=false;
 dialog.querySelectorAll('[data-cancel-request-project]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
 dialog.addEventListener('close',()=>{
  version++;active=null;
  if(continueToBrief){continueToBrief=false;document.getElementById('project-overview')?.scrollIntoView({block:'start'});(document.querySelector('[data-edit-brief][data-brief-field="date"]')||document.querySelector('.project-intro-actions [data-edit-brief]'))?.click();}
  else if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!active)return;
  if(!canCreate()){status.textContent=blockedMessage();return;}
  try{
   const snapshot={...active.prepared.loadSnapshot,includeContact:contact.checked};
   if(contact.checked)snapshot.draft={...snapshot.draft,contact:active.receipt.contact};
   restoreProjectCopy(snapshot,getState,{preserveReferences:true});onCreated(active.receipt.id);
   continueToBrief=true;dialog.close();
  }catch(error){status.textContent=errorText(error);onStorageIssue();}
 });
 return async function openReceiptProject(receipt,trigger){
  if(dialog.open||!validReceipt(receipt))return;
  const generation=++version;active=null;returnFocus=trigger;continueToBrief=false;contact.checked=false;contact.disabled=true;submit.disabled=true;body.replaceChildren();status.textContent='Подготавливаем описание и выбранные команды…';
  document.getElementById('request-project-title').textContent='Проект из '+receipt.id;
  dialog.querySelector('[data-request-source-contact]').textContent=receipt.contact.name+' · '+contactMethods[receipt.contact.method]+': '+receipt.contact.value;
  dialog.showModal();
  try{
   const data=await getData();if(generation!==version||!dialog.open)return;
   if(!Array.isArray(data?.agencies)||!Array.isArray(data?.projects))throw Error('catalog_unavailable');
   const draft=emptyDraft();draft.brief={...receipt.brief,date:'',dateUnknown:false};draft.selection=receipt.selection.map(({agencySlug,workSlug})=>({agencySlug,workSlug}));
   const snapshot=makeProjectCopy(draft,[],{includeNotes:false,includeContact:false}),prepared=prepareCopyPreview(snapshot,data);
   body.innerHTML=`<dl class="review-brief">${briefRows(prepared.loadSnapshot.draft.brief).filter(([label])=>label!=='Пожелания').map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><h4>Пожелания</h4><p class="account-copy-wishes">${esc(draft.brief.description||'Пока не указаны.')}</p><h4>Команды и работы</h4>${copyTeamsMarkup(prepared.teams)}${copyAvailabilityMarkup(prepared,{source:'request'})}`;
   active={receipt,prepared};contact.disabled=false;submit.disabled=false;status.textContent='';
  }catch(error){if(generation===version&&dialog.open)status.textContent=errorText(error);}
 };
}
