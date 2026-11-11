import {draftFor,preparationContext as identity,preparationUnknowns as unknowns} from './preparation-draft.js';
import {preparationDraftFields,preparationFollowUpFields,preparationFields,preparationKey,emptyPreparation,normalizePreparation,preparationLength,PREPARATION_LIMIT,PREPARATION_MAX_ITEMS} from './preparation-model.js';
import {preparationComparisonMarkup,wirePreparationComparison} from './preparation-comparison-ui.js';
import {discussionPlanMarkup,wireDiscussionPlans} from './discussion-plan-ui.js';
import {buildEventIdeas,combineEventIdeaOptions,eventIdeaComparisonText,eventIdeaKey,eventIdeaPitchSourceIdentity,eventIdeaPitchText,eventIdeaScopes,eventIdeaSourceFingerprint,eventIdeaText,eventIdeasMarkup,eventIdeasSignature,ideaReactionDetails,ideaResponseLabels,ideaSourceMoments,renderEventIdeaCombination,renderEventIdeaComparison,renderEventIdeas} from './event-ideas.js';
import {IDEA_SOURCE_CONTEXT_LIMIT,IDEA_PITCH_LIMIT,IDEA_PITCH_TEXT_LIMIT,IDEA_PITCH_TOTAL_LIMIT,ideaSourceContextKey,ideaSourceIsAvailable,ideaPitchKey,normalizeIdeaSources,normalizeIdeaPitches,normalizeIdeaSettings} from './workflow-model.js';
const preparationViews=new WeakMap();
export const capturePreparationView=form=>preparationViews.get(form)?.capture()||null;
export const restorePreparationView=(form,view)=>preparationViews.get(form)?.restore(view);
export const syncPreparationViewControls=form=>preparationViews.get(form)?.controls();
export const readIdeaSources=(form,fallback=[])=>preparationViews.get(form)?.readSources()||normalizeIdeaSources(fallback);
export const readIdeaPitches=(form,fallback=[])=>preparationViews.get(form)?.readPitches()||normalizeIdeaPitches(fallback);
export const readIdeaSettings=(form,fallback=[])=>preparationViews.get(form)?.readSettings()||normalizeIdeaSettings(fallback);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=value=>Array.isArray(value)?value.join(', '):typeof value==='string'?value:'';
export function ideaReactionControls(button){
 const card=button?.closest('.event-idea-card');
 return {detailField:card?.querySelector('[data-event-idea-reaction-detail]')||null,noteField:card?.querySelector('[data-event-idea-reaction-note]')||null,transferStatus:card?.querySelector('[data-event-idea-feedback-transfer-status]')||null};
}
export function openOriginalEventIdea(button,state,panel,signature){
 if(!state||state.signature!==signature)return false;
 const current=button?.closest('[data-idea-card-index]'),from=state?.ideas[Number(current?.dataset.ideaCardIndex)],index=Number(button?.dataset.openOriginalIdea),original=state?.ideas[index],target=panel?.querySelector(`[data-idea-card-index="${index}"]`);
 const feedback=from?.revisedFromFeedback||from?.derivedFromReaction;
 if(!feedback?.clarification||from.feedbackOriginal!==original||!target)return false;
 const details=target.querySelector('.event-idea-feedback'),select=details?.querySelector('[data-event-idea-reaction-detail]'),note=details?.querySelector('[data-event-idea-reaction-note]'),status=details?.querySelector('[data-event-idea-feedback-transfer-status]');if(!details||!select||!note||!status)return false;
 const phrase=feedback.note;
 const transferable=typeof phrase==='string'&&phrase.length<=240&&phrase.length>0&&phrase===phrase.replace(/[\[\]\r\n]/g,' ').replace(/\s+/g,' ').trim();
 if(note.value.length)status.textContent='Заметка уже заполнена; введённый текст сохранён без изменений. При необходимости перенесите фразу вручную.';
 else if(transferable){note.value=phrase;status.textContent='Записанная фраза перенесена. Выберите категорию только после уточнения у заказчика и отметьте его реакцию.';}
 else status.textContent='Не удалось перенести фразу без изменений. Добавьте вручную точный фрагмент до 240 символов без квадратных скобок и переносов.';
 details.open=true;target.scrollIntoView({block:'center'});select.focus({preventScroll:true});return true;
}
export function selectedFeedbackPhrase(value,start,end){
 const source=typeof value==='string'?value:'';
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>source.length||end<=start)return {error:'Сначала выделите в записи разговора слова клиента, относящиеся к этому варианту.'};
 const phrase=source.slice(start,end).trim();
 if(!phrase)return {error:'Выделите непустую фразу клиента.'};
 if(phrase.length>240)return {error:'Выделенная фраза длиннее 240 символов. Выберите более короткий точный фрагмент.'};
 const lineStart=source.lastIndexOf('\n',start-1)+1,nextBreak=source.indexOf('\n',end),line=source.slice(lineStart,nextBreak<0?source.length:nextBreak);
 if(/[\r\n\[\]]/.test(phrase)||/(?:Источник варианта|Клиент отметил|Комментарий клиента)\s*:|·\s*(?:Выбрал для проработки|Заинтересовало, нужны детали|Сомневается, нужны уточнения|Не подошло)\s*:\s*«/iu.test(line))return {error:'Выделите только одну фразу клиента без служебных отметок.'};
 return {phrase};
}
export function transferSelectedFeedbackPhrase(button,feedback){
 const {noteField}=ideaReactionControls(button);
 if(!feedback||!noteField)return {error:'Не удалось открыть запись разговора и заметку этого варианта.'};
 if(noteField.value.trim())return {error:'Заметка этого варианта уже заполнена. Очистите её, если хотите взять другую фразу.'};
 const selected=selectedFeedbackPhrase(feedback.value,feedback.selectionStart,feedback.selectionEnd);
 if(selected.error)return selected;
 noteField.value=selected.phrase;
 return {phrase:selected.phrase,noteField};
}
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
 const prompts=kind==='work'&&Array.isArray(entity?.presentation?.discussionPrompts)?entity.presentation.discussionPrompts.filter(value=>typeof value==='string'&&value.trim()).slice(0,3).map(value=>value.trim()):[];
 const heading=kind==='agency'?'Агентство':'Работа',linkLabel=kind==='agency'?'Открыть профиль агентства':'Открыть страницу работы';
 const fitMarkup=copy.fit||!prompts.length?`<div><dt>Если вам близко</dt><dd${copy.fit?'':' class="muted"'}>${esc(copy.fit||'Эта подсказка сейчас не передана в админку.')}</dd></div>`:'';
 return `<section class="preparation-site-copy"><h5>${heading} · ${esc(name)}</h5>${warning?`<p class="preparation-context-warning">${esc(warning)}</p>`:''}${entity?`${Object.values(copy).some(Boolean)||prompts.length?`${copy.lead?`<p class="preparation-site-lead">${esc(copy.lead)}</p>`:''}${copy.intro?`<p>${esc(copy.intro)}</p>`:''}<dl class="preparation-site-fit">${fitMarkup}${copy.participation?`<div><dt>Участие команды — как указано на сайте</dt><dd>${esc(copy.participation)}</dd></div>`:''}${prompts.length?`<div><dt>Вопросы из карточки работы — ориентиры для обсуждения, не ответы клиента</dt><dd><ol>${prompts.map(prompt=>`<li>${esc(prompt)}</li>`).join('')}</ol></dd></div>`:''}</dl>`:'<p class="muted">Клиентское описание сейчас не передано в админку. Можно свериться со страницей; исходная техническая справка доступна в досье ниже.</p>'}<a class="preparation-site-link" href="/${kind}/${esc(entity.slug)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(linkLabel+': '+name+' (новая вкладка)')}">${linkLabel} ↗</a>`:`<p class="muted">${esc(empty)}</p>`}</section>`;
}
function sitePresentation(entry,catalog,receipt){
 const {agency,work,name,title,linked}=identity(entry,catalog,receipt);
 return `<section class="preparation-site-context"><h4>Как вариант представлен на сайте сейчас</h4><p class="small muted">Это тексты сайта, а не слова клиента. Они могли измениться после выбора. Что именно привлекло человека, ещё нужно спросить.</p><div class="preparation-site-grid">${siteCopy(agency,{kind:'agency',name,empty:'Агентство отсутствует в текущем каталоге. Его нынешнее описание недоступно. Подготовку для этого варианта можно продолжить ниже.'})}${siteCopy(work,{kind:'work',name:title,empty:entry.workSlug?'Сохранённая работа отсутствует в текущем каталоге. Её нынешнее описание недоступно. Подготовку для этого варианта можно продолжить ниже.':'Работа не выбрана. Сейчас можно подготовить разговор об агентстве.',warning:work&&(!agency||!linked)?'Сейчас каталог не связывает эту работу с доступным профилем выбранного агентства. Ниже — текст самой работы; он не подтверждает участие этой команды.':''})}</div></section>`;
}
function dossier(entry,catalog,receipt){
 const {agency,work,name}=identity(entry,catalog,receipt),works=worksFor(catalog,entry.agencySlug),linked=works.some(p=>p.slug===entry.workSlug),detail=work?.details||{};
 return `<details class="operator-dossier"><summary>Техническое досье: факты, роли и что уточнить</summary><p class="small muted">Исходные сведения каталога и публикаций о прошедших работах. Это отдельная справка, не клиентское описание выше. Она не подтверждает качество, текущий состав команды или условия будущего события.</p>
 <h4>${esc(name)}</h4>${agency?`<p class="dossier-links"><a href="/agency/${esc(agency.slug)}" target="_blank" rel="noopener">Профиль ↗</a> ${sourceLink(agency.website,'Сайт агентства')}</p><dl class="dossier-facts">${fact('Специализация в каталоге',(agency.types||[]).map(key=>catalog.types[key]||key))}${fact('Город',agency.city)}${fact('География',agency.geography)}${fact('Услуги',agency.services)}${fact('Условия бюджета в справке',agency.budgetConditions)}</dl><h5>Исходная справка каталога</h5><p class="dossier-copy">${esc(agency.rawDescription||'Исходное описание агентства не заполнено.')}</p><p class="small muted">Текст сохранён как исходная справка; утверждения следует сверять с сайтом агентства.</p>`:'<p>Профиль сейчас недоступен. Название из исходной заявки, если оно сохранено, показано выше.</p>'}
 ${work?`<h4>${esc(work.fullTitle)}</h4><p class="dossier-links"><a href="/work/${esc(work.slug)}" target="_blank" rel="noopener">Страница работы ↗</a> ${sourceLink(work.source,'Первоисточник работы')}</p><h5>Исходная справка каталога</h5><p class="dossier-copy">${esc(work.rawDescription||'Исходное описание работы не заполнено.')}</p><dl class="dossier-facts">${fact('Тип записи',work.kind==='case'?'Кейс':work.kind==='collection'?'Фотоподборка':'Работа из портфолио')}${fact('Формат',work.format||work.category)}${fact('Город события',work.eventCity)}${fact('Площадка в карточке работы',work.venue)}${work.catalogContext?.trim()&&!['Место не указано','—'].includes(work.catalogContext.trim())?fact('Контекст исходного каталога',work.catalogContext):''}${fact('Дата прошедшей работы',work.eventDate||work.year)}${fact('Участники',work.guestLabel)}${fact('Роль команды по каталогу',work.role)}</dl><h5>Опубликованные сведения по первоисточнику</h5><p class="small muted">${detail.source?'Редакционная выжимка опубликованного описания; не независимая проверка.':'Подробная выжимка из первоисточника пока не заполнена. Общая справка выше не заменяет её.'}${detail.reviewedAt?' Дата разбора: '+esc(detail.reviewedAt)+'.':''}</p><dl class="dossier-facts dossier-long">${fact('Задача',detail.task)}${fact('Идея / приём',detail.idea)}${fact('Роль',detail.role)}${fact('Результат и опубликованные оговорки',detail.result)}</dl>${sourceLink(detail.source,'Источник подробного разбора')}`:`<p class="muted">${entry.workSlug?'Сохранённая работа отсутствует в текущем каталоге.':'Работа пока не выбрана: доступна подготовка разговора об агентстве.'}</p>`}
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
 <section class="preparation-draft"><h4>От примера — к разговору</h4><p class="small muted">Набросок использует доступное «Если вам близко», цель и ожидания из рабочего брифа, сведения о прошлой работе и ответ клиента, если он сам добавил его в пожелания. Заполнятся только пустые из шести подготовительных полей; ваш текст останется на месте.</p><div class="preparation-actions"><button type="button" class="secondary" data-prepare-draft>Заполнить пустые поля подготовки наброском</button><button type="button" class="text-button" data-replace-preparation>Заменить шесть полей подготовки наброском…</button></div><p class="small muted">Замена перезапишет только шесть подготовительных полей. Ручные записи в блоке «После обсуждения» останутся. Набросок — рабочая гипотеза; проверьте его перед разговором.</p><p id="${esc(statusId)}" class="preparation-generation-status" data-generation-status role="status" aria-atomic="true" tabindex="-1"></p>${preparationFieldMarkup(entry,preparationDraftFields,statusId,statusId)}</section>
 ${eventIdeasMarkup(statusId+'-ideas',receipt?.brief?.format||'','brief','brief','unspecified','all','','',catalog)}
 <section class="preparation-follow-up" aria-labelledby="${esc(followUpId+'-title')}"><h4 id="${esc(followUpId+'-title')}">После обсуждения</h4><p id="${esc(followUpId+'-help')}" class="small muted">Запишите реальные слова клиента и итоги разговора; при необходимости укажите дату и собеседника. Эти поля заполняются вручную и сохраняются общей кнопкой заявки. Они не подтверждают автоматически бриф, согласия сторон или состоявшееся знакомство.</p>${preparationFieldMarkup(entry,preparationFollowUpFields,statusId,followUpId+'-help')}</section>
 ${discussionPlanMarkup(statusId+'-plan')}</div></article>`;
}
export function preparationMarkup(data={},catalog={agencies:[],projects:[]}){
 const format=data.receipt?.brief?.format||'';
 return `<section class="operator-subsection" id="admin-preparation" data-stage-panel="preparation"><h3>Разговор и сценарий</h3><p id="preparation-privacy" class="small muted">Только для оператора. Подготовка сохраняется с заявкой; автоматически не попадает в бриф, рекомендации или ответ клиенту. Переключение команды и работы сохраняет введённые поля на странице.</p><article class="preparation-card general-event-idea-lab" data-preparation-card data-general-idea-lab data-agency="" data-work=""><h4>С чего начать идею события</h4><p class="small muted">Можно собрать классическую основу и авторские направления ещё до выбора агентства. Для развития или сочетания реальных работ добавьте фрагменты из каталога. Черновик и реакция заказчика сохраняются внутри заявки; они не отправляются автоматически.</p>${eventIdeasMarkup('general-event-ideas',format,'brief','brief','unspecified','all','','',catalog)}<label>Общий черновик идеи<textarea data-general-event-draft maxlength="4000" rows="8" aria-describedby="preparation-privacy general-event-idea-note">${esc(data.workflow?.ideaDraft||'')}</textarea><span id="general-event-idea-note" class="small muted">До 4&nbsp;000 символов. Сохраните кнопкой «Сохранить изменения».</span></label><label>Что сказал заказчик после обсуждения<textarea data-general-event-feedback maxlength="2000" rows="3" aria-describedby="preparation-privacy">${esc(data.workflow?.ideaFeedback||'')}</textarea><span class="small muted">Записывайте только фактический отклик; используйте его для следующего варианта.</span></label></article>${preparationComparisonMarkup()}<label>Чей опыт обсуждаем<select data-preparation-context aria-label="Агентство и работа для подготовки"></select></label><p class="small muted" data-preparation-empty hidden>Команды пока не выбраны. Общий генератор выше уже работает; добавьте агентство, чтобы развить конкретные работы каталога.</p><div data-preparation-cards></div><p class="small muted" data-preparation-count role="status"></p></section>`;
}
export function readPreparation(form,fallback=[]){
 const host=form.querySelector('[data-preparation-cards]');if(host?.dataset.ready!=='true')return normalizePreparation(fallback);
 return [...host.querySelectorAll('[data-preparation-card]')].map(card=>{
  const item=emptyPreparation(card.dataset.agency,card.dataset.work||null);
  for(const field of card.querySelectorAll('[data-preparation-field]'))item[field.dataset.preparationField]=field.value;
  return card.dataset.saved==='true'||Object.keys(preparationFields).some(key=>item[key].trim())?item:null;
 }).filter(Boolean);
}
// A saved form is rendered again after PATCH. Only reuse an on-screen selection
// when the rebuilt options still have the same identities and inputs.
export function matchGeneratedIdeaView(snapshot,ideas,signature){
 if(!snapshot||snapshot.signature!==signature||!Array.isArray(snapshot.optionKeys)||!Array.isArray(ideas))return null;
 const keys=ideas.map(eventIdeaKey);
 if(keys.length!==snapshot.optionKeys.length||keys.some((key,index)=>key!==snapshot.optionKeys[index]))return null;
 const selected=Array.isArray(snapshot.selected)?snapshot.selected:[];
 if(selected.length>3||selected.some(item=>!Number.isSafeInteger(item?.index)||item.index<0||item.index>=keys.length||keys[item.index]!==item.key))return null;
 const indices=selected.map(item=>item.index);
 if(new Set(indices).size!==indices.length)return null;
 const base=snapshot.base;
 const baseIndex=base&&Number.isSafeInteger(base.index)&&indices.includes(base.index)&&keys[base.index]===base.key?base.index:null;
 return {indices,baseIndex};
}
export function wirePreparation(form,catalog,data,{getValues,selectStage}){
 const host=form.querySelector('[data-preparation-cards]'),select=form.querySelector('[data-preparation-context]'),count=form.querySelector('[data-preparation-count]');
 const saved=normalizePreparation(data.workflow?.preparation),savedIdeaSources=normalizeIdeaSources(data.workflow?.ideaSources),savedIdeaSourcesByContext=new Map(savedIdeaSources.map(row=>[ideaSourceContextKey(row),row.sources])),savedIdeaPitches=normalizeIdeaPitches(data.workflow?.ideaPitches),pitchRows=new Map(savedIdeaPitches.map(row=>[ideaPitchKey(row),row])),savedIdeaSettings=normalizeIdeaSettings(data.workflow?.ideaSettings),savedIdeaSettingsByContext=new Map(savedIdeaSettings.map(row=>[ideaSourceContextKey(row),row])),settingsDefaults=new WeakMap(),visited=new Map(),eventIdeaStates=new WeakMap(),ideaSourceSelections=new WeakMap();let active='',optionKey='',comparison=null,plans=null;
 const normalizeSourceSearch=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/\s+/g,' ').trim();
 const momentSearchIndex=new Map((catalog.projects||[]).flatMap(work=>ideaSourceMoments(work).map(moment=>[JSON.stringify([work.slug,moment.key]),normalizeSourceSearch(moment.text)])));
 const optionMomentSearch=new WeakMap();
 host.innerHTML=saved.map(item=>cardMarkup(item,catalog,data.receipt,true)).join('');host.dataset.ready='true';
 const cards=()=>[...host.querySelectorAll('[data-preparation-card]')];
 const ideaCards=()=>[...cards(),form.querySelector('[data-general-idea-lab]')].filter(Boolean);
 const settingSelectors={formatOverride:'[data-event-idea-format]',participationMode:'[data-event-idea-participation]',creativeAngle:'[data-event-idea-angle]',audienceProfile:'[data-event-idea-audience]',ideaApproach:'[data-event-idea-approach]',eventDuration:'[data-event-idea-duration]'};
 const settingDefaults={formatOverride:'other',participationMode:'brief',creativeAngle:'brief',audienceProfile:'unspecified',ideaApproach:'all',eventDuration:''};
 function settingsFromCard(card){
  return {agencySlug:card.dataset.agency,workSlug:card.dataset.work||null,...Object.fromEntries(Object.entries(settingSelectors).map(([key,selector])=>[key,card.querySelector(selector)?.value??settingDefaults[key]])),customDirection:card.querySelector('[data-event-idea-direction]')?.value.trim()||'',allowUnmatchedManualCombination:Boolean(card.querySelector('[data-event-idea-manual-combine]')?.checked)};
 }
 function hydrateSettings(card){
  if(settingsDefaults.has(card))return;
  const defaults=settingsFromCard(card),saved=savedIdeaSettingsByContext.get(ideaSourceContextKey(defaults));settingsDefaults.set(card,defaults);
  if(!saved)return;
  for(const [key,selector]of Object.entries(settingSelectors)){const field=card.querySelector(selector);if(field&&[...field.options].some(option=>option.value===saved[key]))field.value=saved[key];}
  const direction=card.querySelector('[data-event-idea-direction]'),manual=card.querySelector('[data-event-idea-manual-combine]');if(direction)direction.value=saved.customDirection;if(manual)manual.checked=saved.allowUnmatchedManualCombination;
 }
 function readSettings(){
  const rows=new Map(savedIdeaSettings.map(row=>[ideaSourceContextKey(row),row]));
  for(const card of ideaCards()){
   hydrateSettings(card);
   const current=settingsFromCard(card),defaults=settingsDefaults.get(card),key=ideaSourceContextKey(current);
   if(Object.keys(settingSelectors).every(field=>current[field]===defaults[field])&&current.customDirection===defaults.customDirection&&current.allowUnmatchedManualCombination===defaults.allowUnmatchedManualCombination)rows.delete(key);
   else rows.set(key,current);
  }
  return [...rows.values()];
 }
 function contexts(){
  const entries=new Map(),values=getValues();
  function add(item,origin){const source={agencySlug:item.agencySlug,workSlug:item.workSlug||item.work?.slug||null},key=preparationKey(source),entry=entries.get(key)||{...source,origins:[]};if(!entry.origins.includes(origin))entry.origins.push(origin);entries.set(key,entry);}
  data.receipt.selection.forEach((item,i)=>add(item,'Выбор клиента · '+(i+1)));
  values.recommendations.forEach((item,i)=>add(item,'Рекомендация · '+(i+1)));
  values.workflow.teams.forEach(item=>add({...item,workSlug:null},'Команда в работе'));
  readPreparation(form).forEach(item=>add(item,'Внутренняя подготовка'));
  savedIdeaSources.filter(item=>item.agencySlug).forEach(item=>add(item,'Источники для идеи'));
  savedIdeaPitches.filter(item=>item.agencySlug).forEach(item=>add(item,'Сохранённая подача'));
  savedIdeaSettings.filter(item=>item.agencySlug).forEach(item=>add(item,'Настройки вариантов'));
  visited.forEach(item=>{if(!entries.has(preparationKey(item)))add(item,'Просмотр досье');});
  return entries;
 }
 function show(entry){
  active=preparationKey(entry);let card=cards().find(node=>node.dataset.preparationCard===active);
  if(!card){host.insertAdjacentHTML('beforeend',cardMarkup(emptyPreparation(entry.agencySlug,entry.workSlug),catalog,data.receipt));card=cards().find(node=>node.dataset.preparationCard===active);hydrateSettings(card);}
  for(const node of cards())node.hidden=node!==card;
  card.querySelector('[data-preparation-origin]').textContent=entry.origins?.join(' · ')||'Просмотр досье';select.value=active;
  plans?.contextChanged();
 }
 function sourcesFor(card){let selected=ideaSourceSelections.get(card);if(!selected){selected=new Map();const context=ideaSourceContextKey({agencySlug:card.dataset.agency,workSlug:card.dataset.work||null});for(const source of savedIdeaSourcesByContext.get(context)||[])selected.set(JSON.stringify([source.agencySlug,source.workSlug,source.momentKey]),{...source,operatorSelected:true});ideaSourceSelections.set(card,selected);}return selected;}
 function filterIdeaSourceOptions(card){
  const search=card.querySelector('[data-event-idea-source-search]'),picker=card.querySelector('[data-event-idea-source-picker]'),status=card.querySelector('[data-event-idea-source-search-status]');if(!search||!picker||!status)return;
  const query=normalizeSourceSearch(search.value);let total=0,matched=0;
  for(const option of picker.options){if(!option.value)continue;total++;const group=option.parentElement?.label||'',label=normalizeSourceSearch(group+' '+option.textContent);let momentText=optionMomentSearch.get(option);if(query&&momentText===undefined){try{const [,workSlug,momentKey]=JSON.parse(option.value);momentText=momentSearchIndex.get(JSON.stringify([workSlug,momentKey]))||'';}catch{momentText='';}optionMomentSearch.set(option,momentText);}const visible=!query||label.includes(query)||momentText?.includes(query);option.hidden=!visible;if(visible)matched++;}
  for(const group of picker.querySelectorAll('optgroup'))group.hidden=[...group.options].every(option=>option.hidden);
  if(picker.selectedOptions[0]?.hidden)picker.value='';
  syncIdeaSourcePreview(card);
  status.textContent=query?(matched?`Найдено опубликованных фрагментов: ${matched}.`:'Совпадений нет. Попробуйте слово из названия работы, фрагмента или название агентства.'):`В списке ${total} опубликованных фрагментов.`;
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
   list.innerHTML=[...selected].map(([key,item])=>{const work=catalog.projects.find(project=>project.slug===item.workSlug),agency=catalog.agencies.find(value=>value.slug===item.agencySlug),moment=work&&item.momentKey?ideaSourceMoments(work).find(value=>value.key===item.momentKey):null,available=ideaSourceIsAvailable(item,catalog);return `<li><span>${esc(work?.fullTitle||work?.title||item.workSlug)}${moment?' · '+esc(moment.label):''} · ${esc(agency?.name||item.agencySlug)}${available?'':' · сейчас недоступен в каталоге; сохранён для ручной сверки, в генераторе не используется'}</span><button type="button" class="text-button" data-remove-event-idea-source="${esc(key)}" aria-label="Убрать источник ${esc(work?.fullTitle||work?.title||item.workSlug)}">Убрать</button></li>`;}).join('');
 }
 function installIdeaComparison(panel){
  const results=panel.querySelector('[data-event-ideas-results]'),grid=results?.querySelector('.event-idea-grid'),cards=grid?[...grid.querySelectorAll('.event-idea-card')]:[];
  if(!results||!grid||cards.length<2)return;
  const host=document.createElement('div');host.className='event-idea-comparison-host';host.dataset.eventIdeaComparison='';host.hidden=true;results.append(host);
  cards.forEach((card,index)=>{const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.toggleEventIdeaCompare=String(index);button.setAttribute('aria-pressed','false');button.textContent='Сравнить вариант';card.append(button);});
 }
 function installIdeaCombinationControl(panel){
  const section=panel.querySelector('[data-event-idea-comparison] .event-idea-comparison'),state=eventIdeaStates.get(panel);if(!section||!state)return;
  const indices=[...state.comparison];if(indices.length===3){const note=document.createElement('p');note.className='small muted';note.textContent='Для связки оставьте ровно два варианта.';section.append(note);return;}
  if(indices.length!==2)return;
  const label=document.createElement('label'),picker=document.createElement('select');label.className='event-idea-format';label.textContent='Основа связки';picker.dataset.eventIdeaCombinationBase='';
  for(const [position,index] of indices.entries()){const option=document.createElement('option');option.value=String(index);option.textContent='Вариант '+(position+1)+': '+(state.ideas[index]?.title||'Без названия');picker.append(option);}
  state.combinationBase=indices.includes(state.combinationBase)?state.combinationBase:indices[0];picker.value=String(state.combinationBase);label.append(picker);section.append(label);
  const note=document.createElement('p');note.className='small muted';note.textContent='Другой отмеченный вариант станет поддерживающим элементом.';section.append(note);
  const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.suggestEventIdeaCombination='';button.textContent='Предложить связку двух отмеченных вариантов';section.append(button);
 }
 function renderIdeaSelection(panel,state){
  const host=panel.querySelector('[data-event-idea-comparison]'),items=[...state.comparison].map(index=>state.ideas[index]).filter(Boolean);
  if(host){
   host.hidden=items.length<2;host.innerHTML=items.length>=2?renderEventIdeaComparison(items):'';
   if(items.length>=2){installIdeaCombinationControl(panel);if(state.combination){host.insertAdjacentHTML('beforeend',renderEventIdeaCombination(state.combination));const button=host.querySelector('[data-suggest-event-idea-combination]');if(button)button.disabled=true;}}
  }
  for(const button of panel.querySelectorAll('[data-toggle-event-idea-compare]')){const selected=state.comparison.has(Number(button.dataset.toggleEventIdeaCompare));button.setAttribute('aria-pressed',String(selected));button.textContent=selected?'Убрать из сравнения':'Сравнить вариант';button.disabled=!selected&&state.comparison.size>=3;}
 }
 function ideaInput(card,entries=contexts()){
  const ideaSources=[...sourcesFor(card).values()].filter(source=>ideaSourceIsAvailable(source,catalog)),currentWork={agencySlug:card.dataset.agency,workSlug:card.dataset.work||null};
  return {entry:{agencySlug:card.dataset.agency,workSlug:ideaSources.length?null:currentWork.workSlug},catalog,receipt:data.receipt,workflow:getValues().workflow,references:[...ideaSources,...(ideaSources.length&&currentWork.workSlug?[currentWork]:[]),...entries.values()],formatOverride:card.querySelector('[data-event-idea-format]')?.value||'',participationMode:card.querySelector('[data-event-idea-participation]')?.value||'brief',creativeAngle:card.querySelector('[data-event-idea-angle]')?.value||'brief',audienceProfile:card.querySelector('[data-event-idea-audience]')?.value||'unspecified',ideaApproach:card.querySelector('[data-event-idea-approach]')?.value||'all',customDirection:card.querySelector('[data-event-idea-direction]')?.value||'',eventDuration:card.querySelector('[data-event-idea-duration]')?.value||'',allowUnmatchedManualCombination:Boolean(card.querySelector('[data-event-idea-manual-combine]')?.checked),clientFeedback:card.querySelector('[data-preparation-field="clientFeedback"],[data-general-event-feedback]')?.value||''};
 }
 function generateIdeaResults(card,entries=contexts(),{focus=false}={}){
  const panel=card.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]');if(!panel||!status)return null;
  const input=ideaInput(card,entries),context=ideaSourceContextKey(pitchContext(card)),drafts=readPitches().filter(row=>ideaSourceContextKey(row)===context),ideas=buildEventIdeas(input),signature=eventIdeasSignature(input);
  for(const idea of ideas.options){const draft=drafts.find(row=>row.key===eventIdeaKey(idea));if(draft){idea.pitchText=draft.text;idea.pitchRestored=true;}}
  for(const idea of ideas.options){if(idea.pitchRestored)continue;const identity=eventIdeaPitchSourceIdentity(idea),draft=identity&&drafts.slice().reverse().find(row=>row.sourceIdentity===identity);if(draft){idea.pitchText=draft.text;idea.pitchRestored=true;idea.pitchRestoredFromKey=ideaPitchKey(draft);}}
  panel.querySelector('[data-event-ideas-results]').innerHTML=renderEventIdeas(ideas);installIdeaComparison(panel);
  for(const field of panel.querySelectorAll('[data-event-idea-pitch]')){field.maxLength=IDEA_PITCH_TEXT_LIMIT;const hint=document.createElement('p');hint.className='small muted';hint.textContent=`До ${IDEA_PITCH_TEXT_LIMIT.toLocaleString('ru-RU')} символов. Ручная подача сохранится отдельно от сценария и ответа общей кнопкой заявки.`;field.after(hint);}
  panel.querySelector('[data-event-ideas-results]').hidden=false;
  const amount=ideas.options.length,noun=amount%10===1&&amount%100!==11?'вариант':amount%10>=2&&amount%10<=4&&(amount%100<12||amount%100>14)?'варианта':'вариантов',message=`${amount===1?'Подготовлен':'Подготовлено'} ${amount} ${noun} по выбранному пути. Добавьте подходящее в черновой сценарий; заявка сохранится общей кнопкой.`;
  const state={ideas:ideas.options,commonChecks:ideas.commonChecks,signature,message,comparison:new Set(),combination:null,combinationBase:null};eventIdeaStates.set(panel,state);panel.dataset.stale='false';syncPitchArchive(card);refreshEventIdeas(entries);
  if(focus){status.focus({preventScroll:true});status.scrollIntoView({block:'center'});}
  return state;
 }
 function refreshEventIdeas(entries=contexts()){
  for(const card of ideaCards()){
   const panel=card.querySelector('[data-event-idea-generator]');if(!panel)continue;
   const generate=panel.querySelector('[data-generate-event-ideas]'),state=eventIdeaStates.get(panel),status=panel.querySelector('[data-event-ideas-status]');
   generate.disabled=form.dataset.busy==='true';
   if(!state)continue;
    const stale=state.signature!==eventIdeasSignature(ideaInput(card,entries));panel.dataset.stale=String(stale);
    if(stale&&(state.comparison.size||state.combination)){state.comparison.clear();state.combination=null;state.combinationBase=null;const comparisonHost=panel.querySelector('[data-event-idea-comparison]');if(comparisonHost){comparisonHost.hidden=true;comparisonHost.innerHTML='';}for(const button of panel.querySelectorAll('[data-toggle-event-idea-compare]')){button.setAttribute('aria-pressed','false');button.textContent='Сравнить вариант';}}
   for(const button of panel.querySelectorAll('[data-append-event-idea],[data-append-event-idea-comparison],[data-append-event-idea-combination],[data-append-event-idea-combination-shared],[data-copy-event-idea],[data-copy-event-idea-quick],[data-append-event-idea-pitch],[data-append-event-idea-reply],[data-append-event-idea-scale],[data-record-event-idea-response],[data-use-selected-event-idea-feedback],[data-open-original-idea],[data-toggle-event-idea-compare],[data-suggest-event-idea-combination]'))button.disabled=form.dataset.busy==='true'||stale||(button.matches('[data-suggest-event-idea-combination]')&&Boolean(state.combination));
    for(const picker of panel.querySelectorAll('[data-event-idea-combination-base]'))picker.disabled=form.dataset.busy==='true'||stale;
    for(const field of panel.querySelectorAll('[data-event-idea-timeline]'))field.disabled=form.dataset.busy==='true'||stale;
   for(const button of panel.querySelectorAll('[data-toggle-event-idea-compare]'))button.disabled=form.dataset.busy==='true'||stale||(!state.comparison.has(Number(button.dataset.toggleEventIdeaCompare))&&state.comparison.size>=3);
      status.textContent=stale?'Бриф, аудитория, путь, длительность, тема идеи или реакция заказчика изменились. Пересоберите подборку перед добавлением в сценарий.':state.message;
  }
 }
 const pitchContext=card=>({agencySlug:card.dataset.agency,workSlug:card.dataset.work||null});
 function readPitches(){
  for(const card of ideaCards()){
   const panel=card.querySelector('[data-event-idea-generator]'),state=panel&&eventIdeaStates.get(panel);if(!state)continue;
   const context=pitchContext(card);
   for(const field of panel.querySelectorAll('[data-event-idea-pitch]')){
    const idea=state.ideas[Number(field.dataset.eventIdeaPitch)];if(!idea)continue;
    const row={...context,key:eventIdeaKey(idea),sourceIdentity:eventIdeaPitchSourceIdentity(idea),title:idea.title.slice(0,180).trim(),text:field.value.trim()},key=ideaPitchKey(row),baseline=eventIdeaPitchText(idea).trim(),restoredKey=idea.pitchRestoredFromKey;
    if(!row.text||row.text===baseline){pitchRows.delete(key);if(restoredKey)pitchRows.delete(restoredKey);}
    else if(restoredKey&&restoredKey!==key&&row.text===idea.pitchText?.trim()){pitchRows.delete(key);continue;}
    else {if(restoredKey&&restoredKey!==key){pitchRows.delete(restoredKey);delete idea.pitchRestoredFromKey;}pitchRows.set(key,row);}
   }
  }
  return [...pitchRows.values()];
 }
 function syncPitchArchive(card,pitches=readPitches()){
  const panel=card.querySelector('[data-event-idea-generator]');if(!panel)return;
  let archive=panel.querySelector('[data-saved-idea-pitches]');
  if(!archive){archive=document.createElement('details');archive.dataset.savedIdeaPitches='';panel.querySelector('[data-event-ideas-results]')?.before(archive);}
  if(card.hasAttribute('data-general-idea-lab')){
   let capacity=panel.querySelector('[data-idea-pitch-capacity]');if(!capacity){capacity=document.createElement('p');capacity.className='small muted';capacity.dataset.ideaPitchCapacity='';archive.before(capacity);}
   const total=pitches.reduce((sum,row)=>sum+row.text.length,0),invalid=pitches.length>IDEA_PITCH_LIMIT||total>IDEA_PITCH_TOTAL_LIMIT||pitches.some(row=>row.text.length>IDEA_PITCH_TEXT_LIMIT);
   capacity.hidden=!pitches.length;capacity.classList.toggle('reply-warning',invalid);capacity.textContent=`Отдельные подачи в заявке: ${pitches.length} / ${IDEA_PITCH_LIMIT}; текст: ${total.toLocaleString('ru-RU')} / ${IDEA_PITCH_TOTAL_LIMIT.toLocaleString('ru-RU')} символов.`+(invalid?' Сократите или уберите лишние подачи перед сохранением.':' Сохраняются общей кнопкой заявки.');
  }
  const context=ideaSourceContextKey(pitchContext(card)),rows=pitches.filter(row=>ideaSourceContextKey(row)===context);
  archive.hidden=!rows.length;
  archive.innerHTML=rows.length?`<summary>Отдельные черновики подач · ${rows.length}</summary><p class="small muted">Они сохраняются с заявкой после нажатия «Сохранить изменения» отдельно от сценария и ответа. При повторной сборке подходящая подача появится в варианте; прежние тексты останутся здесь для копирования и ручной сверки.</p><ul>${rows.map(row=>`<li><strong>${esc(row.title)}</strong><textarea readonly rows="3" aria-label="Черновик подачи: ${esc(row.title)}">${esc(row.text)}</textarea><button type="button" class="text-button" data-remove-saved-idea-pitch="${esc(ideaPitchKey(row))}">Убрать подачу</button></li>`).join('')}</ul>`:'';
 }
 function readSources(){
  const rows=new Map(savedIdeaSources.map(row=>[ideaSourceContextKey(row),row]));
  for(const card of ideaCards()){
   const context={agencySlug:card.dataset.agency,workSlug:card.dataset.work||null},key=ideaSourceContextKey(context),sources=[...sourcesFor(card).values()].map(({agencySlug,workSlug,momentKey})=>({agencySlug,workSlug,momentKey}));
   if(sources.length)rows.set(key,{...context,sources});else rows.delete(key);
  }
  return normalizeIdeaSources([...rows.values()]);
 }
 function sync(){
  const entries=contexts(),key=[...entries].map(([id,item])=>id+':'+item.origins.join(',')).join('|');
  if(key!==optionKey){optionKey=key;select.innerHTML=[...entries.values()].map(item=>{const id=identity(item,catalog,data.receipt);return `<option value="${esc(preparationKey(item))}">${esc(id.name+' · '+id.title+' — '+item.origins.join(', '))}</option>`;}).join('');}
  form.querySelector('[data-preparation-empty]').hidden=entries.size>0;select.hidden=!entries.size;
  if(entries.size)show(entries.get(active)||entries.values().next().value);
  const pitches=readPitches();for(const card of ideaCards()){syncIdeaSourceList(card);syncPitchArchive(card,pitches);}
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
  form.addEventListener('change',event=>{
   if(event.target.matches('[data-event-idea-source-picker]')){syncIdeaSourcePreview(event.target.closest('[data-preparation-card]'));return;}
   if(event.target.matches('[data-event-idea-combination-base]')){
    const panel=event.target.closest('[data-event-idea-generator]'),state=panel&&eventIdeaStates.get(panel),status=panel?.querySelector('[data-event-ideas-status]'),index=Number(event.target.value);
    if(!state||!status||form.dataset.busy==='true'||panel.dataset.stale==='true'||!state.comparison.has(index))return;
    if(state.combinationBase===index)return;
    state.combinationBase=index;state.combination=null;panel.querySelector('.event-idea-combination')?.remove();
    const button=panel.querySelector('[data-suggest-event-idea-combination]');if(button)button.disabled=false;
    state.message='Основа связки изменена. Можно предложить новую связку.';status.textContent=state.message;return;
   }
   if(event.target.matches('[data-event-idea-approach],[data-event-idea-format],[data-event-idea-participation],[data-event-idea-angle],[data-event-idea-audience],[data-event-idea-duration],[data-event-idea-manual-combine]')){sync();return;}
   if(form.dataset.busy==='true'||!event.target.matches('[data-dossier-work]'))return;const card=event.target.closest('[data-preparation-card]'),workSlug=event.target.value||null;event.target.value=card.dataset.work;open({agencySlug:card.dataset.agency,workSlug});
  });
  form.addEventListener('input',event=>{if(event.target.matches('[data-general-event-draft],[data-general-event-feedback]')){plans?.sync();return;}if(event.target.matches('[data-event-idea-timeline]')){const card=event.target.closest('[data-preparation-card]'),panel=event.target.closest('[data-event-idea-generator]'),state=panel&&eventIdeaStates.get(panel),entries=contexts();if(!state)return;if(state.signature!==eventIdeasSignature(ideaInput(card,entries))){refreshEventIdeas(entries);panel.querySelector('[data-event-ideas-status]').textContent='Данные заявки изменились. Старый ритм не применён; соберите подборку заново.';return;}const idea=state.ideas[Number(event.target.dataset.eventIdeaTimeline)];if(idea){idea.timeline=event.target.value.split(/\r?\n/).map(line=>line.trimEnd()).filter(line=>line.trim());idea.timelineEdited=true;}return;}if(event.target.matches('[data-event-idea-pitch]')){syncPitchArchive(event.target.closest('[data-preparation-card]'));return;}if(event.target.matches('[data-event-idea-source-search]')){filterIdeaSourceOptions(event.target.closest('[data-preparation-card]'));return;}if(event.target.matches('[data-event-idea-direction]')){sync();return;}if(event.target.matches('[data-preparation-field]')){event.target.closest('[data-preparation-card]').querySelector('[data-generation-status]').textContent='';if(event.target.dataset.preparationField==='clientFeedback')sync();}});
 form.addEventListener('click',async event=>{
  const removePitch=event.target.closest('[data-remove-saved-idea-pitch]');
  if(removePitch&&form.dataset.busy!=='true'){
   const key=removePitch.dataset.removeSavedIdeaPitch,row=pitchRows.get(key);if(!row)return;
   if(!confirm('Убрать подачу «'+row.title+'»? После сохранения изменений этот текст больше не будет храниться в заявке.'))return;
   for(const card of ideaCards()){
    const panel=card.querySelector('[data-event-idea-generator]'),state=panel&&eventIdeaStates.get(panel);if(!state)continue;
    for(const field of panel.querySelectorAll('[data-event-idea-pitch]')){const idea=state.ideas[Number(field.dataset.eventIdeaPitch)];if(!idea)continue;const currentKey=ideaPitchKey({...pitchContext(card),key:eventIdeaKey(idea)});if(currentKey===key||idea.pitchRestoredFromKey===key&&!pitchRows.has(currentKey)){field.value=eventIdeaPitchText(idea);delete idea.pitchRestoredFromKey;}}
   }
   pitchRows.delete(key);syncPitchArchive(removePitch.closest('[data-preparation-card]'));form.dispatchEvent(new Event('input',{bubbles:true}));return;
  }
  const openOriginal=event.target.closest('[data-open-original-idea]');
  if(openOriginal&&form.dataset.busy!=='true'){
   const card=openOriginal.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),state=panel&&eventIdeaStates.get(panel),status=panel?.querySelector('[data-event-ideas-status]');if(!card||!panel||!status)return;
   const entries=contexts(),signature=eventIdeasSignature(ideaInput(card,entries));
   if(!state||state.signature!==signature){refreshEventIdeas(entries);status.textContent='Подборка устарела. Соберите варианты заново перед переносом фразы.';return;}
   openOriginalEventIdea(openOriginal,state,panel,signature);return;
  }
  const useSelectedFeedback=event.target.closest('[data-use-selected-event-idea-feedback]');
  if(useSelectedFeedback&&form.dataset.busy!=='true'){
   const card=useSelectedFeedback.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]'),feedback=card?.querySelector('[data-preparation-field="clientFeedback"],[data-general-event-feedback]'),controls=ideaReactionControls(useSelectedFeedback),transferStatus=controls.transferStatus||status;
   if(!card||!panel||!status||!transferStatus)return;
   const state=eventIdeaStates.get(panel),index=Number(useSelectedFeedback.dataset.useSelectedEventIdeaFeedback),entries=contexts();
   if(!state||state.signature!==eventIdeasSignature(ideaInput(card,entries))||!state.ideas[index]){refreshEventIdeas(entries);transferStatus.textContent='Подборка устарела. Соберите варианты заново перед привязкой фразы.';return;}
   const selected=transferSelectedFeedbackPhrase(useSelectedFeedback,feedback);
   if(selected.error){transferStatus.textContent=selected.error;return;}
   transferStatus.textContent='Фраза перенесена в заметку этого варианта. Теперь выберите ниже, как заказчик отнёсся к нему; исходная запись разговора осталась на месте.';
   selected.noteField.focus({preventScroll:true});selected.noteField.scrollIntoView({block:'center'});return;
  }
  const responseButton=event.target.closest('[data-record-event-idea-response]');
  if(responseButton&&form.dataset.busy!=='true'){
   const card=responseButton.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]');if(!card||!panel||!status)return;
    const state=eventIdeaStates.get(panel),index=Number(responseButton.dataset.recordEventIdeaResponse),idea=state?.ideas[index],entries=contexts(),signature=eventIdeasSignature(ideaInput(card,entries)),label=ideaResponseLabels[responseButton.dataset.eventIdeaResponse],controls=ideaReactionControls(responseButton),detail=ideaReactionDetails[controls.detailField?.value||'']||'',noteField=controls.noteField,note=(noteField?.value||'').replace(/[\[\]\r\n]/g,' ').replace(/\s+/g,' ').trim(),feedback=card.querySelector('[data-preparation-field="clientFeedback"],[data-general-event-feedback]');
   if(!state||state.signature!==signature||!idea){refreshEventIdeas(entries);status.textContent='Подборка устарела. Соберите варианты заново, затем запишите реакцию на нужный вариант.';return;}
   if(!label||!feedback){status.textContent='Не удалось открыть поле для записи итога разговора.';return;}
    const sourceId=eventIdeaSourceFingerprint(idea),block=`${new Date().toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'})} · ${label}: «${idea.title}».${sourceId?' [Источник варианта: '+sourceId+']':''}${detail?' [Клиент отметил: '+detail+']':''}${note?' [Комментарий клиента: '+note+']':''}`;
   if(feedback.value.includes(block)){status.textContent='Эта отметка уже есть в итогах разговора.';return;}
   const current=feedback.value.trimEnd(),next=current?current+'\n'+block:block;
   if(next.length>feedback.maxLength){status.textContent='Отметка не помещается в поле итогов разговора. Сократите запись или добавьте её вручную.';return;}
    feedback.value=next;feedback.dispatchEvent(new Event('input',{bubbles:true}));status.textContent=detail||note?'Отметка и уточнение добавлены в «Что сказал клиент после обсуждения». Соберите варианты заново, чтобы учесть слова клиента; затем нажмите общую кнопку «Сохранить изменения».':'Отметка добавлена в «Что сказал клиент после обсуждения». Соберите варианты заново, чтобы учесть реакцию; затем нажмите общую кнопку «Сохранить изменения». ';
   feedback.focus({preventScroll:true});feedback.scrollIntoView({block:'center'});return;
  }
  const appendCombinationDraft=event.target.closest('[data-append-event-idea-combination]');
  if(appendCombinationDraft&&form.dataset.busy!=='true'){
   const card=appendCombinationDraft.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]'),state=panel&&eventIdeaStates.get(panel),entries=contexts();if(!card||!panel||!status||!state?.combination)return;
   if(state.signature!==eventIdeasSignature(ideaInput(card,entries))){refreshEventIdeas(entries);status.textContent='Подборка устарела. Пересоберите варианты перед сохранением связки.';return;}
   const scenario=card.querySelector('[data-preparation-field="scenario"],[data-general-event-draft]'),block=eventIdeaText(state.combination,state.commonChecks);if(!scenario){status.textContent='Поле чернового сценария недоступно.';return;}
   if(scenario.value.includes(block)){status.textContent='Эта связка уже есть в черновом сценарии.';return;}
   const current=scenario.value.trimEnd(),next=current?current+'\n\n'+block:block;if(next.length>scenario.maxLength){status.textContent='Связка не помещается в черновой сценарий. Сократите её или возьмите только нужный элемент вручную.';return;}
   scenario.value=next;scenario.dispatchEvent(new Event('input',{bubbles:true}));state.message='Связка добавлена в черновой сценарий на этой странице. Нажмите общую кнопку «Сохранить изменения».';sync();status.textContent=state.message;scenario.focus({preventScroll:true});scenario.scrollIntoView({block:'center'});return;
  }
  const appendSharedCombination=event.target.closest('[data-append-event-idea-combination-shared]');
  if(appendSharedCombination&&form.dataset.busy!=='true'){
   const card=appendSharedCombination.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]'),state=panel&&eventIdeaStates.get(panel),entries=contexts();if(!card||!panel||!status||!state?.combination)return;
   if(state.signature!==eventIdeasSignature(ideaInput(card,entries))){refreshEventIdeas(entries);status.textContent='Подборка устарела. Пересоберите варианты перед сохранением общей гипотезы.';return;}
   const sources=state.combination.sources||[],agencySlugs=new Set(sources.map(source=>source?.agencySlug).filter(Boolean));if(agencySlugs.size<2){status.textContent='В связке больше не указаны две разные команды. Соберите варианты заново.';return;}
   const draft=form.querySelector('[data-general-event-draft]'),block='ОБЩАЯ ГИПОТЕЗА ДЛЯ ОБСУЖДЕНИЯ НЕСКОЛЬКИМИ КОМАНДАМИ\n\n'+eventIdeaText(state.combination,state.commonChecks);if(!draft){status.textContent='Общий черновик идеи события недоступен.';return;}
   if(draft.value.includes(block)){status.textContent='Эта общая гипотеза уже есть в черновике события.';return;}
   const current=draft.value.trimEnd(),next=current?current+'\n\n'+block:block;if(next.length>draft.maxLength){status.textContent='Общая гипотеза не помещается в черновик события. Сократите текст или добавьте только нужные фрагменты вручную.';return;}
   draft.value=next;draft.dispatchEvent(new Event('input',{bubbles:true}));state.message='Общая гипотеза добавлена в общий черновик события с обеими исходными работами и пометкой о неподтверждённых ролях. Нажмите «Сохранить изменения».';sync();status.textContent=state.message;draft.focus({preventScroll:true});draft.scrollIntoView({block:'center'});return;
  }
  const suggestCombination=event.target.closest('[data-suggest-event-idea-combination]');
  if(suggestCombination&&form.dataset.busy!=='true'){
   const card=suggestCombination.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]'),state=panel&&eventIdeaStates.get(panel),entries=contexts();if(!card||!panel||!status||!state)return;
   if(state.signature!==eventIdeasSignature(ideaInput(card,entries))){refreshEventIdeas(entries);status.textContent='Подборка устарела. Соберите варианты заново перед поиском связки.';return;}
   const indices=[...state.comparison],baseValue=panel.querySelector('[data-event-idea-combination-base]')?.value,baseIndex=indices.find(index=>String(index)===baseValue);
   if(indices.length!==2||baseIndex===undefined){status.textContent='Выберите два варианта и основу связки.';return;}
   const items=[baseIndex,indices.find(index=>index!==baseIndex)].map(index=>state.ideas[index]).filter(Boolean),result=combineEventIdeaOptions(items);if(!result.option){state.combination=null;status.textContent=result.reason;return;}
   if(state.combination){status.textContent='Черновик связки уже подготовлен. Измените отмеченные варианты, чтобы собрать другой.';return;}
   state.combination=result.option;const host=panel.querySelector('[data-event-idea-comparison]');if(host)host.insertAdjacentHTML('beforeend',renderEventIdeaCombination(result.option));suggestCombination.disabled=true;state.message='Подготовлена гипотеза сочетания двух вариантов. Проверьте общую тему и возможность реализации.';status.textContent=state.message;return;
  }
  const appendComparison=event.target.closest('[data-append-event-idea-comparison]');
  if(appendComparison&&form.dataset.busy!=='true'){
   const card=appendComparison.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]'),state=panel&&eventIdeaStates.get(panel),entries=contexts();if(!card||!panel||!status||!state)return;
   if(state.signature!==eventIdeasSignature(ideaInput(card,entries))){refreshEventIdeas(entries);status.textContent='Подборка устарела. Соберите варианты заново перед сохранением сравнения.';return;}
   const items=[...state.comparison].map(index=>state.ideas[index]).filter(Boolean);if(items.length<2){status.textContent='Отметьте минимум два варианта для сравнения.';return;}
   const scenario=card.querySelector('[data-preparation-field="scenario"],[data-general-event-draft]'),block=eventIdeaComparisonText(items,state.commonChecks);if(!scenario){status.textContent='Поле чернового сценария недоступно.';return;}
   if(scenario.value.includes(block)){status.textContent='Это сравнение уже есть в черновом сценарии.';return;}
   const current=scenario.value.trimEnd(),next=current?current+'\n\n'+block:block;if(next.length>scenario.maxLength){status.textContent='Сравнение не помещается в черновой сценарий. Уберите один вариант или добавьте их по отдельности.';return;}
   scenario.value=next;scenario.dispatchEvent(new Event('input',{bubbles:true}));state.message='Сравнение добавлено в черновой сценарий на этой странице. Нажмите общую кнопку «Сохранить изменения».';sync();status.textContent=state.message;scenario.focus({preventScroll:true});scenario.scrollIntoView({block:'center'});return;
  }
  const compareButton=event.target.closest('[data-toggle-event-idea-compare]');
  if(compareButton&&form.dataset.busy!=='true'){
   const card=compareButton.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]');if(!card||!panel||!status)return;
   const state=eventIdeaStates.get(panel),index=Number(compareButton.dataset.toggleEventIdeaCompare),entries=contexts(),signature=eventIdeasSignature(ideaInput(card,entries));
   if(!state||state.signature!==signature||!state.ideas[index]){refreshEventIdeas(entries);status.textContent='Подборка устарела. Соберите варианты заново перед сравнением.';return;}
   if(state.comparison.has(index))state.comparison.delete(index);
   else if(state.comparison.size>=3){status.textContent='Можно сравнить не больше трёх вариантов. Уберите один, чтобы добавить другой.';return;}
   else state.comparison.add(index);
   const items=[...state.comparison].map(itemIndex=>state.ideas[itemIndex]).filter(Boolean);state.combination=null;if(!state.comparison.has(state.combinationBase))state.combinationBase=null;
   renderIdeaSelection(panel,state);
   state.message=items.length?`В сравнении ${items.length} варианта. Сопоставьте основания, ограничения и вопросы перед обсуждением.`:state.comparison.size?`Отмечен один вариант. Добавьте ещё один, чтобы сравнить их рядом.`:'Сравнение очищено.';status.textContent=state.message;return;
  }
  const addSource=event.target.closest('[data-add-event-idea-source]'),removeSource=event.target.closest('[data-remove-event-idea-source]');
  if((addSource||removeSource)&&form.dataset.busy!=='true'){
   const card=event.target.closest('[data-preparation-card]'),picker=card?.querySelector('[data-event-idea-source-picker]'),sourceStatus=card?.querySelector('[data-event-idea-source-status]');if(!card||!picker||!sourceStatus)return;
   const selected=sourcesFor(card);
   if(removeSource){selected.delete(removeSource.dataset.removeEventIdeaSource);sync();form.dispatchEvent(new Event('input',{bubbles:true}));sourceStatus.textContent='Источник убран из этой подборки идей. Состав заявки и выбор клиента не изменились.';return;}
   let value;try{value=JSON.parse(picker.value);}catch{value=null;}
   const [agencySlug,workSlug,momentKey]=Array.isArray(value)?value:[],key=JSON.stringify([agencySlug,workSlug,momentKey]);
   if(!ideaSourceIsAvailable({agencySlug,workSlug,momentKey},catalog)){sourceStatus.textContent='Выберите доступный фрагмент работы из каталога.';return;}
   if([...selected.values()].some(item=>item.agencySlug===agencySlug&&item.workSlug===workSlug&&item.momentKey===momentKey)){sourceStatus.textContent='Этот фрагмент уже добавлен в подборку.';return;}
   if(selected.size>=3){sourceStatus.textContent='В одну подборку можно добавить до трёх фрагментов. Уберите один, если хотите заменить его.';return;}
   if(!selected.size&&readSources().length>=IDEA_SOURCE_CONTEXT_LIMIT){sourceStatus.textContent='Достигнут предел подборок с источниками для одной заявки. Уберите больше не нужную подборку перед добавлением новой.';return;}
   selected.set(key,{agencySlug,workSlug,momentKey,operatorSelected:true});picker.value='';sync();form.dispatchEvent(new Event('input',{bubbles:true}));sourceStatus.textContent='Фрагмент работы добавлен только как источник идеи. Сохраните изменения; затем пересоберите варианты, чтобы развить или сочетать их.';return;
  }
  const generateIdeas=event.target.closest('[data-generate-event-ideas]'),appendIdea=event.target.closest('[data-append-event-idea]'),copyIdea=event.target.closest('[data-copy-event-idea]'),copyQuickIdea=event.target.closest('[data-copy-event-idea-quick]'),appendPitch=event.target.closest('[data-append-event-idea-pitch]'),appendReply=event.target.closest('[data-append-event-idea-reply]'),appendScale=event.target.closest('[data-append-event-idea-scale]');
  if((generateIdeas||appendIdea||copyIdea||copyQuickIdea||appendPitch||appendReply||appendScale)&&form.dataset.busy!=='true'){
   const card=event.target.closest('[data-preparation-card]'),panel=card?.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]');
   if(!card||!panel||!status)return;
   const entries=contexts();
   if(generateIdeas){generateIdeaResults(card,entries,{focus:true});return;}
   const input=ideaInput(card,entries);
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
   const scenario=card.querySelector('[data-preparation-field="scenario"],[data-general-event-draft]');if(!scenario)return;
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
 function captureGeneratedIdeas(){
  return ideaCards().flatMap(card=>{
   const panel=card.querySelector('[data-event-idea-generator]'),state=panel&&eventIdeaStates.get(panel);if(!state)return [];
   const keyed=index=>state.ideas[index]?{index,key:eventIdeaKey(state.ideas[index])}:null;
   return [{agencySlug:card.dataset.agency||'',workSlug:card.dataset.work||null,signature:state.signature,optionKeys:state.ideas.map(eventIdeaKey),selected:[...state.comparison].map(keyed).filter(Boolean),base:keyed(state.combinationBase),combinationKey:state.combination?eventIdeaKey(state.combination):null}];
  });
 }
 function restoreGeneratedIdeas(snapshots){
  if(!Array.isArray(snapshots))return;
  for(const snapshot of snapshots){
   if(!snapshot||typeof snapshot.agencySlug!=='string')continue;
   const workSlug=typeof snapshot.workSlug==='string'&&snapshot.workSlug?snapshot.workSlug:null,agencySlug=snapshot.agencySlug;
   let card=ideaCards().find(item=>item.dataset.agency===agencySlug&&(item.dataset.work||null)===workSlug);
   if(!card&&agencySlug&&contexts().has(preparationKey({agencySlug,workSlug}))){host.insertAdjacentHTML('beforeend',cardMarkup(emptyPreparation(agencySlug,workSlug),catalog,data.receipt));card=ideaCards().find(item=>item.dataset.agency===agencySlug&&(item.dataset.work||null)===workSlug);if(card)hydrateSettings(card);}
   if(!card)continue;
   const panel=card.querySelector('[data-event-idea-generator]'),status=panel?.querySelector('[data-event-ideas-status]'),state=generateIdeaResults(card);if(!state||!status)continue;
   if(panel.dataset.stale==='true'){state.message='Данные изменились во время восстановления. Соберите варианты заново.';status.textContent=state.message;continue;}
   const retained=matchGeneratedIdeaView(snapshot,state.ideas,state.signature);
   if(retained){
    state.comparison=new Set(retained.indices);state.combinationBase=retained.baseIndex;
    if(snapshot.combinationKey&&retained.indices.length===2&&retained.baseIndex!==null){const order=[retained.baseIndex,...retained.indices.filter(index=>index!==retained.baseIndex)],result=combineEventIdeaOptions(order.map(index=>state.ideas[index]));if(result.option&&eventIdeaKey(result.option)===snapshot.combinationKey)state.combination=result.option;}
    renderIdeaSelection(panel,state);
    state.message=state.combination?'Варианты, сравнение и связка восстановлены после сохранения.':retained.indices.length>=2?`Варианты и сравнение восстановлены после сохранения.${snapshot.combinationKey?' Связку нужно собрать заново.':''}`:retained.indices.length===1?'Варианты и одна отметка для сравнения восстановлены. Добавьте второй вариант.':'Варианты восстановлены после сохранения.';
   }else state.message=`Варианты пересобраны по сохранённым данным.${snapshot.selected?.length||snapshot.combinationKey?' Прежнее сравнение снято.':''}`;
   status.textContent=state.message;
  }
 }
 const controller={sync,readSources,readPitches,readSettings,controls:()=>{comparison.controls();plans.controls();refreshEventIdeas();},capture:()=>({recordId:data.recordId,active,visited:[...visited.values()].map(({agencySlug,workSlug})=>({agencySlug,workSlug})),comparison:comparison.capture(),generatedIdeas:captureGeneratedIdeas()}),restore:view=>{
  if(form.dataset.busy==='true'||!view||view.recordId!==data.recordId)return;
  // Empty visited contexts are view state too: readPreparation omits them.
  for(const item of normalizePreparation(view.visited))visited.set(preparationKey(item),{agencySlug:item.agencySlug,workSlug:item.workSlug});
  active=typeof view.active==='string'?view.active:'';sync();comparison.restore(view.comparison);restoreGeneratedIdeas(view.generatedIdeas);
 }};
 for(const card of ideaCards())hydrateSettings(card);
 preparationViews.set(form,controller);sync();return controller;
}
export function preparationHistory(items,catalog){
 const entries=normalizePreparation(items);if(!entries.length)return '';
 return `<h4>Внутренняя подготовка на этот момент</h4>${entries.map(entry=>{const id=identity(entry,catalog||{agencies:[],projects:[]});return `<details><summary>${esc(id.name+' · '+id.title)}</summary><dl>${Object.entries(preparationFields).map(([key,{label}])=>`<dt>${esc(label)}</dt><dd class="preparation-history">${esc(entry[key]||'Не заполнено')}</dd>`).join('')}</dl></details>`;}).join('')}`;
}
