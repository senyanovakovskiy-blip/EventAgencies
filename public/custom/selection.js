import {setupSelectionShare} from './share-selection.js';
import {setupProjectSections} from './project-sections.js';
import {setupBriefSummary} from './project-brief.js';
import {setupProjectExport} from './project-export.js';
import {setupProjectHistory} from './project-history.js';
import {setupAccountProjectCopies} from './account-project-copies.js';
import {normalizeReferences} from './reference-store.js';
import {referenceNotesForWork} from './reference-note-model.js';
import {setupWishesUndo} from './wishes-undo.js';
import {setupReplacementUndo} from './replacement-undo.js';
import {setupProjectWorkPicker} from './project-work-picker.js';
import {setupProjectNoteEditor} from './project-note-editor.js';
import {setupComparisonCriteria,syncComparisonCriteria} from './project-comparison-criteria.js';
import {comparisonValuesMatch} from './project-comparison-equality.js';
import {KEY,workNoteKey,updateWorkNote,occasions,contactMethods,emptyDraft,normalizeDraft,readDraft,writeDraft,addAgency,replaceAgency,removeAgency,restoreAgency,moveAgency,updateBrief,updateContact,submitLocal} from './project-store.js';
import {reviewMarkup,receiptMarkup,wishesAddition,mergeWishes} from './request-review.js';
import {createInquiryClient} from './inquiry-client.js';
import {INQUIRY_KEY,contactError,validPayload,submissionPayload} from './inquiry-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let removedAgency=null;
const projectViewKey='eventagencies-project-view-v1';
let projectView={};try{projectView=JSON.parse(sessionStorage.getItem(projectViewKey)||'{}')||{};}catch{}
const expandedAgencies=new Set(Array.isArray(projectView.expandedAgencies)?projectView.expandedAgencies.filter(slug=>typeof slug==='string'&&/^[a-z0-9-]+$/.test(slug)).slice(-100):[]);
let comparisonView=projectView.comparisonView==='table'?'table':'cards';
function rememberProjectView(){try{sessionStorage.setItem(projectViewKey,JSON.stringify({comparisonView,expandedAgencies:[...expandedAgencies].slice(-100)}));}catch{}}
const renderBriefSummary=setupBriefSummary(formatName);
const orderStatus=document.createElement('p');orderStatus.className='project-order-status';orderStatus.setAttribute('role','status');orderStatus.setAttribute('aria-live','polite');
document.querySelector('.comparison-toolbar')?.after(orderStatus);
const helpMode=new URLSearchParams(location.search).has('help');
let helpSelectionExpanded=false;
let draft=emptyDraft(),available=true,dataPromise,focusRequest=false,pendingReplacement=null,savingDraft=false,sending=false,sendError='',lastReceipt=null,wishesUndo=null,replacementUndo=null;
const inquiries=createInquiryClient({storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)}});
try{draft=readDraft(localStorage);}catch{available=false;}
const getData=()=>dataPromise||(dataPromise=(async()=>{
 const embedded=document.getElementById('project-reference-data');
 if(embedded)return JSON.parse(embedded.textContent);
 const response=await fetch('/custom/catalog-data.json');if(!response.ok)throw Error('data');return response.json();
})().catch(error=>{dataPromise=null;throw error;}));
function persist(next,{quiet=false}={}){
 orderStatus.textContent='';
 lastReceipt=null;sendError='';
 try{draft=writeDraft(localStorage,next);available=true;refresh();return true;}
 catch{draft=normalizeDraft({...next,request:null});available=false;refresh();document.getElementById('project-storage-note')?.removeAttribute('hidden');if(!quiet)notice('Не удалось сохранить изменения','В браузере недоступно сохранение. Разрешите хранение данных сайта и попробуйте ещё раз.');return false;}
}
const pop=document.createElement('aside');pop.className='ea-selection-notice';pop.hidden=true;pop.setAttribute('aria-label','Ваша подборка');document.body.append(pop);
function notice(title,copy,{undoReplacement=false}={}){const inProject=Boolean(document.getElementById('project-board'));pop.innerHTML=`<button class="ea-notice-close" aria-label="Закрыть уведомление">×</button><div role="status"><strong>${esc(title)}</strong><p>${esc(copy)}</p></div><div class="ea-notice-actions">${undoReplacement&&replacementUndo?.hasChange()?'<button type="button" data-undo-replacement>Отменить замену</button>':''}<button data-continue>Продолжить выбор</button><a href="${inProject?'#project-comparison':'/my-project'}"${inProject?' data-edit-selection':''}>${inProject?'К сравнению':'Мой проект'}${draft.selection.length?' · '+draft.selection.length:''} ↗</a></div>`;pop.hidden=false;replacementUndo?.sync();}
function withReferenceNote(state,agencySlug,workSlug,note){return workSlug&&note?.trim()&&!Object.hasOwn(state.workNotes,workNoteKey(agencySlug,workSlug))?updateWorkNote(state,agencySlug,workSlug,note):state;}
const replacement=document.createElement('dialog');replacement.id='replacement-dialog';replacement.setAttribute('aria-labelledby','replacement-title');document.body.append(replacement);
replacement.addEventListener('close',()=>{pendingReplacement=null;});
async function offerReplacement(agencySlug,workSlug,note=''){
 try{
  const data=await getData(),candidate=data.agencies.find(a=>a.slug===agencySlug);if(!candidate)return;
  pendingReplacement={agencySlug,workSlug,note,name:candidate.name};
  replacement.innerHTML=`<button class="brief-close" data-cancel-replacement aria-label="Закрыть замену агентства">×</button><span class="eyebrow">До трёх команд в одном проекте</span><h2 id="replacement-title">Кого заменить на ${esc(candidate.name)}?</h2><p>Описание мероприятия сохранится. Вместо выбранной ниже команды появится ${esc(candidate.name)}${workSlug?' с выбранной работой':''}. Последнюю замену можно будет отменить.</p><div class="replacement-options">${draft.selection.map(s=>{const a=data.agencies.find(a=>a.slug===s.agencySlug);return `<button class="secondary-action" data-replace-agency="${esc(s.agencySlug)}" data-replace-name="${esc(a?.name||s.agencySlug)}">Заменить ${esc(a?.name||s.agencySlug)}</button>`;}).join('')}</div><button class="replacement-cancel" data-cancel-replacement>Оставить подборку</button>`;
  pop.hidden=true;replacement.showModal();
 }catch{notice('Не удалось загрузить варианты замены','Подборка не изменилась. Попробуйте ещё раз.');}
}
function refresh(){
 replacementUndo?.sync();
 document.querySelectorAll('[data-workspace-team-count]').forEach(node=>node.textContent=String(draft.selection.length));
 document.querySelectorAll('[data-save-agency]').forEach(button=>{
  const entry=draft.selection.find(s=>s.agencySlug===button.dataset.saveAgency),work=button.dataset.saveWork;
  const selected=Boolean(entry&&(!work||entry.workSlug===work));
  if(work&&button.hasAttribute('data-reference-team')){button.textContent=selected?'В сравнении ✓':entry?'Сравнить с этой работой':'Добавить в сравнение';button.setAttribute('aria-label',button.dataset.agencyName?button.textContent+' · '+button.dataset.agencyName:'Выберите команду для сравнения');}
  else if(work){const name=button.dataset.agencyName;button.textContent=selected?(name?name+' и работа добавлены':'Команда и работа добавлены'):entry?'Выбрать эту работу':name?'Добавить '+name+' с этой работой':'Добавить команду с этой работой';}
  else button.textContent=button.hasAttribute('data-agency-label')?(selected?'Агентство добавлено':'Добавить агентство'):(selected?'Добавлено':'В мой проект');
  button.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-project-count]').forEach(node=>node.textContent=draft.selection.length?String(draft.selection.length):'');
 document.querySelectorAll('[data-my-project-link]').forEach(node=>node.setAttribute('aria-label','Мой проект'+(draft.selection.length?', агентств: '+draft.selection.length:'')));
 if(document.getElementById('project-board'))renderProject();
}
document.addEventListener('click',async event=>{
 if(event.target.closest('[data-toggle-help-selection]')){setHelpSelection(!helpSelectionExpanded);return;}
 if(event.target.closest('[data-go-to-contact]')){event.preventDefault();focusContact();return;}
 const wishes=event.target.closest('[data-add-wishes-work],[data-add-wishes-selection]');if(wishes){event.preventDefault();await openWishes(wishes);return;}
 const view=event.target.closest('[data-comparison-view]');if(view){comparisonView=view.dataset.comparisonView;rememberProjectView();renderProject();return;}
 const move=event.target.closest('[data-move-agency]');if(move){
  const agencySlug=move.dataset.moveAgency,direction=Number(move.dataset.moveDirection),next=moveAgency(draft,agencySlug,direction);
  if(next===draft)return;
  if(persist(next)){
   await renderProject();
   const index=draft.selection.findIndex(item=>item.agencySlug===agencySlug),data=await getData(),name=data.agencies.find(agency=>agency.slug===agencySlug)?.name||agencySlug;
   orderStatus.textContent=name+' — приоритет '+(index+1)+' в вашей подборке.';
   const container=document.getElementById(comparisonView==='table'?'comparison-table':'project-board');
   const buttons=[...container.querySelectorAll(`[data-move-agency="${agencySlug}"]`)];
   (buttons.find(button=>button.dataset.moveDirection===String(direction)&&!button.disabled)||buttons.find(button=>!button.disabled))?.focus({preventScroll:true});
  }
  return;
 }
 const save=event.target.closest('[data-save-agency]');
 if(save){
  event.preventDefault();const result=addAgency(draft,save.dataset.saveAgency,save.dataset.saveWork||null),referenceNote=save.dataset.referenceNoteAgency?draft.workNotes[workNoteKey(save.dataset.referenceNoteAgency,save.dataset.saveWork)]||'':'';
  if(result.result==='full'){await offerReplacement(save.dataset.saveAgency,save.dataset.saveWork||null,referenceNote);return;}
  if(result.result==='invalid')return;
  if(result.result!=='existing'&&!persist(withReferenceNote(result.state,save.dataset.saveAgency,save.dataset.saveWork,referenceNote)))return;
  const left=3-draft.selection.length;
  notice(result.result==='updated'?'Выбранная работа обновлена':result.result==='existing'?'Агентство уже в вашем проекте':'Агентство добавлено в ваш проект',left===2?'Можно добавить ещё две команды для сравнения или перейти к описанию мероприятия.':left===1?'Можно добавить ещё одну команду для сравнения или перейти к описанию мероприятия.':'Три команды выбраны. Перейдите к сравнению и описанию мероприятия.');return;
 }
 const replace=event.target.closest('[data-replace-agency]');
 if(replace&&pendingReplacement){
  const previousSelection=draft.selection.map(item=>({...item})),previousName=replace.dataset.replaceName||replace.dataset.replaceAgency,nextName=pendingReplacement.name;
  const next=replaceAgency(draft,replace.dataset.replaceAgency,pendingReplacement.agencySlug,pendingReplacement.workSlug);
  if(next.result==='replaced'&&persist(withReferenceNote(next.state,pendingReplacement.agencySlug,pendingReplacement.workSlug,pendingReplacement.note))){replacementUndo?.record(previousSelection,draft.selection,previousName,nextName);replacement.close();notice('Агентство заменено','В подборке по-прежнему три команды. Описание мероприятия сохранено.',{undoReplacement:true});}
  else if(next.result!=='replaced'){replacement.close();notice('Подборка уже изменилась','Проверьте выбранные команды в «Моём проекте».');}
  return;
 }
 if(event.target.closest('[data-cancel-replacement]')){replacement.close();return;}
 if(event.target.closest('[data-continue],.ea-notice-close')){pop.hidden=true;return;}
 const remove=event.target.closest('[data-remove-agency]');if(remove){
  const index=draft.selection.findIndex(s=>s.agencySlug===remove.dataset.removeAgency);if(index<0)return;
  const item={...draft.selection[index]};
  const name=remove.dataset.agencyName||remove.closest('article')?.querySelector('h3')?.textContent||item.agencySlug;
  if(persist(removeAgency(draft,item.agencySlug))){
   removedAgency={item,index};const undo=document.getElementById('project-undo');
   if(undo){undo.hidden=false;document.getElementById('project-undo-status').textContent=name+' убрано из подборки. Можно вернуть вместе с выбранным кейсом.';undo.querySelector('button').focus();}
  }return;
 }
 if(event.target.closest('[data-undo-removal]')&&removedAgency){
  const restored=restoreAgency(draft,removedAgency.item,removedAgency.index);
  const status=document.getElementById('project-undo-status');
  if(restored.result==='full'){status.textContent='В подборке уже три команды. Уберите одну, затем верните агентство.';return;}
  if(restored.result==='existing'){status.textContent='Эта команда уже в подборке. Ваш текущий выбор кейса сохранён.';return;}
  if(restored.result==='restored'&&persist(restored.state)){removedAgency=null;document.getElementById('project-undo').hidden=true;document.getElementById('project-comparison').focus();}
  return;
 }
 const occasion=event.target.closest('[data-occasion]');if(occasion&&!draft.brief.format&&Object.hasOwn(occasions,occasion.dataset.occasion))persist(updateBrief(draft,{format:occasion.dataset.occasion}),{quiet:true});
 const editBrief=event.target.closest('[data-edit-brief]');if(editBrief)openBrief(editBrief.dataset.briefField);
 const editWork=event.target.closest('[data-review-work]');if(editWork){
  event.preventDefault();setHelpSelection(true);comparisonView='cards';rememberProjectView();await renderProject();
  const picker=document.querySelector(`[data-open-work-picker="${editWork.dataset.reviewWork}"]`);
  if(picker){picker.click();return;}
  const field=document.getElementById('work-choice-'+editWork.dataset.reviewWork);
  if(field){field.scrollIntoView({block:'center'});field.focus({preventScroll:true});}
  else document.getElementById('project-comparison')?.focus();
  return;
 }
 if(event.target.closest('[data-edit-selection]')){event.preventDefault();pop.hidden=true;setHelpSelection(true);const section=document.getElementById('project-comparison');section?.scrollIntoView({block:'start'});section?.focus({preventScroll:true});}
 if(event.target.closest('[data-return-project]')){document.querySelector('.project-intro')?.scrollIntoView({block:'start'});document.querySelector('.project-intro-actions [data-edit-brief]')?.focus({preventScroll:true});}
 if(event.target.closest('[data-submit-project]')){
  await sendInquiry();return;
 }
 if(event.target.closest('[data-save-draft]')){
  if(savingDraft||(available&&draft.request))return;
  savingDraft=true;const button=document.querySelector('[data-save-draft]');button.disabled=true;
  try{const result=submitLocal(draft,'EA-LOCAL-'+Date.now().toString(36).toUpperCase(),new Date().toISOString());focusRequest=true;if(!persist(result.state))focusRequest=false;}
  finally{savingDraft=false;button.disabled=Boolean(available&&draft.request);}
 }

});
addEventListener('storage',e=>{if(e.key===INQUIRY_KEY)refresh();if(e.key===KEY||e.key===null){try{draft=readDraft(localStorage);refresh();if(briefForm&&document.getElementById('brief-dialog').open)fillBrief(briefForm);if(contactForm)fillContact();}catch{}}});
new MutationObserver(changes=>{if(changes.some(c=>c.type==='attributes'||[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-save-agency],[data-project-count]')||n.querySelector?.('[data-save-agency],[data-project-count]')))))refresh();}).observe(document.getElementById('root')||document.getElementById('content'),{childList:true,subtree:true,attributes:true,attributeFilter:['data-save-agency','data-save-work']});
for(const type of ['wheel','pointerdown','touchstart'])document.addEventListener(type,event=>{if(matchMedia('(max-width:900px)').matches&&event.target.closest('.home.is-landing .ws:not(.ea-photo-reel)'))event.stopPropagation();},{capture:true,passive:true});
function formatName(value){return occasions[value]||(value==='other'?'Другой формат':'Нужно уточнить');}
function facts(p){return [p.category,p.eventCity,p.guestLabel].filter(Boolean).join(' · ');}
function role(p){
 const text=p?.role?.trim();
 if(!text||/^(?:Проект в (?:официальном )?портфолио агентства|Работа (?:представлена в |из |в )портфолио агентства)(?: для .*)?\.?$/i.test(text))return 'Нужно уточнить';
 if(/состав работ не раскрыт|границы участия не раскрыты|независимая проверка|^Работа в портфолио;/i.test(text))return 'Нужно уточнить. '+text;
 return text;
}
function selectedWork(data,s){return data.projects.find(p=>p.slug===s.workSlug&&(p.agencySlug===s.agencySlug||p.agencySlugs?.includes(s.agencySlug)));}
function briefRows(b){return [['Формат',formatName(b.format)],['Город',b.city||'Нужно уточнить'],['Дата или период',b.dateUnknown?'Дата пока неизвестна':b.date||'Нужно уточнить'],['Количество гостей',b.guests||'Нужно уточнить'],['Ориентировочный бюджет',b.budgetHelp?'Нужна помощь с оценкой бюджета':b.budget?b.budget+' ₽':'Нужно уточнить'],['Пожелания',b.description||'Пока не указаны']];}
function agencyPriority(agency,index,total){
 return `<div class="agency-priority"><span class="agency-priority-label">Ваш приоритет <b>${String(index+1).padStart(2,'0')}</b></span>${total>1?`<div class="agency-priority-actions" role="group" aria-label="Приоритет ${esc(agency.name)}"><button type="button" data-move-agency="${agency.slug}" data-move-direction="-1" aria-label="Поднять приоритет ${esc(agency.name)}" title="Поднять приоритет"${index===0?' disabled':''}>↑</button><button type="button" data-move-agency="${agency.slug}" data-move-direction="1" aria-label="Опустить приоритет ${esc(agency.name)}" title="Опустить приоритет"${index===total-1?' disabled':''}>↓</button></div>`:''}</div>`;
}
let renderVersion=0;
async function renderProject(){
 const host=document.getElementById('project-board');if(!host)return;const version=++renderVersion;
 wishesUndo?.sync();
 replacementUndo?.sync();
 try{
  const data=await getData();if(version!==renderVersion)return;
  const agencyMap=new Map(data.agencies.map(a=>[a.slug,a]));
  const entries=draft.selection.filter(s=>agencyMap.has(s.agencySlug)),b=draft.brief;
  host.dataset.count=String(entries.length);
  renderBriefSummary(b);
  document.getElementById('selection-total').textContent=entries.length+' / 3';
  host.innerHTML=entries.length?entries.map((s,index)=>{
   const a=agencyMap.get(s.agencySlug),p=selectedWork(data,s),link=p?'/work/'+p.slug+'?from=%2Fmy-project%23project-comparison':null;
   const specialization=a.types.map(t=>data.types[t]).filter(Boolean).join(', ')||'Нужно уточнить';
   return `<article class="project-agency-card">
    ${agencyPriority(a,index,entries.length)}
    <div class="project-agency-head"><div><h3>${esc(a.name)}</h3><p class="project-agency-location">${esc(a.city||'Город не указан')}</p></div></div>
    <div class="project-case-reason">${p?`${p.hasPhotos?`<a class="project-case-photo" href="${link}"><img src="${p.preview||p.reelMobile||p.image}" srcset="${esc(p.previewSrcSet||'')}" sizes="(max-width:900px) 100vw, 33vw" width="${p.imageWidth||1500}" height="${p.imageHeight||1000}" decoding="async" alt="${esc(p.fullTitle)}" loading="lazy"></a>`:''}<span class="eyebrow">${p.kind==='case'?'Выбранный кейс':'Выбранная работа'}</span><h4><a href="${link}">${esc(p.fullTitle)} ↗</a></h4><p>${esc(facts(p))}</p>`:'<div class="project-no-case"><span>Кейс не выбран</span></div>'}</div>
    <section class="work-note-block"><label for="work-choice-${a.slug}">Работа для сравнения</label><select id="work-choice-${a.slug}" data-selected-work="${a.slug}"><option value="">Без выбранной работы</option>${data.projects.filter(w=>w.agencySlug===a.slug||w.agencySlugs?.includes(a.slug)).map(w=>`<option value="${esc(w.slug)}" ${w.slug===s.workSlug?'selected':''}>${esc(w.fullTitle)}</option>`).join('')}</select><button class="secondary-action work-picker-opener" type="button" data-open-work-picker="${a.slug}" aria-label="Посмотреть и выбрать работу ${esc(a.name)}">Посмотреть работы…</button>${p?`<label for="note-${a.slug}">Что нравится в этой работе?</label><textarea id="note-${a.slug}" data-work-note="${a.slug}" data-note-work="${p.slug}" rows="3" maxlength="1000" aria-describedby="note-help-${a.slug} note-status-${a.slug}" placeholder="Например: тёплый свет, оформление сцены, живая музыка">${esc(draft.workNotes[workNoteKey(a.slug,p.slug)]||'')}</textarea><p id="note-help-${a.slug}">Личная заметка · только в этом браузере. Передать её можно через «Добавить в пожелания».</p><button class="secondary-action" type="button" data-add-wishes-work="${p.slug}" data-add-wishes-agency="${a.slug}">Добавить в пожелания…</button><p id="note-status-${a.slug}" role="status"></p>`:'<p>Выберите работу выше, чтобы оставить заметку.</p>'}</section>
    <details class="project-agency-details" data-agency-details="${a.slug}"${expandedAgencies.has(a.slug)?' open':''}><summary><span>Об агентстве и условиях</span><span class="agency-details-sign" aria-hidden="true">+</span></summary>
    <section class="comparison-block"><h4>Специализация</h4><p>${esc(specialization)}</p></section>
    <section class="comparison-block"><h4>География работы</h4><p>${esc(a.geography||'Нужно уточнить')}</p><p class="comparison-detail">Город команды: ${esc(a.city||'Нужно уточнить')}</p></section>
    <section class="comparison-block"><h4>Услуги и роль в кейсе</h4><p>Услуги: ${esc(a.services||'Нужно уточнить')}.</p><p>${p?'В выбранной работе: '+esc(role(p)): 'Роль в кейсе: нужно уточнить после выбора проекта.'}</p>${p?.source?`<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Источник о работе ↗</a>`:''}</section>
    <section class="comparison-block"><h4>Бюджет</h4><p>${esc(a.budgetConditions||'Нужно уточнить')}</p></section></details>
    
    <div class="comparison-actions"><a class="secondary-action" href="/agency/${a.slug}?from=%2Fmy-project%23project-comparison">Открыть профиль ↗</a><button data-remove-agency="${a.slug}" aria-label="Убрать ${esc(a.name)} из проекта">Убрать</button></div>
   </article>`;
  }).join(''):`<div class="project-empty"><h3>Команды можно выбрать позже.</h3><p>Добавьте до трёх агентств для сравнения.</p><a class="primary-action" href="/catalog">Добавить агентство ↗</a></div>`;
  host.querySelectorAll('[data-agency-details]').forEach(details=>details.addEventListener('toggle',()=>{if(details.open)expandedAgencies.add(details.dataset.agencyDetails);else expandedAgencies.delete(details.dataset.agencyDetails);rememberProjectView();}));
  renderComparison(data,entries);
  document.getElementById('project-review').innerHTML=reviewMarkup(draft,data,briefRows(b));
  document.getElementById('project-storage-note').hidden=available;
  const result=document.getElementById('project-request-result');
  const accepted=inquiries.accepted(draft),receipt=lastReceipt||accepted;
  if(accepted){wishesUndo?.clear();replacementUndo?.clear();}
  result.hidden=!receipt&&(!draft.request||!available);
  if(receipt)result.innerHTML=receiptMarkup(receipt,briefRows(receipt.brief));
  else if(draft.request&&available)result.innerHTML='<strong>Задача сохранена в этом браузере</strong><p>Можно продолжить редактирование.</p><div class="draft-result-actions"><button class="secondary-action" data-return-project>Вернуться к моему проекту</button><button class="secondary-action" data-download-brief>Скачать черновик</button></div>';
  if(!result.hidden&&focusRequest){result.scrollIntoView({block:'start'});result.focus({preventScroll:true});focusRequest=false;}
  const submit=document.querySelector('[data-submit-project]');
  submit.textContent=sending?'Сохраняем заявку…':accepted?'Заявка принята ✓':'Передать задачу EventAgencies';
  submit.disabled=sending||Boolean(accepted);submit.setAttribute('aria-busy',String(sending));
  const save=document.querySelector('[data-save-draft]');
  save.textContent=draft.request&&available?'Черновик сохранён ✓':'Сохранить черновик';
  save.disabled=sending||savingDraft||Boolean(draft.request&&available);
  const error=document.getElementById('project-send-error');error.textContent=sendError;error.hidden=!sendError;
 }catch{host.innerHTML='<div class="project-empty"><h3>Не удалось загрузить команды.</h3><p>Обновите страницу, чтобы повторить загрузку. Описание мероприятия можно заполнить сейчас.</p></div>';}
}
async function sendInquiry(){
 if(sending||inquiries.accepted(draft))return;
 const invalid=contactError(draft.contact);
 if(invalid){document.getElementById('contact-save-status').textContent=invalid.message;const field=contactForm.elements.namedItem(invalid.field);field?.setAttribute('aria-invalid','true');field?.setAttribute('aria-describedby','contact-save-status contact-purpose');field?.focus();return;}
 if(!validPayload(submissionPayload(draft))){openBrief();document.getElementById('brief-save-status').textContent='Проверьте количество гостей и бюджет: укажите целые неотрицательные числа, гостей — не меньше одного.';return;}
 sending=true;sendError='';const snapshot=submissionPayload(draft);refresh();
 try{lastReceipt=await inquiries.send(snapshot);focusRequest=true;document.dispatchEvent(new Event('ea:inquiry-accepted'));}
 catch(error){sendError=error.message==='retry_storage_unavailable'?'Не удалось отправить. Разрешите сохранение данных этого сайта и попробуйте ещё раз.':'Не удалось отправить. Попробуйте ещё раз';}
 finally{sending=false;await renderProject();if(sendError){const node=document.getElementById('project-send-error');node.focus();}}
}
function fillBrief(form){
 for(const [key,value]of Object.entries(draft.brief)){const field=form.elements.namedItem(key);if(field){if(field.type==='checkbox')field.checked=value;else field.value=value;}}
 syncUnknown(form);updateBriefDescriptionCount(form);
}
function openBrief(field){
 const dialog=document.getElementById('brief-dialog');if(!dialog){location.assign('/my-project?edit=1');return;}
 const form=dialog.querySelector('form');fillBrief(form);dialog.showModal();
 if(field){const target=form.elements.namedItem(field);(target?.disabled?form.elements.namedItem(field==='date'?'dateUnknown':'budgetHelp'):target)?.focus();}
}
function focusContact(){
 const form=document.getElementById('project-contact-form');if(!form)return;
 const fields=['name','value'].map(name=>form.elements.namedItem(name));
 const field=fields.find(node=>!node.value.trim())||fields[0];
 document.getElementById('project-contact')?.scrollIntoView({block:'start'});field?.focus({preventScroll:true});
}
function setHelpSelection(expanded){
 if(!helpMode)return;
 helpSelectionExpanded=expanded;
 const content=document.getElementById('project-selection-content'),button=document.querySelector('[data-toggle-help-selection]');
 if(content)content.hidden=!expanded;
 if(button){button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'Свернуть подборку':'Посмотреть подборку (необязательно)';}
}
let wishesDialog=null,wishesTrigger=null,wishesBase='',wishesWorks=[],wishesGenerated='',wishesSkipped=0,wishesUnavailable=0,wishesOpening=false;
function syncWishesOptions(){
 const changed=wishesDialog.querySelector('#wishes-addition').value!==wishesGenerated,hasNotes=wishesWorks.some(item=>item.note.trim());
 wishesDialog.querySelector('[data-wishes-notes]').disabled=changed||!hasNotes;
 wishesDialog.querySelector('[data-reset-wishes-text]').hidden=!changed;
 wishesDialog.querySelector('[data-wishes-options-help]').textContent=changed?'Вы изменили текст. Чтобы переключить заметки, сначала нажмите «Сбросить правки».':hasNotes?(wishesTrigger?.hasAttribute('data-add-wishes-selection')?'Можно включить все личные заметки к выбранным примерам, в том числе записи для разных команд. Текст будет показан перед добавлением.':'Включите заметку, если хотите передать её вместе с примером.'):'У выбранных примеров пока нет личных заметок.';
}
function regenerateWishes(){
 const includeNotes=wishesDialog.querySelector('[data-wishes-notes]').checked;
 const fragments=wishesWorks.map(item=>wishesAddition(item.work,includeNotes?item.note:'',location.origin)),fresh=fragments.filter(fragment=>!draft.brief.description.includes(fragment));
 wishesSkipped=fragments.length-fresh.length;wishesGenerated=fresh.join('\n\n');wishesDialog.querySelector('#wishes-addition').value=wishesGenerated;
 const noteCount=wishesWorks.reduce((total,item)=>total+item.noteCount,0);
 wishesDialog.querySelector('[data-wishes-source-count]').textContent='Примеров: '+wishesWorks.length+' · Личных заметок: '+noteCount+(wishesSkipped?' · Уже есть в пожеланиях: '+wishesSkipped:'')+(wishesUnavailable?' · Недоступно в каталоге: '+wishesUnavailable:'');
 syncWishesOptions();updateWishesPreview();
}
function updateWishesPreview(message=''){
 const addition=wishesDialog.querySelector('#wishes-addition').value;
 wishesBase=draft.brief.description;
 const merged=mergeWishes(wishesBase,addition);
 wishesDialog.querySelector('#wishes-preview').value=merged.text;
 wishesDialog.querySelector('[data-confirm-wishes]').disabled=merged.result!=='added';
 const messages={empty:wishesSkipped===wishesWorks.length?'Выбранный текст примеров уже есть в пожеланиях.':'Добавьте текст примера или заметки.',duplicate:'Этот текст уже есть в пожеланиях.', 'too-long':'В пожеланиях получится '+merged.text.length+' символов. Максимум — 3000; сократите добавляемый текст или выберите меньше примеров.'};
 wishesDialog.querySelector('[data-wishes-status]').textContent=messages[merged.result]||message||'В пожеланиях будет '+merged.text.length+' из 3000 символов. Проверьте текст перед добавлением.';
 return merged;
}
async function openWishes(trigger){
 if(wishesOpening||wishesDialog?.open)return;wishesOpening=true;
 try{
  const data=await getData(),agencySlug=trigger.dataset.addWishesAgency,batch=trigger.hasAttribute('data-add-wishes-selection');
  const slugs=batch?normalizeReferences(JSON.parse(trigger.dataset.addWishesSelection)):[trigger.dataset.addWishesWork];
  wishesWorks=slugs.flatMap(slug=>{
   const work=data.projects.find(p=>p.slug===slug&&(batch||p.agencySlug===agencySlug||p.agencySlugs?.includes(agencySlug)));if(!work)return [];
   if(!batch){const note=draft.workNotes[workNoteKey(agencySlug,work.slug)]||'';return [{work,note,noteCount:note.trim()?1:0}];}
   const entries=referenceNotesForWork(work,draft.workNotes,data.agencies).filter(entry=>entry.note.trim());
   const note=entries.length===1&&entries[0].isPrimary?entries[0].note:entries.map(entry=>'Моя заметка для «'+entry.agencyName+'»: '+entry.note).join('\n\n');
   return [{work,note,noteCount:entries.length}];
  });
  wishesUnavailable=slugs.length-wishesWorks.length;
  if(!wishesWorks.length){notice('Примеры сейчас недоступны','Откройте сохранённые примеры и выберите работы заново.');return;}
  if(!wishesDialog){
   wishesDialog=document.createElement('dialog');wishesDialog.id='wishes-dialog';wishesDialog.setAttribute('aria-labelledby','wishes-title');
   wishesDialog.innerHTML=`<button class="brief-close" type="button" data-cancel-wishes aria-label="Закрыть добавление в пожелания">×</button><h2 id="wishes-title">Добавить в пожелания?</h2><p>Этот текст войдёт в описание заявки после вашего подтверждения. Личные заметки и сохранённые примеры останутся на месте. Сейчас ничего не отправляется.</p><p class="wishes-source-count" data-wishes-source-count></p><label class="wishes-notes-choice"><input type="checkbox" data-wishes-notes> Включить личные заметки</label><p class="wishes-options-help" data-wishes-options-help></p><button class="wishes-reset-text" type="button" data-reset-wishes-text hidden>Сбросить правки</button><label for="wishes-addition">Текст, который добавится</label><textarea id="wishes-addition" rows="5" aria-describedby="wishes-status"></textarea><label for="wishes-preview">Пожелания после добавления</label><textarea id="wishes-preview" rows="7" readonly></textarea><p id="wishes-status" data-wishes-status role="status"></p><div class="draft-result-actions"><button type="button" class="primary-action" data-confirm-wishes>Добавить в пожелания</button><button type="button" class="secondary-action" data-cancel-wishes>Отмена</button></div>`;
   document.body.append(wishesDialog);
   wishesDialog.querySelector('#wishes-addition').addEventListener('input',()=>{syncWishesOptions();updateWishesPreview();});
   wishesDialog.querySelector('[data-wishes-notes]').addEventListener('change',regenerateWishes);
   wishesDialog.querySelector('[data-reset-wishes-text]').addEventListener('click',()=>{regenerateWishes();wishesDialog.querySelector('#wishes-addition').focus({preventScroll:true});});
   wishesDialog.querySelectorAll('[data-cancel-wishes]').forEach(button=>button.addEventListener('click',()=>wishesDialog.close()));
   wishesDialog.addEventListener('close',()=>{
    const replacement=wishesTrigger?.hasAttribute('data-add-wishes-selection')?document.querySelector('.reference-batch-open'):wishesTrigger&&document.querySelector(`[data-add-wishes-work="${wishesTrigger.dataset.addWishesWork}"][data-add-wishes-agency="${wishesTrigger.dataset.addWishesAgency}"]`);
    (wishesTrigger?.isConnected?wishesTrigger:replacement)?.focus({preventScroll:true});
   });
   wishesDialog.querySelector('[data-confirm-wishes]').addEventListener('click',async()=>{
    if(wishesBase!==draft.brief.description){if(wishesDialog.querySelector('#wishes-addition').value===wishesGenerated)regenerateWishes();updateWishesPreview('Пожелания изменились. Проверьте обновлённый предпросмотр и подтвердите добавление ещё раз.');return;}
    const merged=updateWishesPreview();if(merged.result!=='added')return;const previousDescription=draft.brief.description;
    try{draft=writeDraft(localStorage,updateBrief(draft,{description:merged.text}));available=true;lastReceipt=null;sendError='';}
    catch{available=false;document.getElementById('project-storage-note')?.removeAttribute('hidden');wishesDialog.querySelector('[data-wishes-status]').textContent='Не удалось сохранить пожелания. Разрешите хранение данных сайта и попробуйте снова.';return;}
    wishesUndo?.record(previousDescription,merged.text);await renderProject();wishesDialog.close();
    const status=document.getElementById('project-wishes-status');if(status){if(!wishesUndo)status.textContent='Пожелания дополнены. Заявка ещё не отправлена.';status.focus({preventScroll:true});}
   });
  }
  wishesTrigger=trigger;
  wishesDialog.querySelector('[data-wishes-notes]').checked=!batch&&wishesWorks.some(item=>item.note.trim());
  regenerateWishes();wishesDialog.showModal();wishesDialog.querySelector('#wishes-addition').focus();
 }catch{notice('Не удалось подготовить пожелание','Описание и личные заметки не изменены. Попробуйте ещё раз.');}
 finally{wishesOpening=false;}
}
function syncUnknown(form){form.elements.budget.disabled=form.elements.budgetHelp.checked;form.elements.date.disabled=form.elements.dateUnknown.checked;}
function updateBriefDescriptionCount(form){
 const count=document.getElementById('brief-description-count');if(!count)return;
 const length=form.elements.description.value.length,limit=form.elements.description.maxLength;
 count.textContent=length.toLocaleString('ru-RU')+' / '+limit.toLocaleString('ru-RU');
 count.classList.toggle('is-full',length>=limit);count.setAttribute('aria-label','Пожелания: '+length+' из '+limit+' символов');
}
const briefForm=document.getElementById('event-brief-form');
if(briefForm){
 const saveForm=()=>{
  syncUnknown(briefForm);updateBriefDescriptionCount(briefForm);
  const values={};for(const key of Object.keys(emptyDraft().brief)){const field=briefForm.elements.namedItem(key);values[key]=field.type==='checkbox'?field.checked:field.value;}
  const saved=persist(updateBrief(draft,values),{quiet:true});
  document.getElementById('brief-save-status').textContent=saved?'Изменения сохранены в этом браузере.':'Не удалось сохранить. Разрешите хранение данных сайта и попробуйте снова.';
  return saved;
 };
 briefForm.addEventListener('input',saveForm);briefForm.addEventListener('change',saveForm);
 briefForm.addEventListener('submit',event=>{event.preventDefault();if(saveForm()){document.getElementById('brief-dialog').close();if(helpMode)focusContact();}});
 document.querySelector('[data-close-brief]').addEventListener('click',()=>{if(saveForm())document.getElementById('brief-dialog').close();});
 if(new URLSearchParams(location.search).get('edit')==='1')openBrief();
}
const contactForm=document.getElementById('project-contact-form');
const contactFields={
 email:{type:'email',autocomplete:'email',placeholder:'name@example.com'},
 phone:{type:'tel',autocomplete:'tel',placeholder:'+7 900 000-00-00'},
 telegram:{type:'text',autocomplete:'off',placeholder:'@username или ссылка на профиль'}
};
function syncContact(){
 const method=contactForm.elements.method.value,config=contactFields[method],field=contactForm.elements.value;
 document.getElementById('contact-value-label').textContent=contactMethods[method];
 field.type=config.type;field.autocomplete=config.autocomplete;field.placeholder=config.placeholder;
}
function fillContact(){
 for(const [key,value]of Object.entries(draft.contact))contactForm.elements.namedItem(key).value=value;
 syncContact();
}
if(contactForm){
 fillContact();
 const saveContact=()=>{
  contactForm.querySelectorAll('[aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
  syncContact();
  const values={name:contactForm.elements.name.value,method:contactForm.elements.method.value,value:contactForm.elements.value.value};
  const saved=persist(updateContact(draft,values),{quiet:true});
  document.getElementById('contact-save-status').textContent=saved?'Контакт сохранён в этом браузере.':'Не удалось сохранить контакт. Он остаётся на этой странице; разрешите хранение данных сайта и попробуйте снова.';
 };
 contactForm.addEventListener('input',saveContact);contactForm.addEventListener('change',saveContact);
 contactForm.addEventListener('submit',event=>{event.preventDefault();saveContact();});
}
refresh();

if(briefForm&&helpMode){
 document.querySelector('.project-intro h1').textContent='Поможем подобрать агентство';
 const aside=document.querySelector('.project-intro-note');aside.querySelector('span').textContent='Задача → контакт → уточнение';aside.querySelector('p').textContent='Расскажите о событии и оставьте контакт. Выбор команд можно обсудить с нами.';
 const next=document.querySelector('.project-intro-actions a');next.href='#project-contact';next.textContent='Оставить контакт';next.setAttribute('data-go-to-contact','');
 const asideLink=aside.querySelector('a');asideLink.href='#project-contact';asideLink.textContent='Оставить контакт ↗';asideLink.setAttribute('data-go-to-contact','');
 document.querySelector('#project-comparison .project-section-heading>a').hidden=true;
 document.querySelector('#project-comparison .comparison-guide').textContent='Выбирать команды сейчас необязательно. Уже выбранные агентства и работы сохранены.';
 document.querySelector('[data-toggle-help-selection]').hidden=false;setHelpSelection(false);
 briefForm.querySelector('[type="submit"]').textContent='Сохранить и перейти к контакту';
 openBrief();document.getElementById('brief-note').textContent='Опишите задачу. Выбирать агентства заранее не нужно.';
}

// Clear and undo use the latest saved project and require the displayed note to match.
document.addEventListener('ea:reference-note-edit',event=>{
 const field=event.target.closest?.('.reference-note-entry textarea[data-work-note]'),change=event.detail;
 if(!field||!change||typeof change!=='object')return;
 change.result={ok:false,code:'invalid'};
 const agencySlug=field.dataset.workNote,workSlug=field.dataset.noteWork,slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
 if(!slug.test(agencySlug||'')||!slug.test(workSlug||'')||typeof change.expected!=='string'||typeof change.value!=='string'||change.value.length>1000)return;
 if(!available){change.result={ok:false,code:'unsaved'};return;}
 const status=field.closest('.work-note-block').querySelector('[role="status"]'),key=workNoteKey(agencySlug,workSlug);
 const syncFields=value=>document.querySelectorAll('[data-work-note]').forEach(other=>{if(other.dataset.workNote===agencySlug&&other.dataset.noteWork===workSlug&&other.value!==value)other.value=value;});
 try{
  const current=readDraft(localStorage),currentText=current.workNotes[key]||'';
  if(currentText!==change.expected){
   draft=current;syncFields(currentText);if(status)status.textContent='Показан актуальный текст заметки.';
   change.result={ok:false,code:'changed'};
  }else{
   draft=writeDraft(localStorage,updateWorkNote(current,agencySlug,workSlug,change.value));available=true;
   syncFields(change.value);if(status)status.textContent='Сохранено · '+change.value.length+' / 1000';
   change.result={ok:true};
  }
 }catch{
  available=false;if(status)status.textContent='Не удалось сохранить. Текст заметки не изменён. Разрешите хранение данных и повторите действие.';
  change.result={ok:false,code:'storage_error'};
 }
 const storageNote=document.getElementById('project-storage-note');if(storageNote)storageNote.hidden=available;
 if(change.result.ok||change.result.code==='changed')field.dispatchEvent(new CustomEvent('ea:work-note-updated',{bubbles:true,detail:{agencySlug,workSlug}}));
});
document.addEventListener('input',event=>{
 const field=event.target.closest('[data-work-note]');if(!field)return;
 const next=updateWorkNote(draft,field.dataset.workNote,field.dataset.noteWork,field.value);
 const status=field.closest('.work-note-block').querySelector('[role="status"]');
 try{draft=writeDraft(localStorage,next);available=true;status.textContent='Сохранено · '+field.value.length+' / 1000';}
 catch{draft=next;available=false;status.textContent='Не удалось сохранить. Не закрывайте страницу: разрешите хранение данных и повторите ввод.';}
 document.getElementById('project-storage-note').hidden=available;
 document.querySelectorAll('[data-work-note]').forEach(other=>{if(other!==field&&other.dataset.workNote===field.dataset.workNote&&other.dataset.noteWork===field.dataset.noteWork)other.value=field.value;});
 syncComparisonNote(field);
});
function syncComparisonNote(field){
 if(!field?.matches?.('textarea[data-work-note]'))return;
 document.querySelectorAll('#comparison-table [data-comparison-note-text]').forEach(node=>{
  if(node.dataset.comparisonNoteText!==field.dataset.workNote||node.dataset.noteWork!==field.dataset.noteWork)return;
  node.textContent=field.value||'Пока нет заметки';
  const button=node.parentElement.querySelector('[data-edit-comparison-note]');if(button)button.textContent=field.value.trim()?'Изменить заметку…':'Добавить заметку…';
 });
 syncComparisonCriteria(document.getElementById('comparison-table'));
}
document.addEventListener('ea:work-note-updated',event=>syncComparisonNote(event.target));
function renderComparison(data,entries){
 const host=document.getElementById('comparison-table');if(!host)return;
 const enough=entries.length>=2;
 if(!enough)comparisonView='cards';
 const tableMode=comparisonView==='table';
 document.getElementById('project-board').hidden=tableMode;
 host.hidden=!tableMode;
 document.querySelectorAll('[data-comparison-view]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.comparisonView===comparisonView));if(button.dataset.comparisonView==='table')button.disabled=!enough;});
 document.getElementById('comparison-hint').textContent=enough?'Расставьте команды по своему приоритету стрелками ↑ ↓':'Добавьте хотя бы два агентства для сравнения';
 if(!tableMode)return;
 const picks=entries.map(s=>({s,a:data.agencies.find(a=>a.slug===s.agencySlug),p:selectedWork(data,s)}));
 const missingWork=({s})=>s.workSlug?'Выбранная работа недоступна в каталоге':'Работа не выбрана';
 // One criterion model and one table serve both layouts. Stable identifiers
 // also keep each value associated with its team when rows stack on mobile.
 const rows=[
 {id:'work',label:'Выбранная работа',render:pick=>(pick.p?`<a href="/work/${pick.p.slug}?from=%2Fmy-project%23project-comparison" aria-label="Открыть работу «${esc(pick.p.fullTitle)}» · ${esc(pick.a.name)}">${esc(pick.p.fullTitle)} ↗</a><p>${esc(facts(pick.p))}</p>`:missingWork(pick))+`<div class="comparison-cell-actions"><button type="button" data-open-work-picker="${pick.a.slug}" aria-label="Выбрать работу для сравнения · ${esc(pick.a.name)}">${pick.p?'Сменить работу…':'Выбрать работу…'}</button></div>`},
 {id:'note',label:'Моя заметка',render:({s,a,p})=>{
  if(!p)return s.workSlug?'Выбранная работа недоступна. Выберите другую работу, чтобы редактировать заметку.':'Выберите работу, чтобы добавить личную заметку.';
  const note=draft.workNotes[workNoteKey(s.agencySlug,p.slug)]||'';
  return `<div class="comparison-note-text" data-comparison-note-text="${a.slug}" data-note-work="${p.slug}">${esc(note||'Пока нет заметки')}</div><div class="comparison-cell-actions"><button type="button" data-edit-comparison-note="${a.slug}" data-note-work="${p.slug}" aria-label="Открыть личную заметку к работе «${esc(p.fullTitle)}» · ${esc(a.name)}">${note.trim()?'Изменить заметку…':'Добавить заметку…'}</button></div>`;
 }},
 {id:'specialization',label:'Специализация',render:({a})=>esc(a.types.map(t=>data.types[t]).filter(Boolean).join(', ')||'Нужно уточнить')},
 {id:'city',label:'Город команды',render:({a})=>esc(a.city||'Нужно уточнить')},
 {id:'geography',label:'География работы',render:({a})=>esc(a.geography||'Нужно уточнить')},
 {id:'services',label:'Услуги',render:({a})=>esc(a.services||'Нужно уточнить')},
 {id:'role',label:'Роль в выбранной работе',render:pick=>esc(pick.p?role(pick.p):missingWork(pick))},
 {id:'budget',label:'Опубликованные условия по бюджету',render:({a})=>esc(a.budgetConditions||'Нужно уточнить')},
 {id:'event-terms',label:'Дата и стоимость вашего события',render:()=> 'Нужно обсудить с командой'},
 {id:'sources',label:'Источники',render:({a,p})=>`${p?.source?`<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer" aria-label="Источник выбранной работы · ${esc(a.name)} (новая вкладка)">Источник кейса ↗</a><br>`:''}<a href="/agency/${a.slug}?from=%2Fmy-project%23project-comparison" aria-label="Открыть профиль агентства ${esc(a.name)}">Профиль агентства ↗</a>`}
 ];
 for(const row of rows)row.equal=()=>comparisonValuesMatch(row.id,picks,{types:data.types,notes:draft.workNotes});
 const criteria=setupComparisonCriteria(host,rows);
 criteria.content.innerHTML=`<p class="comparison-scroll-hint" id="comparison-format-hint">В каждом критерии команды идут в порядке вашего приоритета.</p><div class="comparison-scroll" role="region" aria-label="Сравнение выбранных агентств" tabindex="0"><table class="agency-compare-table" role="table" aria-labelledby="comparison-caption" aria-describedby="comparison-format-hint"><caption id="comparison-caption">Сравнение ${entries.length} агентств</caption><thead role="rowgroup"><tr role="row"><th class="comparison-criterion-column" scope="col" role="columnheader">Критерий</th>${picks.map(({a,p},index)=>`<th scope="col" role="columnheader" id="comparison-team-${a.slug}" aria-label="Приоритет ${index+1}: ${esc(a.name)}">${agencyPriority(a,index,entries.length)}<a class="comparison-team-name" href="/agency/${a.slug}?from=%2Fmy-project%23project-comparison" aria-label="Открыть профиль агентства ${esc(a.name)}">${esc(a.name)} ↗</a><button type="button" data-remove-agency="${a.slug}" data-agency-name="${esc(a.name)}" aria-label="Убрать ${esc(a.name)} из сравнения">Убрать</button>${p?.source?`<a class="comparison-team-source" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer" aria-label="Источник выбранной работы · ${esc(a.name)} (новая вкладка)">Источник работы ↗</a>`:''}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.map(({id,label,render})=>`<tr role="row" data-comparison-criterion="${id}"><th scope="row" role="rowheader" id="comparison-criterion-${id}">${label}</th>${picks.map((pick,index)=>`<td role="cell" headers="comparison-team-${pick.a.slug} comparison-criterion-${id}" data-comparison-agency="${pick.a.slug}"><span class="comparison-cell-team" aria-hidden="true"><span>${String(index+1).padStart(2,'0')}</span><strong>${esc(pick.a.name)}</strong></span><div class="comparison-cell-value">${render(pick)}</div></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="comparison-guide">Работу и личную заметку можно изменить прямо в сравнении. Заметки автоматически не входят в пожелания и заявку. Условия нового мероприятия уточняются индивидуально.</p>`;
 criteria.apply();
}

setupSelectionShare({getState:()=>draft,getData});
const projectExporter=setupProjectExport({getState:()=>draft,getData,briefRows,workRole:role});
wishesUndo=setupWishesUndo({getDescription:()=>draft.brief.description,canUndo:()=>!sending,restore:description=>{
 try{draft=writeDraft(localStorage,updateBrief(draft,{description}));available=true;lastReceipt=null;sendError='';if(briefForm&&document.getElementById('brief-dialog').open)fillBrief(briefForm);refresh();return true;}
 catch{available=false;document.getElementById('project-storage-note')?.removeAttribute('hidden');return false;}
}});
replacementUndo=setupReplacementUndo({getSelection:()=>draft.selection,canUndo:()=>!sending,restore:(selection,expected)=>{
 if(!available)return 'failed';
 try{
  const current=readDraft(localStorage);
  if(JSON.stringify(current.selection)!==JSON.stringify(expected)){draft=current;refresh();return 'changed';}
  draft=writeDraft(localStorage,{...current,selection,request:null});available=true;lastReceipt=null;sendError='';refresh();return 'saved';
 }catch{available=false;document.getElementById('project-storage-note')?.removeAttribute('hidden');return 'failed';}
},onResult:(result,name)=>{
 if(result==='saved'){
  const message='Вернули «'+name+'» в подборку. Пожелания и личные заметки сохранены.';
  if(document.getElementById('project-board')){pop.hidden=true;orderStatus.textContent=message;document.getElementById('project-comparison')?.focus({preventScroll:true});}
  else notice('Замена отменена',message);
 }else if(result==='changed')notice('Подборка уже изменилась','Новый выбор сохранён. Прежнюю замену больше нельзя отменить.');
 else notice('Не удалось отменить замену','Разрешите хранение данных сайта, сохраните текущие изменения и повторите попытку.',{undoReplacement:true});
}});
if(inquiries.accepted(draft))replacementUndo.clear();
setupProjectNoteEditor({getData,canEdit:()=>available&&!sending,onError:message=>notice('Личная заметка',message),onSaved:async(next,{agencySlug,workSlug,value})=>{
 // A private note preserves request/receipt state and all other freshly read fields.
 draft=next;available=true;
 document.getElementById('project-storage-note')?.setAttribute('hidden','');
 const fields=[...document.querySelectorAll('textarea[data-work-note]')].filter(field=>field.dataset.workNote===agencySlug&&field.dataset.noteWork===workSlug);
 for(const field of fields){
  field.value=value;
  const status=field.closest('.work-note-block')?.querySelector('[role="status"]');if(status)status.textContent='Сохранено · '+value.length+' / 1000';
 }
 // Existing listeners update saved examples, note counters and clear/undo for this key.
 fields[0]?.dispatchEvent(new CustomEvent('ea:work-note-updated',{bubbles:true,detail:{agencySlug,workSlug,reapplyReferenceFilters:true}}));
 await renderProject();
 orderStatus.textContent='Личная заметка сохранена. Пожелания и заявка не изменены.';
}});
setupProjectWorkPicker({getState:()=>draft,getData,canChoose:()=>!sending,onError:message=>notice('Выбор работы',message),onChoose:async({agencySlug,workSlug,expectedWorkSlug})=>{
 if(!available||sending)return 'failed';
 try{
  const current=readDraft(localStorage),entry=current.selection.find(item=>item.agencySlug===agencySlug);
  if(!entry||entry.workSlug!==expectedWorkSlug){draft=current;refresh();await renderProject();return 'changed';}
  draft=writeDraft(localStorage,{...current,selection:current.selection.map(item=>item.agencySlug===agencySlug?{...item,workSlug}:item),request:null});
  available=true;lastReceipt=null;sendError='';refresh();await renderProject();
  orderStatus.textContent=workSlug?'Работа для сравнения обновлена. Личные заметки к другим работам сохранены.':'Агентство осталось в сравнении без выбранной работы. Личные заметки сохранены.';
  return 'saved';
 }catch{available=false;document.getElementById('project-storage-note')?.removeAttribute('hidden');return 'failed';}
}});
const accountCopies=setupAccountProjectCopies({getState:()=>draft,getData,briefRows,formatName,canRestore:()=>!sending,onExportCopy:projectExporter?.openSavedCopy});
setupProjectHistory({briefRows,formatName,onReuse:accountCopies?.openReceiptProject});
document.addEventListener('ea:project-copy-restored',()=>{
 draft=readDraft(localStorage);available=true;removedAgency=null;lastReceipt=null;sendError='';focusRequest=false;orderStatus.textContent='';
 document.getElementById('project-undo').hidden=true;
 if(contactForm)fillContact();refresh();
});
setupProjectSections();

document.addEventListener('change',async event=>{
 const field=event.target.closest('[data-selected-work]');if(!field)return;
 const agencySlug=field.dataset.selectedWork,workSlug=field.value||null;
 const data=await getData();
 if(workSlug&&!data.projects.some(p=>p.slug===workSlug&&(p.agencySlug===agencySlug||p.agencySlugs?.includes(agencySlug))))return;
 persist({...draft,selection:draft.selection.map(s=>s.agencySlug===agencySlug?{...s,workSlug}:s),request:null});
 await renderProject();document.getElementById('work-choice-'+agencySlug)?.focus({preventScroll:true});
});
