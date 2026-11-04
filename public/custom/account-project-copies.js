import {copySummary,normalizeProjectCopy} from './project-copy-model.js';
import {copyRequest,currentProjectCopy,saveAccountCopy,previousProject,restoreProjectCopy} from './project-copy-client.js';
import {prepareCopyPreview,copyAvailabilityMarkup,copyTeamsMarkup,copyReferencesMarkup,copyReferenceCards} from './project-copy-preview.js';
import {setupCopyNameEditor} from './project-copy-name.js';
import {setupNewProject} from './project-new.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=value=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const errorMessage=error=>({authentication_required:'Войдите в свой аккаунт, чтобы открыть сохранённые копии.',catalog_unavailable:'Не удалось загрузить каталог для просмотра копии. Вернитесь к списку и откройте копию ещё раз.',copy_limit:'В аккаунте уже 100 копий. Удалите ненужную копию и повторите сохранение.',copy_too_large:'Копия слишком большая. Сохраните её без заметок или уменьшите количество примеров.',too_large:'Копия слишком большая. Сохраните её без заметок или уменьшите количество примеров.',browser_storage_unavailable:'В браузере недоступно сохранение. Освободите место или разрешите хранение данных сайта и попробуйте снова.',restore_recovery_required:'Не удалось полностью восстановить данные браузера. Предыдущий вариант сохранён — освободите место и откройте его через кнопку возврата.',sending_in_progress:'Дождитесь завершения отправки заявки, затем загрузите копию.',not_found:'Этой копии уже нет в вашем аккаунте.'}[error?.code]||'Не удалось выполнить действие. Попробуйте ещё раз.');
const validItem=item=>item&&Number.isSafeInteger(item.id)&&item.id>0&&typeof item.name==='string'&&Number.isFinite(Date.parse(item.createdAt))&&['teams','references','notes'].every(key=>Number.isSafeInteger(item[key])&&item[key]>=0);

export function setupAccountProjectCopies({getState,getData,briefRows,formatName,canRestore=()=>true}){
 const opener=document.querySelector('[data-open-account-copies]');if(!opener||opener.hidden)return;
 const accountStatus=document.querySelector('[data-account-copy-status]');
 const banner=document.createElement('aside');banner.className='project-copy-undo';banner.hidden=true;banner.innerHTML='<p role="status">Доступен предыдущий вариант проекта в этом браузере.</p><button class="secondary-action" type="button" data-open-previous-project>Вернуть предыдущий вариант</button>';
 document.querySelector('.project-intro').before(banner);
 const dialog=document.createElement('dialog');dialog.id='account-project-copies-dialog';dialog.setAttribute('aria-labelledby','account-copies-title');
 dialog.innerHTML=`<button class="brief-close" type="button" data-close-account-copies aria-label="Закрыть копии проекта">×</button><span class="eyebrow">Продолжить на другом устройстве</span><h2 id="account-copies-title">Копии проекта в аккаунте</h2><div data-copy-manager><p class="account-copies-intro">Сохраните текущий проект отдельной копией. Она будет доступна после входа в этот аккаунт на другом устройстве.</p><form class="account-copy-form"><fieldset><legend>Сохранить текущий проект</legend><label>Название копии<input name="copyName" maxlength="120" required placeholder="Например, корпоратив в мае"></label><p data-copy-current-summary></p><label class="account-copy-check"><input name="includeNotes" type="checkbox" checked> Заметки к выбранным работам и сохранённым примерам</label><label class="account-copy-check"><input name="includeContact" type="checkbox"> Имя и контакт для ответа</label><p class="account-copy-help">Описание события, выбранные команды и сохранённые примеры войдут в копию. Сохранение происходит только по кнопке.</p><button class="primary-action" type="submit">Сохранить новую копию</button></fieldset><p class="brief-local-note" role="status" data-copy-save-status></p></form><div class="account-copies-heading"><h3>Сохранённые копии</h3><button class="secondary-action" type="button" data-refresh-account-copies>Обновить</button></div><p class="brief-local-note" role="status" data-copy-list-status></p><ol class="account-copies-list" data-copy-list></ol><nav class="account-copies-pages" aria-label="Страницы сохранённых копий" data-copy-pages hidden><button class="secondary-action" type="button" data-copy-page="previous">← Новее</button><span data-copy-page-label></span><button class="secondary-action" type="button" data-copy-page="next">Раньше →</button></nav></div><section class="account-copy-preview" data-copy-preview hidden><button class="account-copy-back" type="button" data-back-copy-list>← К списку копий</button><div data-copy-preview-body></div><p class="brief-local-note" role="status" data-copy-action-status></p><button class="primary-action" type="button" data-confirm-copy disabled>Загрузить в мой проект</button></section>`;
 document.body.append(dialog);
 const manager=dialog.querySelector('[data-copy-manager]'),form=dialog.querySelector('form'),save=form.querySelector('[type=submit]'),fieldset=form.querySelector('fieldset'),name=form.elements.namedItem('copyName'),notes=form.elements.namedItem('includeNotes'),contact=form.elements.namedItem('includeContact'),sourceSummary=form.querySelector('[data-copy-current-summary]'),saveStatus=dialog.querySelector('[data-copy-save-status]'),list=dialog.querySelector('[data-copy-list]'),listStatus=dialog.querySelector('[data-copy-list-status]'),refresh=dialog.querySelector('[data-refresh-account-copies]'),pages=dialog.querySelector('[data-copy-pages]'),pageLabel=dialog.querySelector('[data-copy-page-label]'),previous=dialog.querySelector('[data-copy-page="previous"]'),next=dialog.querySelector('[data-copy-page="next"]'),preview=dialog.querySelector('[data-copy-preview]'),previewBody=dialog.querySelector('[data-copy-preview-body]'),actionStatus=dialog.querySelector('[data-copy-action-status]'),confirm=dialog.querySelector('[data-confirm-copy]');
 const filters=document.createElement('form');filters.className='account-copy-filters';filters.setAttribute('role','search');filters.setAttribute('aria-label','Поиск по копиям проекта');
 filters.innerHTML='<label>Поиск по названию<input name="query" type="search" maxlength="120" autocomplete="off" placeholder="Например, корпоратив Москва"></label><label>Порядок<select name="order"><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="name">По названию</option></select></label><button class="account-copy-back" type="button" data-reset-copy-search>Сбросить</button>';
 listStatus.before(filters);
 const query=filters.elements.namedItem('query'),order=filters.elements.namedItem('order'),reset=filters.querySelector('[data-reset-copy-search]');
 previous.textContent='← Назад';next.textContent='Далее →';
 let busy=false,editingName=false,listLoading=false,page=1,pageCount=1,listVersion=0,previewVersion=0,active=null,mode='restore',returnFocus=opener,searchTimer=null;
 function syncUndo(){banner.hidden=!previousProject();}
 function syncBusy(){fieldset.disabled=busy;query.disabled=busy;order.disabled=busy;reset.disabled=busy||(!query.value&&order.value==='newest');opener.disabled=busy;banner.querySelector('button').disabled=busy;dialog.querySelector('[data-back-copy-list]').disabled=busy;refresh.disabled=busy||listLoading;confirm.disabled=busy||editingName||!active;previous.disabled=busy||listLoading||page<=1;next.disabled=busy||listLoading||page>=pageCount;list.querySelectorAll('button').forEach(button=>button.disabled=busy);save.textContent=busy?'Сохраняем…':'Сохранить новую копию';}
 function currentSummary(){
  try{const summary=copySummary(currentProjectCopy(getState,{includeNotes:notes.checked,includeContact:contact.checked}));sourceSummary.textContent=`Команд: ${summary.teams} · Примеров: ${summary.references} · Заметок: ${summary.notes}`;save.disabled=busy;}
  catch(error){sourceSummary.textContent=errorMessage(error);save.disabled=true;}
 }
 function startListLoading(){listLoading=true;list.setAttribute('aria-busy','true');list.replaceChildren();pages.hidden=true;listStatus.textContent='Загружаем копии…';syncBusy();}
 function scheduleSearch(delay=0){clearTimeout(searchTimer);listVersion++;startListLoading();if(delay)searchTimer=setTimeout(()=>loadList(1),delay);else loadList(1);}
 async function loadList(requestedPage=page){
  clearTimeout(searchTimer);const version=++listVersion,search=query.value.trim();startListLoading();
  try{
   const params=new URLSearchParams({page:String(requestedPage),q:search,sort:order.value});
   const result=await copyRequest('/api/project-copies?'+params);if(version!==listVersion)return;
   if(!Array.isArray(result.items)||!result.items.every(validItem)||!['page','pages','total','totalSaved'].every(key=>Number.isSafeInteger(result[key])&&result[key]>=0)||result.page<1||result.pages<1)throw Error('invalid_list');
   page=result.page;pageCount=result.pages;
   list.innerHTML=result.items.map(item=>`<li><div><strong>${esc(item.name)}</strong><span>${esc(dateLabel(item.createdAt))}</span><p>Команд: ${item.teams} · Примеров: ${item.references} · Заметок: ${item.notes}${item.includeContact?' · С контактом':''}</p></div><div class="account-copy-row-actions"><button class="secondary-action" type="button" data-preview-copy="${item.id}">Открыть</button><button class="account-copy-delete" type="button" data-delete-copy="${item.id}" aria-label="Удалить копию ${esc(item.name)}">Удалить</button></div></li>`).join('');
   listStatus.textContent=!result.totalSaved?'Сохранённых копий пока нет.':search?(result.total?'Найдено: '+result.total+' из '+result.totalSaved:'По этому запросу копий нет. Измените запрос или сбросьте поиск.'):'Копий в аккаунте: '+result.totalSaved;pages.hidden=pageCount<=1;pageLabel.textContent=page+' / '+pageCount;
  }catch(error){if(version===listVersion)listStatus.textContent=errorMessage(error);}
  finally{if(version===listVersion){listLoading=false;list.setAttribute('aria-busy','false');syncBusy();}}
 }
 function showManager(){previewVersion++;active=null;editingName=false;preview.hidden=true;manager.hidden=false;dialog.scrollTop=0;syncBusy();}
 function open(){
  returnFocus=opener;showManager();name.value=([getState().brief.format?formatName(getState().brief.format):'Мой проект',getState().brief.city].filter(Boolean).join(' — ')).slice(0,120);notes.checked=true;contact.checked=false;saveStatus.textContent='';currentSummary();dialog.showModal();loadList(1);
 }
 async function showPreview(record,action='restore'){
  const version=++previewVersion;mode=action;active=null;editingName=false;manager.hidden=true;preview.hidden=false;previewBody.textContent='Загружаем копию…';actionStatus.textContent='';confirm.textContent=action==='delete'?'Удалить копию':'Загрузить в мой проект';syncBusy();dialog.scrollTop=0;
  try{
   const item=typeof record==='number'?await copyRequest('/api/project-copies/'+record):record;
   if(version!==previewVersion||!dialog.open)return;
   const snapshot=item.localPrevious?item.snapshot:normalizeProjectCopy(item.snapshot);if(!snapshot)throw Error('invalid_copy');
   const summary=copySummary(snapshot),data=await getData().catch(()=>null);if(version!==previewVersion||!dialog.open)return;
   const hasCatalog=Array.isArray(data?.agencies)&&Array.isArray(data?.projects);
   if(!hasCatalog&&action==='restore'&&!item.localPrevious)throw Object.assign(new Error('catalog_unavailable'),{code:'catalog_unavailable'});
   const prepared=hasCatalog?prepareCopyPreview(snapshot,data,{preserveAll:Boolean(item.localPrevious)}):null;
   active={...item,snapshot,prepared,loadSnapshot:prepared?.loadSnapshot||snapshot,referencesShown:6,partial:Boolean(prepared?.hasMissing&&!item.localPrevious)};
   if(action==='restore'&&active.partial)confirm.textContent='Загрузить доступное';
   previewBody.innerHTML=`<h3 tabindex="-1">${esc(item.name)}</h3>${item.createdAt?`<p class="account-copy-date">${esc(dateLabel(item.createdAt))}</p>`:''}<p>Команд: ${summary.teams} · Примеров: ${summary.references} · Заметок: ${summary.notes}</p><dl class="review-brief">${briefRows(snapshot.draft.brief).filter(([label])=>label!=='Пожелания').map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><h4>Пожелания</h4><p class="account-copy-wishes">${esc(snapshot.draft.brief.description||'Пока не указаны.')}</p>${prepared?`<h4>Команды и работы</h4>${copyTeamsMarkup(prepared.teams)}<h4>Сохранённые примеры</h4>${copyReferencesMarkup(prepared.references)}`:'<p class="copy-preview-empty">Каталог сейчас недоступен, поэтому названия и фотографии не загружены.</p>'}${action==='restore'?copyAvailabilityMarkup(prepared):''}<p class="account-copy-contact">${snapshot.includeContact?'Контакт в копии: '+esc(snapshot.draft.contact.name||'Имя не указано')+' · '+esc(snapshot.draft.contact.value||'Контакт не указан'):'Контакт в копию не включён.'+(action==='restore'?' При загрузке сохранится текущий контакт в этом браузере.':'')}</p><p class="account-copy-effect">${action==='delete'?'Эта копия будет удалена из аккаунта. Текущий проект в браузере останется на месте.':'Загрузка заменит описание события, выбранные команды и примеры в этом браузере. Предыдущий вариант сохранится для возврата.'}${action!=='delete'&&!snapshot.includeNotes?' Заметки в копию не включены — текущие заметки сохранятся.':''}</p>`;
   if(action==='restore'&&!item.localPrevious)setupCopyNameEditor({body:previewBody,item:active,isCurrent:()=>version===previewVersion&&dialog.open,onBusy:value=>{busy=value;syncBusy();},onEditing:value=>{editingName=value;syncBusy();},onRenamed:renamed=>{accountStatus.textContent='Название копии изменено на «'+renamed.name+'».';saveStatus.textContent=accountStatus.textContent;loadList(page);}});
   syncBusy();
   previewBody.querySelector('h3').focus({preventScroll:true});
  }catch(error){if(version===previewVersion){active=null;previewBody.textContent=errorMessage(error);syncBusy();}}
 }
 opener.addEventListener('click',()=>{if(!dialog.open)open();});
 dialog.querySelector('[data-close-account-copies]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{clearTimeout(searchTimer);listVersion++;listLoading=false;list.setAttribute('aria-busy','false');previewVersion++;active=null;editingName=false;returnFocus?.focus({preventScroll:true});});
 dialog.querySelector('[data-back-copy-list]').addEventListener('click',()=>{showManager();loadList(page);});
 notes.addEventListener('change',currentSummary);contact.addEventListener('change',currentSummary);
 filters.addEventListener('submit',event=>{event.preventDefault();if(!busy)scheduleSearch();});
 query.addEventListener('input',()=>scheduleSearch(300));order.addEventListener('change',()=>scheduleSearch());
 reset.addEventListener('click',()=>{query.value='';order.value='newest';scheduleSearch();query.focus({preventScroll:true});});
 refresh.addEventListener('click',()=>loadList(page));previous.addEventListener('click',()=>{if(page>1)loadList(page-1);});next.addEventListener('click',()=>{if(page<pageCount)loadList(page+1);});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const title=name.value.trim();if(!title){saveStatus.textContent='Введите название копии.';name.focus();return;}
  busy=true;syncBusy();saveStatus.textContent='Сохраняем копию в аккаунте…';
  try{const snapshot=currentProjectCopy(getState,{includeNotes:notes.checked,includeContact:contact.checked}),item=await saveAccountCopy(title,snapshot);saveStatus.textContent='Копия «'+item.name+'» сохранена в аккаунте.';accountStatus.textContent='Последняя сохранённая копия: «'+item.name+'».';query.value='';order.value='newest';await loadList(1);}
  catch(error){saveStatus.textContent=errorMessage(error);}
  finally{busy=false;syncBusy();currentSummary();}
 });
 list.addEventListener('click',event=>{if(busy)return;const open=event.target.closest('[data-preview-copy]'),remove=event.target.closest('[data-delete-copy]');if(open)showPreview(Number(open.dataset.previewCopy));if(remove)showPreview(Number(remove.dataset.deleteCopy),'delete');});
 previewBody.addEventListener('click',event=>{
  const button=event.target.closest('[data-more-copy-references]');if(!button||!active?.prepared||busy)return;
  const references=active.prepared.references,start=active.referencesShown,grid=previewBody.querySelector('[data-copy-reference-grid]');
  grid.insertAdjacentHTML('beforeend',copyReferenceCards(references,start));active.referencesShown=Math.min(start+6,references.length);
  button.hidden=active.referencesShown>=references.length;button.textContent='Показать ещё '+Math.min(6,references.length-active.referencesShown);
  const first=grid.querySelector('[data-copy-reference-index="'+start+'"]');first?.scrollIntoView({block:'nearest'});first?.focus({preventScroll:true});
 });
 confirm.addEventListener('click',async()=>{
  if(busy||editingName||!active)return;const selected=active;busy=true;syncBusy();actionStatus.textContent=mode==='delete'?'Удаляем копию…':'Загружаем проект…';
  try{
   if(mode==='delete'){await copyRequest('/api/project-copies/'+selected.id,{method:'DELETE'});showManager();await loadList(page);saveStatus.textContent='Копия «'+selected.name+'» удалена.';}
   else{if(!canRestore())throw Object.assign(new Error('sending_in_progress'),{code:'sending_in_progress'});restoreProjectCopy(selected.loadSnapshot,getState);syncUndo();banner.querySelector('p').textContent=(selected.partial?'Загружены доступные элементы копии «':'Загружен проект «')+selected.name+'». Предыдущий вариант доступен для возврата.';returnFocus=document.getElementById('project-overview');dialog.close();returnFocus.scrollIntoView({block:'start'});returnFocus.focus({preventScroll:true});}
  }catch(error){actionStatus.textContent=errorMessage(error);syncUndo();}
  finally{busy=false;syncBusy();}
 });
 banner.querySelector('button').addEventListener('click',()=>{
  const snapshot=previousProject();if(!snapshot)return;returnFocus=banner.querySelector('button');if(!dialog.open)dialog.showModal();showPreview({name:'Предыдущий вариант в этом браузере',snapshot,localPrevious:true});
 });
 setupNewProject({anchor:opener,getState,canStart:()=>!busy&&canRestore(),onStarted:()=>{syncUndo();banner.querySelector('p').textContent='Создан новый проект. Предыдущий вариант доступен для возврата в этом браузере.';},onStorageIssue:syncUndo});
 syncUndo();
}
