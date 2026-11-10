import {draftFor,preparationContext as identity,preparationUnknowns as unknowns} from './preparation-draft.js';
import {preparationDraftFields,preparationFollowUpFields,preparationFields,preparationKey,emptyPreparation,normalizePreparation,preparationLength,PREPARATION_LIMIT,PREPARATION_MAX_ITEMS} from './preparation-model.js';
import {preparationComparisonMarkup,wirePreparationComparison} from './preparation-comparison-ui.js';
import {discussionPlanMarkup,wireDiscussionPlans} from './discussion-plan-ui.js';
import {buildEventIdeas,combineEventIdeaOptions,eventIdeaComparisonText,eventIdeaKey,eventIdeaPitchText,eventIdeaScopes,eventIdeaText,eventIdeasMarkup,eventIdeasSignature,ideaReactionDetails,ideaResponseLabels,ideaSourceMoments,renderEventIdeaCombination,renderEventIdeaComparison,renderEventIdeas} from './event-ideas.js';
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
 ${eventIdeasMarkup(statusId+'-ideas',receipt?.brief?.format||'','brief','brief','unspecified','all','','',catalog)}
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
 const saved=normalizePreparation(data.workflow?.preparation),visited=new Map(),eventIdeaStates=new WeakMap(),ideaSourceSelections=new WeakMap();let active='',optionKey='',comparison=null,plans=null;
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
 function sourcesFor(card){let selected=ideaSourceSelections.get(card);if(!selected){selected=new Map();ideaSourceSelections.set(card,selected);}return selected;}
 function filterIdeaSourceOptions(card){
  const search=card.querySelector('[data-event-idea-source-search]'),picker=card.querySelector('[data-event-idea-source-picker]'),status=card.querySelector('[data-event-idea-source-search-status]');if(!search||!picker||!status)return;
  const query=search.value.trim().normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е');let total=0,matched=0;
  for(const option of picker.options){if(!option.value)continue;total++;const group=option.parentElement?.label||'',label=(group+' '+option.textContent).normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е'),visible=!query||label.includes(query);option.hidden=!visible;if(visible)matched++;}
  for(const group of picker.querySelectorAll('optgroup'))group.hidden=[...group.options].every(option=>option.hidden);
  if(picker.selectedOptions[0]?.hidden)picker.value='';
  syncIdeaSourcePreview(card);
  status.textContent=query?(matched?`Найдено опубликованных фрагментов: ${matched}.`:'Совпадений нет. Попробуйте часть названия или название агентства.'):`В списке ${total} опубликованных фрагментов.`;
 }
 function syncIdeaSourcePreview(card){
  const picker=card?.querySelector('[data-event-idea-source-picker]');if(!picker)return;
  let preview=card.querySelector('[data-event-idea-source-preview]');
  if(!preview){preview=document.createElement('div');preview.className='event-idea-source-preview';preview.dataset.eventIdeaSourcePreview='';preview.hidden=true;picker.closest('label')?.after(preview);}
  let value;try{value=JSON.parse(picker.value);}catch{value=null;}
  const [agencySlug,workSlug,momentKey]=Array.isArray(value)?value:[],work=catalog.projects.find(project=>project.slug===workSlug&&(project.agencySlug===agencySlug||project.agencySlugs?.includes(agencySlug))),agency=catalog.agencies.find(item=>item.slug===agencySlug),moment=work&&ideaSourceMoments(work).find(item=>item.key===momentKey);
  if(!work||!moment){preview.hidden=true;preview.innerHTML='';return;}
  const snippet=moment.text.trim(),truncated=snippet.length>700,sourceUrl=work.details?.source||work.source;
  preview.innerHTML=`<strong>${esc(agency?.name||agencySlug)} · ${esc(work.fullTitle||work.title||work.slug)} · ${esc(moment.label)}</strong><p>${esc(truncated?snippet.slice(0,699).trimEnd()+'…':snippet)}</p>${truncated?'<p class="small muted">Показана часть опубликованного текста; полный фрагмент доступен в первоисточнике.</p>':''}${sourceLink(sourceUrl,'Открыть первоисточник')}`;preview.hidden=false;
 }
 function syncIdeaSourceList(card){
  const list=card.querySelector('[data-event-idea-source-list]');if(!list)return;
  filterIdeaSourceOptions(card);
  const selected=sourcesFor(card);
   list.innerHTML=[...selected].map(([key,item])=>{const work=catalog.projects.find(project=>project.slug===item.workSlug),agency=catalog.agencies.find(value=>value.slug===item.agencySlug),moment=work&&item.momentKey?ideaSourceMoments(work).find(value=>value.key===item.momentKey):null;return `<li><span>${esc(work?.fullTitle||work?.title||item.workSlug)}${moment?' · '+esc(moment.label):''} · ${esc(agency?.name||item.agencySlug)}</span><button type="button" class="text-button" data-remove-event-idea-source="${esc(key)}" aria-label="Убрать источник ${esc(work?.fullTitle||work?.title||item.workSlug)}">Убрать</button></li>`;}).join('');
 }
 function installIdeaComparison(panel){
  const results=panel.querySelector('[data-event-ideas-results]'),grid=results?.querySelector('.event-idea-grid'),cards=grid?[...grid.querySelectorAll('.event-idea-card')]:[];
  if(!results||!grid||cards.length<2)return;
  const host=document.createElement('div');host.className='event-idea-comparison-host';host.dataset.eventIdeaComparison='';host.hidden=true;results.append(host);
  cards.forEach((card,index)=>{const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.toggleEventIdeaCompare=String(index);button.setAttribute('aria-pressed','false');button.textContent='Сравнить вариант';card.append(button);});
 }
 function installIdeaCombinationControl(panel){
  const section=panel.querySelector('[data-event-idea-comparison] .event-idea-comparison');if(!section||section.querySelector('[data-suggest-event-idea-combination]'))return;
  const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.suggestEventIdeaCombination='';button.textContent='Предложить связку двух отмеченных вариантов';section.append(button);
 }
 function ideaInput(card,entries=contexts()){
  const ideaSources=[...sourcesFor(card).values()],currentWork={agencySlug:card.dataset.agency,workSlug:card.dataset.work||null};
  return {entry:{agencySlug:card.dataset.agency,workSlug:ideaSources.length?null:currentWork.workSlug},catalog,receipt:data.receipt,workflow:getValues().workflow,references:[...ideaSources,...(ideaSources.length&&currentWork.workSlug?[currentWork]:[]),...entries.values()],formatOverride:card.querySelector('[data-event-idea-format]')?.value||'',participationMode:card.querySelector('[data-event-idea-participation]')?.value||'brief',creativeAngle:card.querySelector('[data-event-idea-angle]')?.value||'brief',audienceProfile:card.querySelector('[data-event-idea-audience]')?.value||'unspecified',ideaApproach:card.querySelector('[data-event-idea-approach]')?.value||'all',customDirection:card.querySelector('[data-event-idea-direction]')?.value||'',eventDuration:card.querySelector('[data-event-idea-duration]')?.value||'',allowUnmatchedManualCombination:Boolean(card.querySelector('[data-event-idea-manual-combine]')?.checked),clientFeedback:card.querySelector('[data-preparation-field="clientFeedback"]')?.value||''};
 }
 function refreshEventIdeas(entries=contexts()){
  for(const card of cards()){
   const panel=card.querySelector('[data-event-idea-generator]');if(!panel)continue;
   const generate=panel.querySelector('[data-generate-event-ideas]'),state=eventIdeaStates.get(panel),status=panel.querySelector('[data-event-ideas-status]');
   generate.disabled=form.dataset.busy==='true';
   if(!state)continue;
    const stale=state.signature!==eventIdeasSignature(ideaInput(card,entries));panel.dataset.stale=String(stale);
    if(stale&&(state.comparison.size||state.combination)){state.comparison.clear();state.combination=null;const comparisonHost=panel.querySelector('[data-event-idea-comparison]');if(comparisonHost){comparisonHost.hidden=true;comparisonHost.innerHTML='';}for(const button of panel.querySelectorAll('[data-toggle-event-idea-compare]')){button.setAttribute('aria-pressed','false');button.textContent='Сравнить вариант';}}
   for(const button of panel.querySelectorAll('[data-append-event-idea],[data-append-event-idea-comparison],[data-append-event-idea-combination],[data-copy-event-idea],[data-copy-event-idea-quick],[data-append-event-idea-pitch],[data-append-event-idea-reply],[data-append-event-idea-scale],[data-record-event-idea-response],[data-toggle-event-idea-compare],[data-suggest-event-idea-combination]'))button.disabled=form.dataset.busy==='true'||stale;
   for(const button of panel.querySelectorAll('[data-toggle-event-idea-compare]'))button.disabled=form.dataset.busy==='true'||stale||(!state.comparison.has(Number(button.dataset.toggleEventIdeaCompare))&&state.comparison.size>=3);
      status.textContent=stale?'Бриф, аудитория, путь, длительность, тема идеи или реакция заказчика изменились. Пересоберите подборку перед добавлением в сценарий.':state.message;
  }
 }
 function unsavedIdeaPitches(card,panel,state){
  const result=new Map();if(!state)return result;
  const scenario=card.querySelector('[data-preparation-field="scenario"]'),reply=form.elements.replyText;
  for(const field of panel.querySelectorAll('[data-event-idea-pitch]')){
   const item=state.ideas[Number(field.dataset.eventIdeaPitch)];if(!item)continue;
   const value=field.value.trim(),baseline=(item.pitchText??eventIdeaPitchText(item)).trim();
   if(!value||item.pitchText===undefined&&value===baseline)continue;
   if(scenario?.value.includes('ПОДАЧА ЗАКАЗЧИКУ:\n'+value)||reply?.value.includes('Вариант события для обсуждения:\n'+value))continue;
   result.set(eventIdeaKey(item),value);
  }
  return result;
 }
 function sync(){
  const entries=contexts(),key=[...entries].map(([id,item])=>id+':'+item.origins.join(',')).join('|');
  if(key!==optionKey){optionKey=key;select.innerHTML=[...entries.values()].map(item=>{const id=identity(item,catalog,data.receipt);return `<option value="${esc(preparationKey(item))}">${esc(id.name+' · '+id.title+' — '+item.origins.join(', '))}</option>`;}).join('');}
  form.querySelector('[data-preparation-empty]').hidden=entries.size>0;select.hidden=!entries.size;
  if(entries.size)show(entries.get(active)||entries.values().next().value);
  for(const card of cards())syncIdeaSourceList(card);
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
  host.addEventListener('change',event=>{if(event.target.matches('[data-event-idea-source-picker]')){syncIdeaSourcePreview(event.target.closest('[data-preparation-card]'));return;}if(event.target.matches('[data-event-idea-approach],[data-event-idea-format],[data-event-idea-participation],[data-event-idea-angle],[data-event-idea-audience],[data-event-idea-duration],[data-event-idea-manual-combine]')){sync();return;}if(form.dataset.busy==='true'||!event.target.matches('[data-dossier-work]'))return;const card=event.target.closest('[data-preparation-card]'),workSlug=event.target.value||null;event.target.value=card.dataset.work;open({agencySlug:card.dataset.agency,workSlug});});
  host.addEventListener('input',event=>{if(event.target.matches('[data-event-idea-source-search]')){filterIdeaSourceOptions(event.target.closest('[data-preparation-card]'));return;}if(event.target.matches('[data-event-idea-direction]')){sync();return;}if(event.target.matches('[data-preparation-field]')){event.target.closest('[data-preparation-card]').querySelector('[data-generation-status]').textContent='';if(event.target.dataset.preparationField==='clientFeedback')sync();}});
 host.addEventListener('click',async event=>{
  const responseButton=event.target.closest('[data-record-event-idea-response]');
  if(responseButton&&!form.dataset.busy){
   const card=responseButton.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]');if(!card||!panel||!status)return;
    const state=eventIdeaStates.get(panel),index=Number(responseButton.dataset.recordEventIdeaResponse),idea=state?.ideas[index],entries=contexts(),signature=eventIdeaSignature(ideaInput(card,entries)),label=ideaResponseLabels[responseButton.dataset.eventIdeaResponse],detail=ideaReactionDetails[panel.querySelector('[data-event-idea-reaction-detail]')?.value||'']||'',noteField=panel.querySelector('[data-event-idea-reaction-note]'),note=(noteField?.value||'').replace(/[\[\]\r\n]/g,' ').replace(/\s+/g,' ').trim(),feedback=card.querySelector('[data-preparation-field="clientFeedback"]');
   if(!state||state.signature!==signature||!idea){refreshEventIdeas(entries);status.textContent='Подборка устарела. Соберите варианты заново, затем запишите реакцию на нужный вариант.';return;}
   if(!label||!feedback){status.textContent='Не удалось открыть поле для записи итога разговора.';return;}
    const block=`${new Date().toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'})} · ${label}: «${idea.title}».${detail?' [Клиент отметил: '+detail+']':''}${note?' [Комментарий клиента: '+note+']':''}`;
   if(feedback.value.includes(block)){status.textContent='Эта отметка уже есть в итогах разговора.';return;}
   const current=feedback.value.trimEnd(),next=current?current+'\n'+block:block;
   if(next.length>feedback.maxLength){status.textContent='Отметка не помещается в поле итогов разговора. Сократите запись или добавьте её вручную.';return;}
    feedback.value=next;feedback.dispatchEvent(new Event('input',{bubbles:true}));status.textContent=detail||note?'Отметка и уточнение добавлены в «Что сказал клиент после обсуждения». Соберите варианты заново, чтобы учесть слова клиента; затем нажмите общую кнопку «Сохранить изменения».':'Отметка добавлена в «Что сказал клиент после обсуждения». Соберите варианты заново, чтобы учесть реакцию; затем нажмите общую кнопку «Сохранить изменения». ';
   feedback.focus({preventScroll:true});feedback.scrollIntoView({block:'center'});return;
  }
  const appendCombinationDraft=event.target.closest('[data-append-event-idea-combination]');
  if(appendCombinationDraft&&!form.dataset.busy){
   const card=appendCombinationDraft.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]'),state=panel&&eventIdeaStates.get(panel),entries=contexts();if(!card||!panel||!status||!state?.combination)return;
   if(state.signature!==eventIdeaSignature(ideaInput(card,entries))){refreshEventIdeas(entries);status.textContent='Подборка устарела. Пересоберите варианты перед сохранением связки.';return;}
   const scenario=card.querySelector('[data-preparation-field="scenario"]'),block=eventIdeaText(state.combination,state.commonChecks);if(!scenario){status.textContent='Поле чернового сценария недоступно.';return;}
   if(scenario.value.includes(block)){status.textContent='Эта связка уже есть в черновом сценарии.';return;}
   const current=scenario.value.trimEnd(),next=current?current+'\n\n'+block:block;if(next.length>scenario.maxLength){status.textContent='Связка не помещается в черновой сценарий. Сократите её или возьмите только нужный элемент вручную.';return;}
   scenario.value=next;scenario.dispatchEvent(new Event('input',{bubbles:true}));state.message='Связка добавлена в черновой сценарий на этой странице. Нажмите общую кнопку «Сохранить изменения».';sync();status.textContent=state.message;scenario.focus({preventScroll:true});scenario.scrollIntoView({block:'center'});return;
  }
  const suggestCombination=event.target.closest('[data-suggest-event-idea-combination]');
  if(suggestCombination&&!form.dataset.busy){
   const card=suggestCombination.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]'),state=panel&&eventIdeaStates.get(panel),entries=contexts();if(!card||!panel||!status||!state)return;
   if(state.signature!==eventIdeaSignature(ideaInput(card,entries))){refreshEventIdeas(entries);status.textContent='Подборка устарела. Соберите варианты заново перед поиском связки.';return;}
   const items=[...state.comparison].map(index=>state.ideas[index]).filter(Boolean),result=combineEventIdeaOptions(items);if(!result.option){state.combination=null;status.textContent=result.reason;return;}
   if(state.combination){status.textContent='Черновик связки уже подготовлен. Измените отмеченные варианты, чтобы собрать другой.';return;}
   state.combination=result.option;const host=panel.querySelector('[data-event-idea-comparison]');if(host)host.insertAdjacentHTML('beforeend',renderEventIdeaCombination(result.option));suggestCombination.disabled=true;state.message='Подготовлена гипотеза сочетания двух вариантов. Проверьте общую тему и возможность реализации.';status.textContent=state.message;return;
  }
  const appendComparison=event.target.closest('[data-append-event-idea-comparison]');
  if(appendComparison&&!form.dataset.busy){
   const card=appendComparison.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]'),state=panel&&eventIdeaStates.get(panel),entries=contexts();if(!card||!panel||!status||!state)return;
   if(state.signature!==eventIdeaSignature(ideaInput(card,entries))){refreshEventIdeas(entries);status.textContent='Подборка устарела. Соберите варианты заново перед сохранением сравнения.';return;}
   const items=[...state.comparison].map(index=>state.ideas[index]).filter(Boolean);if(items.length<2){status.textContent='Отметьте минимум два варианта для сравнения.';return;}
   const scenario=card.querySelector('[data-preparation-field="scenario"]'),block=eventIdeaComparisonText(items,state.commonChecks);if(!scenario){status.textContent='Поле чернового сценария недоступно.';return;}
   if(scenario.value.includes(block)){status.textContent='Это сравнение уже есть в черновом сценарии.';return;}
   const current=scenario.value.trimEnd(),next=current?current+'\n\n'+block:block;if(next.length>scenario.maxLength){status.textContent='Сравнение не помещается в черновой сценарий. Уберите один вариант или добавьте их по отдельности.';return;}
   scenario.value=next;scenario.dispatchEvent(new Event('input',{bubbles:true}));state.message='Сравнение добавлено в черновой сценарий на этой странице. Нажмите общую кнопку «Сохранить изменения».';sync();status.textContent=state.message;scenario.focus({preventScroll:true});scenario.scrollIntoView({block:'center'});return;
  }
  const compareButton=event.target.closest('[data-toggle-event-idea-compare]');
  if(compareButton&&!form.dataset.busy){
   const card=compareButton.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]');if(!card||!panel||!status)return;
   const state=eventIdeaStates.get(panel),index=Number(compareButton.dataset.toggleEventIdeaCompare),entries=contexts(),signature=eventIdeaSignature(ideaInput(card,entries));
   if(!state||state.signature!==signature||!state.ideas[index]){refreshEventIdeas(entries);status.textContent='Подборка устарела. Соберите варианты заново перед сравнением.';return;}
   if(state.comparison.has(index))state.comparison.delete(index);
   else if(state.comparison.size>=3){status.textContent='Можно сравнить не больше трёх вариантов. Уберите один, чтобы добавить другой.';return;}
   else state.comparison.add(index);
   const host=panel.querySelector('[data-event-idea-comparison]'),items=[...state.comparison].map(itemIndex=>state.ideas[itemIndex]).filter(Boolean);state.combination=null;
   if(host){host.hidden=items.length<2;host.innerHTML=items.length>=2?renderEventIdeaComparison(items):'';installIdeaCombinationControl(panel);}
   for(const button of panel.querySelectorAll('[data-toggle-event-idea-compare]')){const selected=state.comparison.has(Number(button.dataset.toggleEventIdeaCompare));button.setAttribute('aria-pressed',String(selected));button.textContent=selected?'Убрать из сравнения':'Сравнить вариант';button.disabled=!selected&&state.comparison.size>=3;}
   state.message=items.length?`В сравнении ${items.length} варианта. Сопоставьте основания, ограничения и вопросы перед обсуждением.`:state.comparison.size?`Отмечен один вариант. Добавьте ещё один, чтобы сравнить их рядом.`:'Сравнение очищено.';status.textContent=state.message;return;
  }
  const addSource=event.target.closest('[data-add-event-idea-source]'),removeSource=event.target.closest('[data-remove-event-idea-source]');
  if((addSource||removeSource)&&!form.dataset.busy){
   const card=event.target.closest('[data-preparation-card]'),picker=card?.querySelector('[data-event-idea-source-picker]'),sourceStatus=card?.querySelector('[data-event-idea-source-status]');if(!card||!picker||!sourceStatus)return;
   const selected=sourcesFor(card);
   if(removeSource){selected.delete(removeSource.dataset.removeEventIdeaSource);sync();sourceStatus.textContent='Источник убран из этой подборки идей. Состав заявки и выбор клиента не изменились.';return;}
   let value;try{value=JSON.parse(picker.value);}catch{value=null;}
   const [agencySlug,workSlug,momentKey]=Array.isArray(value)?value:[],work=catalog.projects.find(project=>project.slug===workSlug&&(project.agencySlug===agencySlug||project.agencySlugs?.includes(agencySlug))),moment=work&&ideaSourceMoments(work).find(item=>item.key===momentKey),key=JSON.stringify([agencySlug,workSlug,momentKey]);
   if(!work||!moment){sourceStatus.textContent='Выберите доступный фрагмент работы из каталога.';return;}
   if([...selected.values()].some(item=>item.agencySlug===agencySlug&&item.workSlug===workSlug&&item.momentKey===momentKey)){sourceStatus.textContent='Этот фрагмент уже добавлен в подборку.';return;}
   if(selected.size>=3){sourceStatus.textContent='В одну подборку можно добавить до трёх фрагментов. Уберите один, если хотите заменить его.';return;}
   selected.set(key,{agencySlug,workSlug,momentKey,operatorSelected:true});picker.value='';sync();sourceStatus.textContent='Фрагмент работы добавлен только как источник идеи. Пересоберите варианты, чтобы развить или сочетать его с другими элементами.';return;
  }
  const generateIdeas=event.target.closest('[data-generate-event-ideas]'),appendIdea=event.target.closest('[data-append-event-idea]'),copyIdea=event.target.closest('[data-copy-event-idea]'),copyQuickIdea=event.target.closest('[data-copy-event-idea-quick]'),appendPitch=event.target.closest('[data-append-event-idea-pitch]'),appendReply=event.target.closest('[data-append-event-idea-reply]'),appendScale=event.target.closest('[data-append-event-idea-scale]');
  if((generateIdeas||appendIdea||copyIdea||copyQuickIdea||appendPitch||appendReply||appendScale)&&!form.dataset.busy){
   const card=event.target.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]');
   if(!card||!panel||!status)return;
   const entries=contexts(),input=ideaInput(card,entries);
   if(generateIdeas){
    const previousState=eventIdeaStates.get(panel),drafts=unsavedIdeaPitches(card,panel,previousState),ideas=buildEventIdeas(input),signature=eventIdeasSignature(input);
    for(const idea of ideas.options){const key=eventIdeaKey(idea);if(drafts.has(key)){idea.pitchText=drafts.get(key);idea.pitchRestored=true;drafts.delete(key);}}
    if(drafts.size&&!confirm('Часть отредактированных подач не относится к новым вариантам. Перед пересборкой добавьте их в сценарий или скопируйте. Продолжить и убрать их из текущей подборки?'))return;
    panel.querySelector('[data-event-ideas-results]').innerHTML=renderEventIdeas(ideas);installIdeaComparison(panel);
    panel.querySelector('[data-event-ideas-results]').hidden=false;
    const amount=ideas.options.length,noun=amount%10===1&&amount%100!==11?'вариант':amount%10>=2&&amount%10<=4&&(amount%100<12||amount%100>14)?'варианта':'вариантов',message=`${amount===1?'Подготовлен':'Подготовлено'} ${amount} ${noun} по выбранному пути. Добавьте подходящее в черновой сценарий; заявка сохранится общей кнопкой.`;
    eventIdeaStates.set(panel,{ideas:ideas.options,commonChecks:ideas.commonChecks,signature,message,comparison:new Set(),combination:null});panel.dataset.stale='false';refreshEventIdeas(entries);
    status.focus({preventScroll:true});status.scrollIntoView({block:'center'});return;
   }
   const state=eventIdeaStates.get(panel),signature=eventIdeasSignature(input),action=appendIdea||copyQuickIdea||copyIdea||appendPitch||appendReply||appendScale,index=Number(action.dataset[appendIdea?'appendEventIdea':copyQuickIdea?'copyEventIdeaQuick':copyIdea?'copyEventIdea':appendPitch?'appendEventIdeaPitch':appendReply?'appendEventIdeaReply':'appendEventIdeaScale']),idea=state?.ideas[index];
   if(!state||state.signature!==signature||!idea){refreshEventIdeas(entries);status.textContent='Эти варианты устарели. Соберите их заново по текущему брифу.';return;}
   const pitch=(copyIdea||appendPitch||appendReply)?card.querySelector('[data-event-idea-pitch="'+index+'"]'):null,quickPitch=copyQuickIdea?card.querySelector('[data-event-idea-quick-pitch="'+index+'"]'):null;
   if((copyIdea||appendPitch||appendReply)&&!pitch||copyQuickIdea&&!quickPitch)return;
   if(copyIdea||copyQuickIdea){
    const field=copyQuickIdea?quickPitch:pitch;
    try{await navigator.clipboard.writeText(field.value);state.message=copyQuickIdea?'Короткий набросок скопирован. Сообщение не отправлено.':'Подача скопирована. Сообщение не отправлено.';status.textContent=state.message;}
    catch{field.focus();field.select();state.message='Автоматическое копирование недоступно. Текст выделен — скопируйте его вручную; сообщение не отправлено.';status.textContent=state.message;}
    return;
   }
   if(appendReply){
    const reply=form.elements.replyText,text=pitch.value.trim(),label='Вариант события для обсуждения:\n';
    if(!reply){status.textContent='Поле черновика ответа недоступно.';return;}
    if(!text){status.textContent='Сначала добавьте текст подачи.';return;}
    const block=label+text,current=reply.value,separator=current.trim()?(current.endsWith('\n')?'':'\n\n'):'';
    if(current.includes(block)){status.textContent='Этот вариант уже есть в черновике ответа.';return;}
    const next=current+separator+block;
    if(next.length>reply.maxLength){status.textContent='Вариант не помещается в черновик ответа. Сократите текст или добавьте нужную часть вручную.';return;}
    reply.value=next;reply.dispatchEvent(new Event('input',{bubbles:true}));
    form.querySelector('#admin-reply').open=true;
    const message='Подача добавлена в черновик ответа. Проверьте текст и нажмите «Сохранить изменения»; сообщение не отправлено.';
    state.message=message;status.textContent=message;form.querySelector('#copy-status').textContent='Черновик ответа дополнен. Сообщение не отправлено.';
    reply.focus({preventScroll:true});reply.scrollIntoView({block:'center'});return;
   }
   const scenario=card.querySelector('[data-preparation-field="scenario"]');if(!scenario)return;
   const scale=appendScale?eventIdeaScopes(idea)[appendScale.dataset.eventIdeaScale]:null;
   const scaleLabel=appendScale?(appendScale.dataset.eventIdeaScale==='compact'?'Сдержанный':'Расширенный'):'';
   const block=appendPitch?'ПОДАЧА ЗАКАЗЧИКУ:\n'+pitch.value.trim():appendScale?'ВАРИАНТ МАСШТАБА · '+scaleLabel+' · '+idea.title+'\n'+scale:eventIdeaText(idea,state.commonChecks),current=scenario.value.trimEnd();
   if(appendPitch&&!pitch.value.trim()){status.textContent='Сначала добавьте текст подачи.';return;}
   if(current.includes(block)){status.textContent='Этот вариант уже есть в черновом сценарии.';return;}
   const next=current?(current+'\n\n'+block):block;
   if(next.length>scenario.maxLength){status.textContent='Вариант не помещается в поле чернового сценария. Сократите текущий текст или возьмите только нужные части вручную.';return;}
   scenario.value=next;scenario.dispatchEvent(new Event('input',{bubbles:true}));
   state.message=(appendPitch?'Подача добавлена':appendScale?'Масштаб «'+scaleLabel.toLocaleLowerCase('ru')+'» добавлен':'Вариант добавлен')+' в черновой сценарий на этой странице. Нажмите общую кнопку «Сохранить изменения», чтобы сохранить его.';status.textContent=state.message;
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
