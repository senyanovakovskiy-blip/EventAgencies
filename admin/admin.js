import {occasions,contactMethods} from '/custom/project-store.js';
import {statusLabels} from './manual-model.js';
import {editorMarkup,wireEditor,readEditor,editorChanged,setEditorBusy,historyMarkup} from './manual-ui.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=statusLabels;
const $=selector=>document.querySelector(selector);
const emptyDetail=$('#request-detail').innerHTML;
const format=v=>occasions[v]||(v==='other'?'Другой формат':'Формат нужно уточнить');
const date=value=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
try{if(localStorage.getItem('zizi-theme')==='dark')document.documentElement.dataset.theme='dark';}catch{}
let csrf='',current=null,catalog=null,catalogPromise=null,page=1,listVersion=0,detailVersion=0,saving=false,loggingOut=false;
const getCatalog=()=>catalogPromise||(catalogPromise=api('/api/admin/catalog').then(data=>(catalog=data)).catch(error=>{catalogPromise=null;throw error;}));
const dirty=()=>editorChanged($('#operator-form'),current);
const allowLeave=()=>!dirty()||confirm('Есть несохранённые изменения. Уйти без сохранения?');
addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
async function api(url,options={}){
 let response;
 try{response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers}});}
 catch{throw Error('Нет связи с сервером. Попробуйте ещё раз.');}
 let data;try{data=await response.json();}catch{throw Error('Не удалось получить ответ сервера. Попробуйте ещё раз.');}
 if(!response.ok){
  if(response.status===401&&url!=='/api/admin/login')$('#reauth').hidden=false;
  const messages={authentication_required:'Сессия завершена. Войдите снова — несохранённые изменения остаются на экране.',invalid_credentials:'Неверный логин или пароль.',too_many_attempts:'Слишком много попыток. Попробуйте войти через 15 минут.',revision_conflict:'Заявка уже изменена в другой вкладке. Сохраните нужные правки отдельно и нажмите «Загрузить актуальную версию».',invalid_update:'Проверьте поля: заметка — до 5000 символов, причина закрытия — до 1500, ответ — до 16000.',invalid_recommendations:'Выберите до трёх разных агентств и кейсы, относящиеся к ним. Обоснование и вопросы — до 1200 символов.',shortlist_incomplete:'Для статуса «Подборка подготовлена» добавьте хотя бы одно агентство, обоснование и вопросы по каждой рекомендации.',not_found:'Заявка не найдена.',csrf_required:'Обновите вход в админку и попробуйте ещё раз.'};
  const error=Error(messages[data.error]||'Не удалось сохранить или загрузить данные. Попробуйте ещё раз.');error.code=data.error;throw error;
 }
 return data;
}
function showLogin(){ $('#login-view').hidden=false;$('#workspace').hidden=true;$('#logout').hidden=true;$('#initial-status').hidden=true; }
async function showWorkspace(session){csrf=session.csrf;$('#login-view').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;$('#reauth').hidden=true;$('#initial-status').hidden=true;await loadList();if(!current){const match=/^#request-(\d+)$/.exec(location.hash);if(match)await openDetail(Number(match[1]));}}
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;$('#login-status').textContent='Проверяем вход…';try{const session=await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:form.elements.username.value,password:form.elements.password.value})});form.elements.password.value='';$('#login-status').textContent='';await showWorkspace(session);}catch(error){$('#login-status').textContent=error.message;}finally{button.disabled=false;}});
$('#logout').addEventListener('click',async()=>{
 if(loggingOut||saving||!allowLeave())return;
 loggingOut=true;++detailVersion;++listVersion;
 setEditorBusy($('#operator-form'),true);$('#logout').disabled=true;
 try{const result=await api('/api/admin/logout',{method:'POST'});csrf='';current=null;$('#request-detail').innerHTML=emptyDetail;$('#request-list').replaceChildren();$('.inbox-layout').classList.remove('has-detail');history.replaceState(null,'','/admin');showLogin();if(result.signOutUrl==='/signout-with-chatgpt?return_to=/admin')location.assign(result.signOutUrl);}
 catch(error){$('#workspace-status').textContent=error.message;}
 finally{loggingOut=false;setEditorBusy($('#operator-form'),false);$('#logout').disabled=false;}
});
$('#reauth').addEventListener('click',()=>{if(document.body.dataset.hosted==='true'){location.assign('/signin-with-chatgpt?return_to=/admin');return;}showLogin();$('#login-form').elements.password.focus();});
async function loadList(){
 const version=++listVersion,params=new URLSearchParams({q:$('#filters').elements.q.value,status:$('#filters').elements.status.value,page:String(page)});
 $('#workspace-status').textContent='Обновляем список…';
 try{
  const data=await api('/api/admin/inquiries?'+params);if(version!==listVersion)return;page=data.page;
  $('#total-count').textContent=Object.values(data.counts).reduce((a,b)=>a+b,0);
  $('#list-count').textContent=data.total+' найдено';
  $('#status-counts').innerHTML=Object.entries({'':'Все',...labels}).map(([value,label])=>`<button type="button" data-filter="${value}" aria-pressed="${$('#filters').elements.status.value===value}">${label}<span>${value?data.counts[value]:Object.values(data.counts).reduce((a,b)=>a+b,0)}</span></button>`).join('');
  $('#request-list').innerHTML=data.items.length?data.items.map(row=>`<button class="request-row" data-id="${row.recordId}" aria-current="${current?.recordId===row.recordId}" aria-label="Открыть заявку ${esc(row.id)}"><span class="row-top"><span>${esc(row.id)}</span><time>${esc(date(row.createdAt))}</time></span><span class="row-name">${esc(row.name)}</span><span class="row-task">${esc([format(row.format),row.city||'Город нужно уточнить',row.guests&&row.guests+' гостей'].filter(Boolean).join(' · '))}</span><span class="row-detail">Дата: ${esc(row.dateUnknown?'пока неизвестна':row.date||'нужно уточнить')}</span>${row.budgetHelp||row.budget?`<span class="row-detail">Бюджет: ${esc(row.budgetHelp?'нужна помощь с оценкой':Number(row.budget).toLocaleString('ru-RU')+' ₽')}</span>`:''}<span class="row-bottom"><span class="badge" data-status="${row.status}">${labels[row.status]}</span>${row.test?'<span class="test-badge">Тестовая</span>':`<span>${row.agencies.length?row.agencies.length+(row.agencies.length===1?' команда':' команды'):'Помощь с подбором'}</span>`}</span></button>`).join(''):'<p class="empty-list">Заявок по этим условиям пока нет. Измените поиск или статус.</p>';
  $('#pagination').hidden=data.pages<=1;$('#page-label').textContent=page+' / '+data.pages;$('#prev-page').disabled=page<=1;$('#next-page').disabled=page>=data.pages;
  $('#workspace-status').textContent='Список обновлён · '+new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date());
 }catch(error){if(version===listVersion)$('#workspace-status').textContent=error.message;}
}
function renderDetail(data){
 const r=data.receipt,b=r.brief;
 const facts=[['Формат',format(b.format)],['Город',b.city||'Нужно уточнить'],['Дата или период',b.dateUnknown?'Дата пока неизвестна':b.date||'Нужно уточнить'],['Количество гостей',b.guests||'Нужно уточнить'],['Ориентировочный бюджет',b.budgetHelp?'Нужна помощь с оценкой бюджета':b.budget?b.budget+' ₽':'Нужно уточнить'],['Пожелания',b.description||'Пока не указаны.']];
 $('#request-detail').innerHTML=`<button class="mobile-back" data-back-list>← К списку заявок</button><div class="detail-header"><div><span class="eyebrow">${esc(r.id)}</span><h2>${esc(r.contact.name)}</h2><p class="muted">Получена ${esc(date(r.createdAt))}</p></div><span class="badge" data-status="${data.status}">${labels[data.status]}</span></div><div class="detail-jumps"><button type="button" class="text-button" data-jump-target="admin-recommendations">К рекомендациям ↓</button><button type="button" class="text-button" data-jump-target="admin-reply">К ответу заказчику ↓</button></div><section class="detail-section"><h3>Мероприятие</h3><dl class="facts">${facts.map(([k,v])=>`<div class="${k==='Пожелания'?'fact-wide':''}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section><section class="detail-section"><h3>Первоначальный выбор заказчика</h3><p class="small muted customer-choice-note">Состав заявки на момент отправки. Рекомендации администратора находятся ниже.</p>${r.selection.length?r.selection.map(s=>`<div class="agency-item"><a href="/agency/${esc(s.agencySlug)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a><p>${s.work?`<a href="/work/${esc(s.work.slug)}" target="_blank" rel="noopener">${esc(s.work.title)} ↗</a>`:'Кейс не выбран'}</p></div>`).join(''):'<p class="muted">Агентства пока не выбраны. Заказчику нужна помощь с подбором.</p>'}<p class="small muted">Участие агентств, дата и стоимость пока не подтверждены.</p></section><section class="detail-section"><h3>Контакт для ответа</h3><dl class="facts"><div><dt>Имя</dt><dd>${esc(r.contact.name)}</dd></div><div><dt>${esc(contactMethods[r.contact.method])}</dt><dd>${esc(r.contact.value)}</dd></div></dl></section>${editorMarkup(data,catalog)}${historyMarkup(data.history)}`;
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
 event.preventDefault();if(saving)return;const form=event.currentTarget,id=current.recordId;const input={...readEditor(form),revision:current.revision};
 saving=true;setEditorBusy(form,true);$('#save-status').textContent='Сохраняем…';
 try{const data=await api('/api/admin/inquiries/'+id,{method:'PATCH',body:JSON.stringify(input)});if(current.recordId===id){current=data;renderDetail(data);$('#save-status').textContent='Изменения сохранены на сервере';$('#operator-form button[type=submit]').focus({preventScroll:true});}await loadList();}
 catch(error){if(current.recordId===id){$('#save-status').textContent=error.message;if(error.code==='revision_conflict')$('#reload-detail').hidden=false;}}
 finally{saving=false;setEditorBusy($('#operator-form'),false);}
}
$('#request-list').addEventListener('click',event=>{const row=event.target.closest('[data-id]');if(row)openDetail(Number(row.dataset.id));});
$('#status-counts').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(button){$('#filters').elements.status.value=button.dataset.filter;page=1;loadList();}});
$('#filters').addEventListener('submit',event=>{event.preventDefault();page=1;loadList();});$('#filters').elements.status.addEventListener('change',()=>{page=1;loadList();});$('#reset-filters').addEventListener('click',()=>{$('#filters').reset();page=1;loadList();});$('#refresh').addEventListener('click',loadList);
$('#prev-page').addEventListener('click',()=>{page--;loadList();});$('#next-page').addEventListener('click',()=>{page++;loadList();});
$('#request-detail').addEventListener('click',event=>{if(event.target.closest('[data-back-list]')){$('.inbox-layout').classList.remove('has-detail');$('.request-list-panel').scrollIntoView({block:'start'});}});
try{const session=await api('/api/admin/session');if(session.authenticated)await showWorkspace(session);else showLogin();}catch(error){$('#initial-status').textContent=error.message;}
