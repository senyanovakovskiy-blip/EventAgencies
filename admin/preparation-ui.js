import {draftFor,preparationContext as identity,preparationUnknowns as unknowns} from './preparation-draft.js';
import {preparationFields,preparationKey,emptyPreparation,normalizePreparation,preparationLength,PREPARATION_LIMIT,PREPARATION_MAX_ITEMS} from './preparation-model.js';
import {preparationComparisonMarkup,wirePreparationComparison} from './preparation-comparison-ui.js';
const preparationViews=new WeakMap();
export const capturePreparationView=form=>preparationViews.get(form)?.capture()||null;
export const restorePreparationView=(form,view)=>preparationViews.get(form)?.restore(view);
export const syncPreparationViewControls=form=>preparationViews.get(form)?.controls();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=value=>Array.isArray(value)?value.join(', '):typeof value==='string'?value:'';
const worksFor=(catalog,slug)=>catalog.projects.filter(p=>p.agencySlug===slug||p.agencySlugs?.includes(slug));
const sourceLink=(url,label)=>{try{const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)?`<a href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';}catch{return '';}};
const fact=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(text(value)||'В текущей справке не указано')}</dd></div>`;
function workPicker(entry,catalog){
 const works=worksFor(catalog,entry.agencySlug),work=catalog.projects.find(p=>p.slug===entry.workSlug),linked=works.some(p=>p.slug===entry.workSlug);
 return `<div class="preparation-work-picker"><label>Работа для обсуждения<select data-dossier-work><option value="">Без конкретной работы</option>${entry.workSlug&&!linked?`<option value="${esc(entry.workSlug)}" selected>${esc(work?.fullTitle||entry.workSlug)} · прежний выбор, связь недоступна</option>`:''}${works.map(p=>`<option value="${esc(p.slug)}" ${p.slug===entry.workSlug?'selected':''}>${esc(p.fullTitle)}${p.kind==='case'?'':p.kind==='collection'?' · фотоподборка':' · портфолио'}</option>`).join('')}</select></label><p class="small muted">${works.length} работ в текущем каталоге. Переключение сохраняет ваш ввод на странице и не меняет исходный выбор или рекомендации.</p></div>`;
}
// Current page copy only; never substitute rawDescription or draft fields.
function siteCopy(entity,{kind,name,empty,warning=''}){
 const copy=Object.fromEntries(['lead','intro','fit','participation'].map(key=>[key,typeof entity?.presentation?.[key]==='string'?entity.presentation[key].trim():'']));
 const heading=kind==='agency'?'Агентство':'Работа',linkLabel=kind==='agency'?'Открыть профиль агентства':'Открыть страницу работы';
 return `<section class="preparation-site-copy"><h5>${heading} · ${esc(name)}</h5>${warning?`<p class="preparation-context-warning">${esc(warning)}</p>`:''}${entity?`${Object.values(copy).some(Boolean)?`${copy.lead?`<p class="preparation-site-lead">${esc(copy.lead)}</p>`:''}${copy.intro?`<p>${esc(copy.intro)}</p>`:''}<dl class="preparation-site-fit"><div><dt>Если вам близко</dt><dd${copy.fit?'':' class="muted"'}>${esc(copy.fit||'Эта подсказка сейчас не передана в админку.')}</dd></div>${copy.participation?`<div><dt>Участие команды — как указано на сайте</dt><dd>${esc(copy.participation)}</dd></div>`:''}</dl>`:'<p class="muted">Клиентское описание сейчас не передано в админку. Можно свериться со страницей; исходная техническая справка доступна в досье ниже.</p>'}<a class="preparation-site-link" href="/${kind}/${esc(entity.slug)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(linkLabel+': '+name+' (новая вкладка)')}">${linkLabel} ↗</a>`:`<p class="muted">${esc(empty)}</p>`}</section>`;
}
function sitePresentation(entry,catalog,receipt){
 const {agency,work,name,title,linked}=identity(entry,catalog,receipt);
 return `<section class="preparation-site-context"><h4>Как вариант представлен на сайте сейчас</h4><p class="small muted">Это тексты сайта, а не слова клиента. Они могли измениться после выбора. Что именно привлекло человека, ещё нужно спросить.</p><div class="preparation-site-grid">${siteCopy(agency,{kind:'agency',name,empty:'Агентство отсутствует в текущем каталоге. Его нынешнее описание недоступно. Подготовку для этого варианта можно продолжить ниже.'})}${siteCopy(work,{kind:'work',name:title,empty:entry.workSlug?'Сохранённая работа отсутствует в текущем каталоге. Её нынешнее описание недоступно. Подготовку для этого варианта можно продолжить ниже.':'Работа не выбрана. Сейчас можно подготовить разговор об агентстве.',warning:work&&(!agency||!linked)?'Сейчас каталог не связывает эту работу с доступным профилем выбранного агентства. Ниже — текст самой работы; он не подтверждает участие этой команды.':''})}</div></section>`;
}
function dossier(entry,catalog,receipt){
 const {agency,work,name}=identity(entry,catalog,receipt),works=worksFor(catalog,entry.agencySlug),linked=works.some(p=>p.slug===entry.workSlug),detail=work?.details||{};
 return `<details class="operator-dossier"><summary>Техническое досье: факты, роли и что уточнить</summary><p class="small muted">Исходные сведения каталога и публикаций о прошедших работах. Это отдельная справка, не клиентское описание выше. Она не подтверждает качество, текущий состав команды или условия будущего события.</p>
 <h4>${esc(name)}</h4>${agency?`<p class="dossier-links"><a href="/agency/${esc(agency.slug)}" target="_blank" rel="noopener">Профиль ↗</a> ${sourceLink(agency.website,'Сайт агентства')}</p><dl class="dossier-facts">${fact('Специализация в каталоге',(agency.types||[]).map(key=>catalog.types[key]||key))}${fact('Город',agency.city)}${fact('География',agency.geography)}${fact('Услуги',agency.services)}${fact('Условия бюджета в справке',agency.budgetConditions)}</dl><h5>Исходная справка каталога</h5><p class="dossier-copy">${esc(agency.rawDescription||'Исходное описание агентства не заполнено.')}</p><p class="small muted">Текст сохранён как исходная справка; утверждения следует сверять с сайтом агентства.</p>`:'<p>Профиль сейчас недоступен. Название из исходной заявки, если оно сохранено, показано выше.</p>'}
 ${work?`<h4>${esc(work.fullTitle)}</h4><p class="dossier-links"><a href="/work/${esc(work.slug)}" target="_blank" rel="noopener">Страница работы ↗</a> ${sourceLink(work.source,'Первоисточник работы')}</p><h5>Исходная справка каталога</h5><p class="dossier-copy">${esc(work.rawDescription||'Исходное описание работы не заполнено.')}</p><dl class="dossier-facts">${fact('Тип записи',work.kind==='case'?'Кейс':work.kind==='collection'?'Фотоподборка':'Работа из портфолио')}${fact('Формат',work.format||work.category)}${fact('Место',work.eventCity)}${fact('Площадка по каталогу',work.venue)}${fact('Дата прошедшей работы',work.eventDate||work.year)}${fact('Участники',work.guestLabel)}${fact('Роль команды по каталогу',work.role)}</dl><h5>Опубликованные сведения по первоисточнику</h5><p class="small muted">${detail.source?'Редакционная выжимка опубликованного описания; не независимая проверка.':'Подробная выжимка из первоисточника пока не заполнена. Общая справка выше не заменяет её.'}${detail.reviewedAt?' Дата разбора: '+esc(detail.reviewedAt)+'.':''}</p><dl class="dossier-facts dossier-long">${fact('Задача',detail.task)}${fact('Идея / приём',detail.idea)}${fact('Роль',detail.role)}${fact('Результат и опубликованные оговорки',detail.result)}</dl>${sourceLink(detail.source,'Источник подробного разбора')}`:`<p class="muted">${entry.workSlug?'Сохранённая работа отсутствует в текущем каталоге.':'Работа пока не выбрана: доступна подготовка разговора об агентстве.'}</p>`}
 <h5>Неизвестное и что уточнить</h5><ul>${unknowns(agency,work,linked).map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details>`;
}
function cardMarkup(entry,catalog,receipt,saved=false){
 const {name,title}=identity(entry,catalog,receipt);
 const statusId='preparation-'+entry.agencySlug+'--'+(entry.workSlug?'work-'+entry.workSlug:'agency')+'-generation';
 return `<article class="preparation-card" data-preparation-card="${esc(preparationKey(entry))}" data-agency="${esc(entry.agencySlug)}" data-work="${esc(entry.workSlug||'')}" data-saved="${saved}" hidden><h4>${esc(name)} · ${esc(title)}</h4><p class="small muted" data-preparation-origin></p>${workPicker(entry,catalog)}${sitePresentation(entry,catalog,receipt)}${dossier(entry,catalog,receipt)}<div class="preparation-editor"><h4>От примера — к разговору</h4><p class="small muted">Набросок использует доступное «Если вам близко», цель и ожидания из рабочего брифа и сведения о прошлой работе. Заполнятся только пустые поля этого варианта; ваш текст останется на месте.</p><div class="preparation-actions"><button type="button" class="secondary" data-prepare-draft>Заполнить пустые поля наброском</button><button type="button" class="text-button" data-replace-preparation>Заменить все поля наброском…</button></div><p class="small muted">Полная замена — отдельное действие: она перезапишет все шесть полей этого варианта. Набросок остаётся рабочей гипотезой; проверьте его перед разговором.</p><p id="${esc(statusId)}" class="preparation-generation-status" data-generation-status role="status" aria-atomic="true" tabindex="-1"></p>${Object.entries(preparationFields).map(([key,{label,max}])=>`<label>${esc(label)}<textarea data-preparation-field="${key}" maxlength="${max}" rows="${key==='scenario'?8:3}" aria-describedby="preparation-privacy ${esc(statusId)} ${esc(statusId+'-'+key+'-limit')}">${esc(entry[key])}</textarea><span id="${esc(statusId+'-'+key+'-limit')}" class="small muted">До ${max.toLocaleString('ru-RU')} символов</span></label>`).join('')}</div></article>`;
}
export function preparationMarkup(){
 return `<section class="operator-subsection" id="admin-preparation" data-stage-panel="preparation"><h3>Разговор и сценарий</h3><p id="preparation-privacy" class="small muted">Только для оператора. Подготовка сохраняется с заявкой; автоматически не попадает в бриф, рекомендации или ответ клиенту. Переключение команды и работы сохраняет введённые поля на странице.</p>${preparationComparisonMarkup()}<label>Чей опыт обсуждаем<select data-preparation-context aria-label="Агентство и работа для подготовки"></select></label><p class="small muted" data-preparation-empty hidden>В заявке пока нет выбранных команд. Добавьте рекомендацию или команду для обсуждения.</p><div data-preparation-cards></div><p class="small muted" data-preparation-count role="status"></p></section>`;
}
export function readPreparation(form,fallback=[]){
 const host=form.querySelector('[data-preparation-cards]');if(host?.dataset.ready!=='true')return normalizePreparation(fallback);
 return [...host.querySelectorAll('[data-preparation-card]')].map(card=>{
  const item=emptyPreparation(card.dataset.agency,card.dataset.work||null);
  for(const field of card.querySelectorAll('[data-preparation-field]'))item[field.dataset.preparationField]=field.value;
  return card.dataset.saved==='true'||Object.keys(preparationFields).some(key=>item[key].trim())?item:null;
 }).filter(Boolean);
}
export function wirePreparation(form,catalog,data,{getValues,selectStage}){
 const host=form.querySelector('[data-preparation-cards]'),select=form.querySelector('[data-preparation-context]'),count=form.querySelector('[data-preparation-count]');
 const saved=normalizePreparation(data.workflow?.preparation),visited=new Map();let active='',optionKey='',comparison=null;
 host.innerHTML=saved.map(item=>cardMarkup(item,catalog,data.receipt,true)).join('');host.dataset.ready='true';
 const cards=()=>[...host.querySelectorAll('[data-preparation-card]')];
 function contexts(){
  const entries=new Map(),values=getValues();
  function add(item,origin){const key=preparationKey(item),entry=entries.get(key)||{agencySlug:item.agencySlug,workSlug:item.workSlug||null,origins:[]};if(!entry.origins.includes(origin))entry.origins.push(origin);entries.set(key,entry);}
  data.receipt.selection.forEach((item,i)=>add(item,'Выбор клиента · '+(i+1)));
  values.recommendations.forEach((item,i)=>add(item,'Рекомендация · '+(i+1)));
  values.workflow.teams.forEach(item=>add({...item,workSlug:null},'Команда в работе'));
  readPreparation(form).forEach(item=>add(item,'Внутренняя подготовка'));
  visited.forEach(item=>{if(!entries.has(preparationKey(item)))add(item,'Просмотр досье');});
  return entries;
 }
 function show(entry){
  active=preparationKey(entry);let card=cards().find(node=>node.dataset.preparationCard===active);
  if(!card){host.insertAdjacentHTML('beforeend',cardMarkup(emptyPreparation(entry.agencySlug,entry.workSlug),catalog,data.receipt));card=cards().find(node=>node.dataset.preparationCard===active);}
  for(const node of cards())node.hidden=node!==card;
  card.querySelector('[data-preparation-origin]').textContent=entry.origins?.join(' · ')||'Просмотр досье';select.value=active;
 }
 function sync(){
  const entries=contexts(),key=[...entries].map(([id,item])=>id+':'+item.origins.join(',')).join('|');
  if(key!==optionKey){optionKey=key;select.innerHTML=[...entries.values()].map(item=>{const id=identity(item,catalog,data.receipt);return `<option value="${esc(preparationKey(item))}">${esc(id.name+' · '+id.title+' — '+item.origins.join(', '))}</option>`;}).join('');}
  form.querySelector('[data-preparation-empty]').hidden=entries.size>0;select.hidden=!entries.size;
  if(entries.size)show(entries.get(active)||entries.values().next().value);
  const items=readPreparation(form),length=preparationLength(items),tooLarge=length>PREPARATION_LIMIT||items.length>PREPARATION_MAX_ITEMS;
  count.textContent=`Подготовка: ${length.toLocaleString('ru-RU')} / ${PREPARATION_LIMIT.toLocaleString('ru-RU')} символов во всех записях; ${items.length} / ${PREPARATION_MAX_ITEMS} записей.`+(tooLarge?' Сократите текст перед сохранением.':' Сохраняется общей кнопкой заявки.');count.classList.toggle('reply-warning',tooLarge);
  comparison?.sync();
 }
 function open(item,field=null){
  if(form.dataset.busy==='true')return;
  visited.set(preparationKey(item),{agencySlug:item.agencySlug,workSlug:item.workSlug||null});active=preparationKey(item);sync();selectStage(form,'preparation');
  const target=field&&Object.hasOwn(preparationFields,field)?cards().find(card=>card.dataset.preparationCard===active)?.querySelector('[data-preparation-field="'+field+'"]'):null;
  if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'center'});}
  else{form.querySelector('#admin-preparation').scrollIntoView({block:'start'});select.focus({preventScroll:true});}
 }
 select.addEventListener('change',()=>{if(form.dataset.busy==='true')return;const entry=contexts().get(select.value);if(entry){active=select.value;show(entry);}});
 host.addEventListener('change',event=>{if(form.dataset.busy==='true'||!event.target.matches('[data-dossier-work]'))return;const card=event.target.closest('[data-preparation-card]'),workSlug=event.target.value||null;event.target.value=card.dataset.work;open({agencySlug:card.dataset.agency,workSlug});});
 host.addEventListener('input',event=>{if(event.target.matches('[data-preparation-field]'))event.target.closest('[data-preparation-card]').querySelector('[data-generation-status]').textContent='';});
 host.addEventListener('click',event=>{
  const button=event.target.closest('[data-prepare-draft],[data-replace-preparation]');if(!button||form.dataset.busy==='true')return;
  const card=button.closest('[data-preparation-card]'),replace=button.hasAttribute('data-replace-preparation'),fields=[...card.querySelectorAll('[data-preparation-field]')];
  if(replace&&fields.some(field=>field.value.trim())&&!confirm('Заменить все шесть полей подготовки для этой работы? Ручной текст будет заменён наброском. Остальные команды и работы не изменятся.'))return;
  const draft=draftFor({agencySlug:card.dataset.agency,workSlug:card.dataset.work||null},catalog,data.receipt,getValues().workflow),changed=[];
  for(const field of fields)if((replace||!field.value.trim())&&field.value!==draft[field.dataset.preparationField]){field.value=draft[field.dataset.preparationField];changed.push(field);}
  const status=card.querySelector('[data-generation-status]');
  status.textContent=changed.length?`${replace?'Обновлено':'Заполнено'} полей: ${changed.length}. ${replace?'':'Ранее заполненный текст оставлен без изменений. '}Проверьте набросок, затем нажмите общую кнопку «Сохранить изменения».`:replace?'Поля уже совпадают с наброском. Изменений нет.':'Пустых полей нет. Ваш текст оставлен без изменений; полная замена доступна отдельной кнопкой.';
  if(changed.length)form.dispatchEvent(new Event('input',{bubbles:true}));
  const target=changed.find(field=>field.dataset.preparationField==='questions')||changed[0]||status;
  target.focus({preventScroll:true});target.scrollIntoView({block:'center'});
 });
 function shortcut(event){if(form.dataset.busy==='true')return;const button=event.target.closest('[data-open-preparation]');if(button){const recommendation=button.closest('[data-recommendation]');open({agencySlug:button.dataset.openPreparation,workSlug:(recommendation?recommendation.querySelector('[data-rec-field=workSlug]').value:button.dataset.preparationWork)||null});}}
 form.addEventListener('click',shortcut);form.ownerDocument.querySelector('.source-request')?.addEventListener('click',shortcut);
 comparison=wirePreparationComparison(form,{catalog,receipt:data.receipt,getContexts:contexts,getPreparation:()=>readPreparation(form),onEdit:open});
 const controller={sync,controls:()=>comparison.controls(),capture:()=>({recordId:data.recordId,active,visited:[...visited.values()].map(({agencySlug,workSlug})=>({agencySlug,workSlug})),comparison:comparison.capture()}),restore:view=>{
  if(form.dataset.busy==='true'||!view||view.recordId!==data.recordId)return;
  // Empty visited contexts are view state too: readPreparation omits them.
  for(const item of normalizePreparation(view.visited))visited.set(preparationKey(item),{agencySlug:item.agencySlug,workSlug:item.workSlug});
  active=typeof view.active==='string'?view.active:'';sync();comparison.restore(view.comparison);
 }};
 preparationViews.set(form,controller);sync();return controller;
}
export function preparationHistory(items,catalog){
 const entries=normalizePreparation(items);if(!entries.length)return '';
 return `<h4>Внутренняя подготовка на этот момент</h4>${entries.map(entry=>{const id=identity(entry,catalog||{agencies:[],projects:[]});return `<details><summary>${esc(id.name+' · '+id.title)}</summary><dl>${Object.entries(preparationFields).map(([key,{label}])=>`<dt>${esc(label)}</dt><dd class="preparation-history">${esc(entry[key]||'Не заполнено')}</dd>`).join('')}</dl></details>`;}).join('')}`;
}
