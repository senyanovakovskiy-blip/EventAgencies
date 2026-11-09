import {draftFor,preparationContext as identity,preparationUnknowns as unknowns} from './preparation-draft.js';
import {preparationDraftFields,preparationFollowUpFields,preparationFields,preparationKey,emptyPreparation,normalizePreparation,preparationLength,PREPARATION_LIMIT,PREPARATION_MAX_ITEMS} from './preparation-model.js';
import {preparationComparisonMarkup,wirePreparationComparison} from './preparation-comparison-ui.js';
import {discussionPlanMarkup,wireDiscussionPlans} from './discussion-plan-ui.js';
import {buildEventIdeas,eventIdeaText,eventIdeasMarkup,eventIdeasSignature,renderEventIdeas} from './event-ideas.js';
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
function preparationFieldMarkup(entry,fields,id,helpId){
 return Object.entries(fields).map(([key,{label,max}])=>`<label>${esc(label)}<textarea data-preparation-field="${key}" maxlength="${max}" rows="${key==='scenario'?8:3}" aria-describedby="preparation-privacy ${esc(helpId)} ${esc(id+'-'+key+'-limit')}">${esc(entry[key])}</textarea><span id="${esc(id+'-'+key+'-limit')}" class="small muted">До ${max.toLocaleString('ru-RU')} символов</span></label>`).join('');
}
function cardMarkup(entry,catalog,receipt,saved=false){
 const {name,title}=identity(entry,catalog,receipt);
 const statusId='preparation-'+entry.agencySlug+'--'+(entry.workSlug?'work-'+entry.workSlug:'agency')+'-generation';
 const followUpId=statusId+'-follow-up';
 return `<article class="preparation-card" data-preparation-card="${esc(preparationKey(entry))}" data-agency="${esc(entry.agencySlug)}" data-work="${esc(entry.workSlug||'')}" data-saved="${saved}" hidden><h4>${esc(name)} · ${esc(title)}</h4><p class="small muted" data-preparation-origin></p>${workPicker(entry,catalog)}${sitePresentation(entry,catalog,receipt)}${dossier(entry,catalog,receipt)}<div class="preparation-editor">
 <section class="preparation-draft"><h4>От примера — к разговору</h4><p class="small muted">Набросок использует доступное «Если вам близко», цель и ожидания из рабочего брифа и сведения о прошлой работе. Заполнятся только пустые из шести подготовительных полей; ваш текст останется на месте.</p><div class="preparation-actions"><button type="button" class="secondary" data-prepare-draft>Заполнить пустые поля подготовки наброском</button><button type="button" class="text-button" data-replace-preparation>Заменить шесть полей подготовки наброском…</button></div><p class="small muted">Замена перезапишет только шесть подготовительных полей. Ручные записи в блоке «После обсуждения» останутся. Набросок — рабочая гипотеза; проверьте его перед разговором.</p><p id="${esc(statusId)}" class="preparation-generation-status" data-generation-status role="status" aria-atomic="true" tabindex="-1"></p>${preparationFieldMarkup(entry,preparationDraftFields,statusId,statusId)}</section>
 ${eventIdeasMarkup(statusId+'-ideas',receipt?.brief?.format||'')}
 <section class="preparation-follow-up" aria-labelledby="${esc(followUpId+'-title')}"><h4 id="${esc(followUpId+'-title')}">После обсуждения</h4><p id="${esc(followUpId+'-help')}" class="small muted">Запишите реальные слова клиента и итоги разговора; при необходимости укажите дату и собеседника. Эти поля заполняются вручную и сохраняются общей кнопкой заявки. Они не подтверждают автоматически бриф, согласия сторон или состоявшееся знакомство.</p>${preparationFieldMarkup(entry,preparationFollowUpFields,statusId,followUpId+'-help')}</section>
 ${discussionPlanMarkup(statusId+'-plan')}</div></article>`;
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
 const saved=normalizePreparation(data.workflow?.preparation),visited=new Map(),eventIdeaStates=new WeakMap();let active='',optionKey='',comparison=null,plans=null;
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
  plans?.contextChanged();
 }
 function ideaInput(card,entries=contexts()){
  return {entry:{agencySlug:card.dataset.agency,workSlug:card.dataset.work||null},catalog,receipt:data.receipt,workflow:getValues().workflow,references:[...entries.values()],formatOverride:card.querySelector('[data-event-idea-format]')?.value||''};
 }
 function refreshEventIdeas(entries=contexts()){
  for(const card of cards()){
   const panel=card.querySelector('[data-event-idea-generator]');if(!panel)continue;
   const generate=panel.querySelector('[data-generate-event-ideas]'),state=eventIdeaStates.get(panel),status=panel.querySelector('[data-event-ideas-status]');
   generate.disabled=form.dataset.busy==='true';
   if(!state)continue;
   const stale=state.signature!==eventIdeasSignature(ideaInput(card,entries));panel.dataset.stale=String(stale);
   for(const button of panel.querySelectorAll('[data-append-event-idea]'))button.disabled=form.dataset.busy==='true'||stale;
   status.textContent=stale?'Бриф или список работ для обсуждения изменился. Пересоберите варианты перед добавлением в сценарий.':state.message;
  }
 }
 function sync(){
  const entries=contexts(),key=[...entries].map(([id,item])=>id+':'+item.origins.join(',')).join('|');
  if(key!==optionKey){optionKey=key;select.innerHTML=[...entries.values()].map(item=>{const id=identity(item,catalog,data.receipt);return `<option value="${esc(preparationKey(item))}">${esc(id.name+' · '+id.title+' — '+item.origins.join(', '))}</option>`;}).join('');}
  form.querySelector('[data-preparation-empty]').hidden=entries.size>0;select.hidden=!entries.size;
  if(entries.size)show(entries.get(active)||entries.values().next().value);
  const items=readPreparation(form),length=preparationLength(items),tooLarge=length>PREPARATION_LIMIT||items.length>PREPARATION_MAX_ITEMS;
  count.textContent=`Подготовка: ${length.toLocaleString('ru-RU')} / ${PREPARATION_LIMIT.toLocaleString('ru-RU')} символов во всех записях; ${items.length} / ${PREPARATION_MAX_ITEMS} записей.`+(tooLarge?' Сократите текст перед сохранением.':' Сохраняется общей кнопкой заявки.');count.classList.toggle('reply-warning',tooLarge);
  refreshEventIdeas(entries);
  comparison?.sync();
  plans?.sync();
 }
 function open(item,field=null){
  if(form.dataset.busy==='true')return;
  visited.set(preparationKey(item),{agencySlug:item.agencySlug,workSlug:item.workSlug||null});active=preparationKey(item);sync();selectStage(form,'preparation');
  const target=field&&Object.hasOwn(preparationFields,field)?cards().find(card=>card.dataset.preparationCard===active)?.querySelector('[data-preparation-field="'+field+'"]'):null;
  if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'center'});}
  else{form.querySelector('#admin-preparation').scrollIntoView({block:'start'});select.focus({preventScroll:true});}
 }
 select.addEventListener('change',()=>{if(form.dataset.busy==='true')return;const entry=contexts().get(select.value);if(entry){active=select.value;show(entry);}});
 host.addEventListener('change',event=>{if(event.target.matches('[data-event-idea-format]')){sync();return;}if(form.dataset.busy==='true'||!event.target.matches('[data-dossier-work]'))return;const card=event.target.closest('[data-preparation-card]'),workSlug=event.target.value||null;event.target.value=card.dataset.work;open({agencySlug:card.dataset.agency,workSlug});});
 host.addEventListener('input',event=>{if(event.target.matches('[data-preparation-field]'))event.target.closest('[data-preparation-card]').querySelector('[data-generation-status]').textContent='';});
 host.addEventListener('click',event=>{
  const generateIdeas=event.target.closest('[data-generate-event-ideas]'),appendIdea=event.target.closest('[data-append-event-idea]');
  if((generateIdeas||appendIdea)&&!form.dataset.busy){
   const card=event.target.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]');
   if(!card||!panel||!status)return;
   const entries=contexts(),input=ideaInput(card,entries);
   if(generateIdeas){
    const ideas=buildEventIdeas(input),signature=eventIdeasSignature(input);
    panel.querySelector('[data-event-ideas-results]').innerHTML=renderEventIdeas(ideas);
    panel.querySelector('[data-event-ideas-results]').hidden=false;
    const message=`Собрано ${ideas.options.length} вариантов. Добавьте подходящий в черновой сценарий; заявка сохранится общей кнопкой.`;
    eventIdeaStates.set(panel,{ideas:ideas.options,commonChecks:ideas.commonChecks,signature,message});panel.dataset.stale='false';refreshEventIdeas(entries);
    status.focus({preventScroll:true});status.scrollIntoView({block:'center'});return;
   }
   const state=eventIdeaStates.get(panel),signature=eventIdeasSignature(input),index=Number(appendIdea.dataset.appendEventIdea),idea=state?.ideas[index];
   if(!state||state.signature!==signature||!idea){refreshEventIdeas(entries);status.textContent='Эти варианты устарели. Соберите их заново по текущему брифу.';return;}
   const scenario=card.querySelector('[data-preparation-field="scenario"]');if(!scenario)return;
   const block=eventIdeaText(idea,state.commonChecks),current=scenario.value.trimEnd();
   if(current.includes(block)){status.textContent='Этот вариант уже есть в черновом сценарии.';return;}
   const next=current?(current+'\n\n'+block):block;
   if(next.length>scenario.maxLength){status.textContent='Вариант не помещается в поле чернового сценария. Сократите текущий текст или возьмите только нужные части вручную.';return;}
   scenario.value=next;scenario.dispatchEvent(new Event('input',{bubbles:true}));
   state.message='Вариант добавлен в черновой сценарий на этой странице. Нажмите общую кнопку «Сохранить изменения», чтобы сохранить его.';status.textContent=state.message;
   scenario.focus({preventScroll:true});scenario.scrollIntoView({block:'center'});return;
  }
  const button=event.target.closest('[data-prepare-draft],[data-replace-preparation]');if(!button||form.dataset.busy==='true')return;
  // Draft generation and replacement never touch manual follow-up notes.
  const card=button.closest('[data-preparation-card]'),replace=button.hasAttribute('data-replace-preparation'),fields=[...card.querySelectorAll('[data-preparation-field]')].filter(field=>Object.hasOwn(preparationDraftFields,field.dataset.preparationField));
  if(replace&&fields.some(field=>field.value.trim())&&!confirm('Заменить шесть подготовительных полей этого варианта наброском? Ручной текст в этих шести полях будет перезаписан. Записи «После обсуждения» останутся. Остальные команды и работы не изменятся.'))return;
  const draft=draftFor({agencySlug:card.dataset.agency,workSlug:card.dataset.work||null},catalog,data.receipt,getValues().workflow),changed=[];
  for(const field of fields)if((replace||!field.value.trim())&&field.value!==draft[field.dataset.preparationField]){field.value=draft[field.dataset.preparationField];changed.push(field);}
  const status=card.querySelector('[data-generation-status]');
  status.textContent=changed.length?`${replace?'Обновлено':'Заполнено'} подготовительных полей: ${changed.length} из 6. ${replace?'':'Ранее заполненный текст оставлен без изменений. '}Записи «После обсуждения» оставлены без изменений. Проверьте набросок, затем нажмите общую кнопку «Сохранить изменения».`:replace?'Все шесть подготовительных полей уже совпадают с наброском. Изменений нет; записи «После обсуждения» оставлены без изменений.':'Среди шести подготовительных полей нет пустых. Ваш текст и записи «После обсуждения» оставлены без изменений; заменить шесть полей наброском можно отдельной кнопкой.';
  if(changed.length)form.dispatchEvent(new Event('input',{bubbles:true}));
  const target=changed.find(field=>field.dataset.preparationField==='questions')||changed[0]||status;
  target.focus({preventScroll:true});target.scrollIntoView({block:'center'});
 });
 function shortcut(event){if(form.dataset.busy==='true')return;const button=event.target.closest('[data-open-preparation]');if(button){const recommendation=button.closest('[data-recommendation]');open({agencySlug:button.dataset.openPreparation,workSlug:(recommendation?recommendation.querySelector('[data-rec-field=workSlug]').value:button.dataset.preparationWork)||null});}}
 form.addEventListener('click',shortcut);form.ownerDocument.querySelector('.source-request')?.addEventListener('click',shortcut);
 comparison=wirePreparationComparison(form,{catalog,receipt:data.receipt,getContexts:contexts,getPreparation:()=>readPreparation(form),onEdit:open,onViewChange:()=>plans?.sync()});
 plans=wireDiscussionPlans(form,{catalog,receipt:data.receipt,getPreparation:()=>readPreparation(form),getWorkflow:()=>getValues().workflow,getActiveKey:()=>active,getComparison:()=>({selectedKeys:comparison.capture().selectedKeys,contexts:contexts()}),siteOrigin:location.origin});
 const controller={sync,controls:()=>{comparison.controls();plans.controls();},capture:()=>({recordId:data.recordId,active,visited:[...visited.values()].map(({agencySlug,workSlug})=>({agencySlug,workSlug})),comparison:comparison.capture()}),restore:view=>{
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
