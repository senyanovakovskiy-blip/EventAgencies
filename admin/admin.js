import {occasions,contactMethods} from '/custom/project-store.js';
import {statusLabels} from './manual-model.js';
import {editorMarkup,wireEditor,readEditor,editorChanged,setEditorBusy,historyMarkup,revealEditorError,selectStage} from './manual-ui.js';
import {capturePreparationView,restorePreparationView} from './preparation-ui.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=statusLabels;
const $=selector=>document.querySelector(selector);
const emptyDetail=$('#request-detail').innerHTML;
const format=v=>occasions[v]||(v==='other'?'Другой формат':'Формат нужно уточнить');
const date=value=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
try{if(localStorage.getItem('zizi-theme')==='dark')document.documentElement.dataset.theme='dark';}catch{}
let csrf='',accessKind='',invitationActive=false,current=null,catalog=null,catalogPromise=null,page=1,listVersion=0,detailVersion=0,saving=false,loggingOut=false;
const getCatalog=()=>catalogPromise||(catalogPromise=api('/api/admin/catalog').then(data=>(catalog=data)).catch(error=>{catalogPromise=null;throw error;}));
const dirty=()=>editorChanged($('#operator-form'),current);
const allowLeave=()=>!dirty()||confirm('Есть несохранённые изменения. Уйти без сохранения?');
addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
async function api(url,options={}){
 let response;const {timeoutMs,...requestOptions}=options;let controller,timer;
 try{if(timeoutMs){controller=new AbortController();timer=setTimeout(()=>controller.abort(),timeoutMs);}response=await fetch(url,{credentials:'same-origin',cache:'no-store',...requestOptions,...(controller?{signal:controller.signal}:{}),headers:{...(requestOptions.body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...requestOptions.headers}});}
 catch(error){if(error?.name==='AbortError')throw Error(`Сервер не ответил за ${Math.round(timeoutMs/1000)} секунд. Нажмите «Повторить подключение».`);throw Error('Нет связи с сервером. Попробуйте ещё раз.');}
 finally{if(timer)clearTimeout(timer);}
 let data;try{data=await response.json();}catch{throw Error('Не удалось получить ответ сервера. Попробуйте ещё раз.');}
 if(!response.ok){
  if(response.status===401&&url!=='/api/admin/login')$('#reauth').hidden=false;
  const messages={admin_required:'У этого аккаунта нет доступа к админке. Войдите в аккаунт администратора.',invalid_preparation:'Проверьте внутреннюю подготовку: до 30 записей; предел каждого поля указан под ним.',preparation_too_large:'Во внутренней подготовке допустимо до 24 000 символов суммарно. Сократите текст; ввод остался на странице.',keep_preparation_history:'Сохранённые записи подготовки нельзя потерять при переключении. Загрузите актуальную заявку, предварительно сохранив нужный ввод отдельно.',too_large:'Объём карточки превышает 256 КиБ. Сократите длинные рабочие тексты и повторите сохранение. Ввод остался на странице.',invalid_workflow:'Проверьте бриф, команды, общий черновик идеи и отдельные подачи (до 30 записей, по 2400 символов и не более 24000 суммарно). Несохранённый ввод остался на странице.',brief_confirmation_required:'Заполните все поля брифа и укажите, кто и когда подтвердил его.',refusal_reason_required:'Укажите причину отказа агентства.',response_note_required:'Укажите, когда и что ответило агентство.',consent_note_required:'Укажите, кто, когда и как дал согласие или отказал.',introduction_not_ready:'Для передачи контактов нужны подтверждённый бриф, интерес агентства, согласие обеих сторон и запись о передаче.',keep_recorded_events:'Состоявшиеся действия нельзя отменить. Уточните обстоятельства в заметке или результате.',keep_team_history:'Нельзя удалить историю работы с командой. Зафиксируйте отказ или результат.',conversation_incomplete:'Для состоявшегося разговора укажите передачу контактов, итоги и следующий шаг.',authentication_required:'Сессия завершена. Войдите снова — несохранённые изменения остаются на экране.',invalid_credentials:'Неверный логин или пароль.',too_many_attempts:'Слишком много попыток. Попробуйте войти через 15 минут.',revision_conflict:'Заявка уже изменена в другой вкладке. Сохраните нужные правки отдельно и нажмите «Загрузить актуальную версию».',invalid_update:'Проверьте поля: заметка — до 5000 символов, причина закрытия — до 1500, ответ — до 16000.',invalid_recommendations:'Выберите до трёх разных агентств и кейсы, относящиеся к ним. Обоснование и вопросы — до 1200 символов.',shortlist_incomplete:'Для статуса «Подборка подготовлена» добавьте хотя бы одно агентство, обоснование и вопросы по каждой рекомендации.',not_found:'Заявка не найдена.',csrf_required:'Обновите вход в админку и попробуйте ещё раз.'};
  const error=Error(messages[data.error]||'Не удалось сохранить или загрузить данные. Попробуйте ещё раз.');error.code=data.error;throw error;
 }
 return data;
}
function showLogin(){ $('#login-view').hidden=false;$('#workspace').hidden=true;$('#logout').hidden=true;$('#initial-status').hidden=true;$('#invitation-panel').hidden=true;$('#access-note').hidden=true; }
const invitationDate=value=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeStyle:'short'}).format(new Date(value));
async function refreshInvitation(){
 const data=await api('/api/admin/invitation');invitationActive=Boolean(data.active);
 $('#invitation-status').textContent=data.active?'Ссылка действует до '+invitationDate(data.expiresAt)+(data.source==='existing'?' · сохраните ранее полученную ссылку; повторно показать её нельзя.':''):'Активной ссылки сейчас нет.';
 $('#revoke-invitation').hidden=!data.active;
}
async function showWorkspace(session){
 csrf=session.csrf;accessKind=session.accessKind||'';$('#login-view').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;$('#reauth').hidden=true;$('#initial-status').hidden=true;
 const invited=accessKind==='invitation';$('#invitation-panel').hidden=invited||document.body.dataset.hosted!=='true';$('#access-note').hidden=!invited;
 if(invited)$('#access-note').textContent='Вы вошли по секретной ссылке как администратор. Доступ действует до '+invitationDate(session.expiresAt)+'.';
 if(!invited&&document.body.dataset.hosted==='true'){try{await refreshInvitation();}catch(error){$('#invitation-status').textContent=error.message;}}
 let internalError='';if(document.body.dataset.hosted==='true'){try{await api('/api/admin/inquiries/internal',{method:'POST'});}catch(error){internalError='Внутреннее обращение не удалось сохранить: '+error.message;}}
 await loadList();if(internalError)$('#workspace-status').textContent=internalError;if(!current){const match=/^#request-(\d+)$/.exec(location.hash);if(match)await openDetail(Number(match[1]));}
}
$('#issue-invitation').addEventListener('click',async()=>{
 if(invitationActive&&!confirm('Создать новую ссылку? Предыдущая перестанет работать.'))return;
 const button=$('#issue-invitation');button.disabled=true;$('#invitation-status').textContent='Создаём ссылку…';$('#invitation-link-box').hidden=true;$('#invitation-copy-status').textContent='';
 try{const result=await api('/api/admin/invitation',{method:'POST',body:'{}'});invitationActive=true;$('#invitation-link').value=result.url;$('#invitation-link-box').hidden=false;$('#invitation-status').textContent='Ссылка действует до '+invitationDate(result.expiresAt)+'. Скопируйте её и передайте лично.';$('#revoke-invitation').hidden=false;$('#invitation-link').focus();$('#invitation-link').select();}
 catch(error){$('#invitation-status').textContent=error.message;}
 finally{button.disabled=false;}
});
$('#revoke-invitation').addEventListener('click',async()=>{
 if(!invitationActive||!confirm('Отозвать ссылку сейчас? Вход по ней сразу прекратится.'))return;
 const button=$('#revoke-invitation');button.disabled=true;$('#invitation-status').textContent='Отзываем ссылку…';
 try{await api('/api/admin/invitation',{method:'DELETE'});invitationActive=false;$('#invitation-link-box').hidden=true;$('#invitation-link').value='';$('#invitation-status').textContent='Ссылка отозвана. Приглашённый доступ закрыт.';button.hidden=true;}
 catch(error){$('#invitation-status').textContent=error.message;}
 finally{button.disabled=false;}
});
$('#copy-invitation-link').addEventListener('click',async()=>{
 const field=$('#invitation-link'),status=$('#invitation-copy-status');
 try{await navigator.clipboard.writeText(field.value);status.textContent='Ссылка скопирована.';}
 catch{field.focus();field.select();const copied=document.execCommand('copy');status.textContent=copied?'Ссылка скопирована.':'Ссылка выделена — скопируйте её вручную.';}
});
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;$('#login-status').textContent='Проверяем вход…';try{const session=await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:form.elements.username.value,password:form.elements.password.value})});form.elements.password.value='';$('#login-status').textContent='';await showWorkspace(session);}catch(error){$('#login-status').textContent=error.message;}finally{button.disabled=false;}});
$('#logout').addEventListener('click',async()=>{
 if(loggingOut||saving||!allowLeave())return;
 loggingOut=true;++detailVersion;++listVersion;
 setEditorBusy($('#operator-form'),true);$('#logout').disabled=true;
 try{const result=await api('/api/admin/logout',{method:'POST'});csrf='';current=null;$('#request-detail').innerHTML=emptyDetail;$('#request-list').replaceChildren();$('.inbox-layout').classList.remove('has-detail');history.replaceState(null,'','/admin');showLogin();if(['/signout-with-chatgpt?return_to=/admin','/invite'].includes(result.signOutUrl))location.assign(result.signOutUrl);}
 catch(error){$('#workspace-status').textContent=error.message;}
 finally{loggingOut=false;setEditorBusy($('#operator-form'),false);$('#logout').disabled=false;}
});
$('#reauth').addEventListener('click',async()=>{
 if(accessKind==='invitation'){
  try{const session=await api('/api/admin/session');csrf=session.csrf;$('#reauth').hidden=true;$('#workspace-status').textContent='Доступ восстановлен. Можно сохранить ваши изменения.';}
  catch{$('#workspace-status').textContent='Откройте полную ссылку-приглашение в новой вкладке, затем нажмите «Войти снова» здесь. Если срок доступа истёк, попросите новую ссылку у владельца. Ваши изменения остаются на экране.';}
  return;
 }
 if(document.body.dataset.hosted==='true'){location.assign('/signin-with-chatgpt?return_to=/admin');return;}showLogin();$('#login-form').elements.password.focus();
});
async function loadList(){
 const version=++listVersion,params=new URLSearchParams({q:$('#filters').elements.q.value,status:$('#filters').elements.status.value,page:String(page)});
 $('#workspace-status').textContent='Обновляем список…';
 try{
  const data=await api('/api/admin/inquiries?'+params);if(version!==listVersion)return;page=data.page;
  $('#total-count').textContent=Object.values(data.counts).reduce((a,b)=>a+b,0);
  $('#list-count').textContent=data.total+' найдено';
  $('#status-counts').innerHTML=Object.entries({'':'Все',...labels}).map(([value,label])=>`<button type="button" data-filter="${value}" aria-pressed="${$('#filters').elements.status.value===value}">${label}<span>${value?data.counts[value]:Object.values(data.counts).reduce((a,b)=>a+b,0)}</span></button>`).join('');
  $('#request-list').innerHTML=data.items.length?data.items.map(row=>`<button class="request-row" data-id="${row.recordId}" aria-current="${current?.recordId===row.recordId}" aria-label="Открыть заявку ${esc(row.id)}"><span class="row-top"><span>${esc(row.id)}</span><time>${esc(date(row.createdAt))}</time></span><span class="row-name">${esc(row.name)}</span><span class="row-task">${esc([format(row.format),row.city||'Город нужно уточнить',row.guests&&row.guests+' гостей'].filter(Boolean).join(' · '))}</span><span class="row-detail">Дата: ${esc(row.dateUnknown?'пока неизвестна':row.date||'нужно уточнить')}</span>${row.budgetHelp||row.budget?`<span class="row-detail">Бюджет: ${esc(row.budgetHelp?'нужна помощь с оценкой':Number(row.budget).toLocaleString('ru-RU')+' ₽')}</span>`:''}${row.nextAction?`<span class="row-next">Далее: ${esc(row.nextAction.action)}</span>`:''}<span class="row-bottom"><span class="badge" data-status="${row.status}">${labels[row.status]}</span>${row.internal?'<span class="internal-badge">Внутренняя · без контакта</span>':row.test?'<span class="test-badge">Тестовая</span>':`<span>${row.agencies.length?row.agencies.length+' команды':'Помощь с подбором'}</span>`}</span></button>`).join(''):'<p class="empty-list">Заявок по этим условиям пока нет. Измените поиск или статус.</p>';
  $('#pagination').hidden=data.pages<=1;$('#page-label').textContent=page+' / '+data.pages;$('#prev-page').disabled=page<=1;$('#next-page').disabled=page>=data.pages;
  $('#workspace-status').textContent='Список обновлён · '+new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date());
 }catch(error){if(version===listVersion)$('#workspace-status').textContent=error.message;}
}
function customerAgencyQuestionsMarkup(receipt,catalog){
 const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/\s+/g,' ').trim(),blocks=String(receipt?.brief?.description||'').split(/\n\s*\n/),questions=[];
 for(const block of blocks){
  const match=block.match(/^Вопрос к агентству\s+«([^»]+)»:\s*(.+)$/im);if(!match)continue;
  const name=match[1].trim(),question=match[2].trim();if(!name||!question)continue;
  const matches=(catalog?.agencies||[]).filter(agency=>normalize(agency.name)===normalize(name)),agency=matches.length===1?matches[0]:null;
  const key=JSON.stringify([agency?.slug||name,question]);if(questions.some(item=>item.key===key))continue;
  questions.push({key,name,question,agency,selected:Boolean(agency&&(receipt.selection||[]).some(selection=>selection.agencySlug===agency.slug))});
 }
 if(!questions.length)return '';
 return `<section class="agency-question-note" aria-label="Вопросы заказчика к конкретным агентствам"><span class="eyebrow">Ориентир для обсуждения</span><h3>Вопрос заказчика к агентству</h3>${questions.map(item=>`<div class="agency-question-item"><p class="agency-question-team"><strong>${esc(item.agency?.name||item.name)}</strong><span class="badge">${item.agency?(item.selected?'В заявке':'Пока не выбрано'):'Не найдено в каталоге'}</span></p><p>${esc(item.question)}</p>${item.agency?`<a href="/agency/${esc(item.agency.slug)}" target="_blank" rel="noopener">Профиль команды ↗</a>`:'<p class="small muted">Сверьте название с текущим каталогом перед продолжением.</p>'}</div>`).join('')}<p class="small muted">Вопрос сохранён в пожеланиях. Он показывает интерес к разговору, но сам по себе не означает выбор команды или согласование сценария.</p></section>`;
}
function renderDetail(data){
 const r=data.receipt,b=r.brief;
 const internal=r.origin==='admin-generated';
 const facts=[['Формат',format(b.format)],['Город',b.city||'Нужно уточнить'],['Дата или период',b.dateUnknown?'Дата пока неизвестна':b.date||'Нужно уточнить'],['Количество гостей',b.guests||'Нужно уточнить'],['Ориентировочный бюджет',b.budgetHelp?'Нужна помощь с оценкой бюджета':b.budget?b.budget+' ₽':'Нужно уточнить'],['Пожелания',b.description||'Пока не указаны.']];
 $('#request-detail').innerHTML=`<button class="mobile-back" data-back-list>← К списку заявок</button><div class="detail-header"><div><span class="eyebrow">${esc(r.id)}${internal?' · внутренняя запись':''}</span><h2>${esc(r.contact.name)}</h2><p class="muted">${internal?'Создано владельцем · параметры сгенерированы':`Получена ${esc(date(r.createdAt))}`}</p></div><span class="badge" data-status="${data.status}">${labels[data.status]}</span></div><p class="request-contact">${internal?'Контакт не указан · запись создана в админке':`${esc(contactMethods[r.contact.method])}: ${esc(r.contact.value)}`}</p>${customerAgencyQuestionsMarkup(r,catalog)}<details class="source-request"><summary>Исходная заявка и выбор заказчика</summary><section class="detail-section"><h3>Исходная заявка</h3><dl class="facts">${facts.map(([k,v])=>`<div class="${k==='Пожелания'?'fact-wide':''}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section><section class="detail-section"><h3>Первоначальный выбор заказчика</h3>${r.selection.length?r.selection.map(s=>`<div class="agency-item"><a href="/agency/${esc(s.agencySlug)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a><p>${s.work?`<a href="/work/${esc(s.work.slug)}" target="_blank" rel="noopener">${esc(s.work.title)} ↗</a>`:'Кейс не выбран'}</p><button type="button" class="text-button" data-open-preparation="${esc(s.agencySlug)}" data-preparation-work="${esc(s.workSlug||s.work?.slug||'')}">Досье и подготовка разговора</button></div>`).join(''):'<p class="muted">Подбор агентств не выполнялся.</p>'}</section></details>${editorMarkup(data,catalog)}${historyMarkup(data.history,catalog)}`;
 wireEditor({data,catalog,onSave:saveDetail,onReload:()=>openDetail(data.recordId)});
}
async function openDetail(id){
 if(loggingOut||!allowLeave())return;const version=++detailVersion;
 const departingEditor=$('#operator-form'),departingValues=JSON.stringify(readEditor(departingEditor));
 try{
  const [data]=await Promise.all([api('/api/admin/inquiries/'+id),getCatalog()]);if(version!==detailVersion||loggingOut)return;
  // A delayed navigation must not discard edits made after the initial confirmation.
  if(($('#operator-form')!==departingEditor||JSON.stringify(readEditor(departingEditor))!==departingValues)&&!allowLeave())return;
  current=data;renderDetail(data);history.replaceState(null,'','/admin#request-'+id);$('.inbox-layout').classList.add('has-detail');document.querySelectorAll('[data-id]').forEach(row=>row.setAttribute('aria-current',String(Number(row.dataset.id)===id)));if(matchMedia('(max-width:760px)').matches){$('#request-detail').scrollIntoView({block:'start'});$('#request-detail').focus({preventScroll:true});}
 }catch(error){if(version===detailVersion&&!loggingOut)$('#workspace-status').textContent=error.message;}
}
async function saveDetail(event){
 event.preventDefault();if(saving)return;const form=event.currentTarget,id=current.recordId;const view={stage:form.dataset.stage,preparation:capturePreparationView(form)};const input={...readEditor(form),revision:current.revision};
 saving=true;setEditorBusy(form,true);$('#save-status').textContent='Сохраняем…';
 try{const data=await api('/api/admin/inquiries/'+id,{method:'PATCH',body:JSON.stringify(input)});if(current.recordId===id){current=data;renderDetail(data);selectStage($('#operator-form'),view.stage);restorePreparationView($('#operator-form'),view.preparation);$('#save-status').textContent='Изменения сохранены на сервере';$('#operator-form button[type=submit]').focus({preventScroll:true});}await loadList();}
 catch(error){if(current.recordId===id){$('#save-status').textContent=error.message;revealEditorError(form,error.code);$('#save-status').focus();if(error.code==='revision_conflict')$('#reload-detail').hidden=false;}}
 finally{saving=false;setEditorBusy($('#operator-form'),false);}
}
$('#request-list').addEventListener('click',event=>{const row=event.target.closest('[data-id]');if(row)openDetail(Number(row.dataset.id));});
$('#status-counts').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(button){$('#filters').elements.status.value=button.dataset.filter;page=1;loadList();}});
$('#filters').addEventListener('submit',event=>{event.preventDefault();page=1;loadList();});$('#filters').elements.status.addEventListener('change',()=>{page=1;loadList();});$('#reset-filters').addEventListener('click',()=>{$('#filters').reset();page=1;loadList();});$('#refresh').addEventListener('click',loadList);
$('#prev-page').addEventListener('click',()=>{page--;loadList();});$('#next-page').addEventListener('click',()=>{page++;loadList();});
$('#request-detail').addEventListener('click',event=>{if(event.target.closest('[data-back-list]')){$('.inbox-layout').classList.remove('has-detail');$('.request-list-panel').scrollIntoView({block:'start'});}});
async function initializeAdmin(){
 const status=$('#initial-status'),retry=$('#initial-retry');retry.hidden=true;status.hidden=false;status.textContent='Открываем рабочее пространство…';
 try{const session=await api('/api/admin/session',{timeoutMs:12000});if(session.authenticated)await showWorkspace(session);else showLogin();}
 catch(error){status.textContent=error.message;retry.hidden=false;}
}
$('#initial-retry').addEventListener('click',initializeAdmin);
initializeAdmin();
