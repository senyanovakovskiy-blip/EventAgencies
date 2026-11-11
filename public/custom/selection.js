import './admin-entry.js';
import {setupSelectionShare} from './share-selection.js';
import {setupProjectSections} from './project-sections.js';
import {setupBriefSummary} from './project-brief.js';
import {setupBriefSessionUndo} from './brief-session-undo.js';
import {setupBriefEditor} from './brief-editor.js';
import {setupContactPresentation} from './contact-presentation.js';
import {setupContactEditor} from './contact-editor.js';
import {setupProjectExport} from './project-export.js';
import {setupProjectHistory} from './project-history.js';
import {setupAccountProjectCopies} from './account-project-copies.js';
import {normalizeReferences} from './reference-store.js';
import {referenceNotesForWork} from './reference-note-model.js';
import {setupWishesUndo} from './wishes-undo.js';
import {setupReplacementUndo} from './replacement-undo.js';
import {setupProjectWorkPicker} from './project-work-picker.js';
import {setupProjectNoteEditor} from './project-note-editor.js';
import {setupProjectQuestionAnswer} from './project-question-answer.js';
import {referenceProjectMarker} from './reference-batch-session.js';
import {setupComparisonCriteria,syncComparisonCriteria} from './project-comparison-criteria.js';
import {comparisonValuesMatch} from './project-comparison-equality.js';
import {selectionView,selectionProblems} from './project-selection-view.js';
import {projectPresentation} from './project-presentation.js';
import {KEY,workNoteKey,updateWorkNote,occasions,contactMethods,emptyDraft,normalizeDraft,readDraft,writeDraft,addAgency,replaceAgency,removeAgency,restoreAgency,moveAgency,updateBrief,submitLocal} from './project-store.js';
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
let draft=emptyDraft(),available=true,dataPromise,focusRequest=false,pendingReplacement=null,savingDraft=false,sending=false,sendingRecovery=false,sendError='',selectionSendError=false,lastReceipt=null,wishesUndo=null,replacementUndo=null,briefUndo=null,briefEditor=null,contactEditor=null,handoffData=null;
const inquiries=createInquiryClient({storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)}});
try{draft=readDraft(localStorage);}catch{available=false;}
const getData=()=>dataPromise||(dataPromise=(async()=>{
 const embedded=document.getElementById('project-reference-data');
 if(embedded)return JSON.parse(embedded.textContent);
 const response=await fetch('/custom/catalog-data.json');if(!response.ok)throw Error('data');return response.json();
})().catch(error=>{dataPromise=null;throw error;}));
function persist(next,{quiet=false}={}){
 if(editingBlocked())return false;
 orderStatus.textContent='';
 lastReceipt=null;sendError='';
 try{draft=writeDraft(localStorage,next);available=true;refresh();return true;}
 catch{draft=normalizeDraft({...next,request:null});available=false;refresh();document.getElementById('project-storage-note')?.removeAttribute('hidden');if(!quiet)notice('Не удалось сохранить изменения','В браузере недоступно сохранение. Разрешите хранение данных сайта и попробуйте ещё раз.');return false;}
}
const pop=document.createElement('aside');pop.className='ea-selection-notice';pop.hidden=true;pop.setAttribute('aria-label','Ваша подборка');document.body.append(pop);
let noticeNote=null;
const noteActionLabel=value=>value.trim()?'Открыть мою заметку…':'Записать, что понравилось…';
function savedNoteContext(pair){
 if(!available||!pair?.workSlug)return null;
 try{
  const marker=referenceProjectMarker(),current=readDraft(localStorage);
  if(marker===null||!current.selection.some(item=>item.agencySlug===pair.agencySlug&&item.workSlug===pair.workSlug))return null;
  return {agencySlug:pair.agencySlug,workSlug:pair.workSlug,marker,value:current.workNotes[workNoteKey(pair.agencySlug,pair.workSlug)]||''};
 }catch{return null;}
}
function notice(title,copy,{undoReplacement=false,selectedPair=null}={}){
 const inProject=Boolean(document.getElementById('project-board')),context=savedNoteContext(selectedPair);
 noticeNote=null;
 pop.innerHTML=`<button class="ea-notice-close" type="button" aria-label="Закрыть уведомление">×</button><div role="status"><strong>${esc(title)}</strong><p>${esc(copy)}</p></div><div class="ea-notice-actions">${context?`<button type="button" data-edit-comparison-note="${esc(context.agencySlug)}" data-note-work="${esc(context.workSlug)}" data-note-project="${esc(context.marker)}">${noteActionLabel(context.value)}</button>`:''}${undoReplacement&&replacementUndo?.hasChange()?'<button type="button" data-undo-replacement>Отменить замену</button>':''}<button type="button" data-continue>Продолжить выбор</button><a href="${inProject?'#project-comparison':'/my-project'}"${inProject?' data-edit-selection':''}>${inProject?'К сравнению':'Мой проект'}${draft.selection.length?' · '+draft.selection.length:''} ↗</a></div>${context?'<p class="ea-notice-note-status" data-note-saved-status role="status" aria-live="polite" aria-atomic="true"></p>':''}`;
 if(context)noticeNote={...context,button:pop.querySelector('[data-edit-comparison-note]'),status:pop.querySelector('[data-note-saved-status]')};
 pop.hidden=false;replacementUndo?.sync();
}
function editingBlocked(){
 if(!sending)return false;
 notice('Заявка отправляется','Дождитесь результата отправки, затем измените проект.');
 return true;
}
function withReferenceNote(state,agencySlug,workSlug,note){return workSlug&&note?.trim()&&!Object.hasOwn(state.workNotes,workNoteKey(agencySlug,workSlug))?updateWorkNote(state,agencySlug,workSlug,note):state;}
const replacement=document.createElement('dialog');replacement.id='replacement-dialog';replacement.setAttribute('aria-labelledby','replacement-title');document.body.append(replacement);
replacement.addEventListener('close',()=>{pendingReplacement=null;});
async function offerReplacement(agencySlug,workSlug,note=''){
 try{
  const data=await getData();if(editingBlocked())return;
  const candidate=data.agencies.find(a=>a.slug===agencySlug);if(!candidate)return;
  pendingReplacement={agencySlug,workSlug,note,name:candidate.name};
  replacement.innerHTML=`<button class="brief-close" data-cancel-replacement aria-label="Закрыть замену агентства">×</button><span class="eyebrow">До трёх команд в одном проекте</span><h2 id="replacement-title">Кого заменить на ${esc(candidate.name)}?</h2><p>Описание мероприятия сохранится. Вместо выбранной ниже команды появится ${esc(candidate.name)}${workSlug?' с выбранной работой':''}. Последнюю замену можно будет отменить.</p><div class="replacement-options">${draft.selection.map(s=>{const {label}=selectionView(data,s);return `<button class="secondary-action" data-replace-agency="${esc(s.agencySlug)}" data-replace-name="${esc(label)}">Заменить ${esc(label)}</button>`;}).join('')}</div><button class="replacement-cancel" data-cancel-replacement>Оставить подборку</button>`;
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
  const copyRequestId=event.target.closest('[data-copy-request-id]');if(copyRequestId){
   event.preventDefault();const id=copyRequestId.dataset.copyRequestId||'',group=copyRequestId.parentElement,status=group?.querySelector('[data-request-copy-status]');if(!id||!status)return;
   let copied=false;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(id);copied=true;}}catch{}
   if(!copied){const temporary=document.createElement('textarea');temporary.value=id;temporary.setAttribute('readonly','');temporary.style.position='fixed';temporary.style.opacity='0';document.body.append(temporary);temporary.select();try{copied=document.execCommand('copy');}catch{}temporary.remove();}
   if(copied)status.textContent='Номер скопирован.';
   else{const value=group.querySelector('[data-request-id-value]');if(value){value.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(value);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);}status.textContent='Не удалось скопировать. Номер выделен — скопируйте его вручную.';}
   return;
  }
 if(sending&&event.target.closest('[data-move-agency],[data-save-agency],[data-replace-agency],[data-remove-agency],[data-undo-removal],[data-occasion],[data-save-draft],[data-add-wishes-work],[data-add-wishes-selection],[data-add-wishes-agency-prompt],[data-edit-brief],[data-review-work]')){event.preventDefault();editingBlocked();return;}
 if(event.target.closest('[data-toggle-help-selection]')){setHelpSelection(!helpSelectionExpanded);return;}
  const goToContact=event.target.closest('[data-go-to-contact]');if(goToContact){event.preventDefault();focusContact(goToContact.dataset.goToContact);return;}
 const wishes=event.target.closest('[data-add-wishes-work],[data-add-wishes-selection],[data-add-wishes-agency-prompt]');if(wishes){event.preventDefault();await openWishes(wishes);return;}
 const view=event.target.closest('[data-comparison-view]');if(view){comparisonView=view.dataset.comparisonView;rememberProjectView();renderProject();return;}
 const move=event.target.closest('[data-move-agency]');if(move){
  const agencySlug=move.dataset.moveAgency,direction=Number(move.dataset.moveDirection),next=moveAgency(draft,agencySlug,direction);
  if(next===draft)return;
  if(persist(next)){
   await renderProject();
   const index=draft.selection.findIndex(item=>item.agencySlug===agencySlug),data=await getData(),name=data.agencies.find(agency=>agency.slug===agencySlug)?.name||'Недоступная команда · '+agencySlug;
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
  notice(result.result==='updated'?'Выбранная работа обновлена':result.result==='existing'?'Агентство уже в вашем проекте':'Агентство добавлено в ваш проект',left===2?'Можно добавить ещё две команды для сравнения или перейти к описанию мероприятия.':left===1?'Можно добавить ещё одну команду для сравнения или перейти к описанию мероприятия.':'Три команды выбраны. Перейдите к сравнению и описанию мероприятия.',{selectedPair:{agencySlug:save.dataset.saveAgency,workSlug:save.dataset.saveWork}});return;
 }
 const replace=event.target.closest('[data-replace-agency]');
 if(replace&&pendingReplacement){
  const {agencySlug,workSlug,note,name:nextName}=pendingReplacement;
  const previousSelection=draft.selection.map(item=>({...item})),previousName=replace.dataset.replaceName||replace.dataset.replaceAgency;
  const next=replaceAgency(draft,replace.dataset.replaceAgency,agencySlug,workSlug);
  if(next.result==='replaced'&&persist(withReferenceNote(next.state,agencySlug,workSlug,note))){replacementUndo?.record(previousSelection,draft.selection,previousName,nextName);replacement.close();notice('Агентство заменено','В подборке по-прежнему три команды. Описание мероприятия сохранено.',{undoReplacement:true,selectedPair:{agencySlug,workSlug}});}
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
   if(undo){undo.hidden=false;document.getElementById('project-undo-status').textContent=name+' убрано из подборки. Можно вернуть вместе с сохранённым выбором работы.';undo.querySelector('button').focus();}
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
 const occasion=event.target.closest('[data-occasion]');if(occasion&&!draft.brief.format&&(Object.hasOwn(occasions,occasion.dataset.occasion)||occasion.dataset.occasion==='other'))persist(updateBrief(draft,{format:occasion.dataset.occasion}),{quiet:true});
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
 if(event.target.closest('[data-recover-project-inquiry]')){
  await sendInquiry({recover:true});return;
 }
 if(event.target.closest('[data-save-draft]')){
  if(savingDraft||(available&&draft.request))return;
  savingDraft=true;const button=document.querySelector('[data-save-draft]');button.disabled=true;
  try{const result=submitLocal(draft,'EA-LOCAL-'+Date.now().toString(36).toUpperCase(),new Date().toISOString());focusRequest=true;if(!persist(result.state))focusRequest=false;}
  finally{savingDraft=false;button.disabled=sending||Boolean(available&&draft.request);}
 }

});
addEventListener('storage',e=>{
 try{if(e.storageArea!==localStorage)return;}catch{return;}
 if(e.key===INQUIRY_KEY){refresh();return;}
 if(e.key!==KEY&&e.key!==null)return;
 if(contactEditor){
  if(e.key===null||e.newValue===null)contactEditor.invalidate();
  contactEditor.reconcile();
 }else try{draft=readDraft(localStorage);available=true;}catch{available=false;}
 refresh();
});
new MutationObserver(changes=>{if(changes.some(c=>c.type==='attributes'||[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-save-agency],[data-project-count]')||n.querySelector?.('[data-save-agency],[data-project-count]')))))refresh();}).observe(document.getElementById('root')||document.getElementById('content'),{childList:true,subtree:true,attributes:true,attributeFilter:['data-save-agency','data-save-work']});
for(const type of ['wheel','pointerdown','touchstart'])document.addEventListener(type,event=>{if(matchMedia('(max-width:900px)').matches&&event.target.closest('.home.is-landing .ws:not(.ea-photo-reel)'))event.stopPropagation();},{capture:true,passive:true});
function formatName(value){return occasions[value]||(value==='other'?'Другой формат':'Нужно уточнить');}
const catalogOccasionByBriefFormat={corporate:'corporate',conference:'conference',presentation:'presentation',teambuilding:'teambuilding',private:'private',wedding:'private',birthday:'private',product_launch:'presentation',opening:'public',new_year:'corporate',exhibition:'business',sports_day:'sport'};
function syncCatalogFormatLink(brief){
 const link=document.querySelector('[data-project-format-catalog-link]');if(!link)return;
 const query=new URLSearchParams({view:'projects'}),occasion=catalogOccasionByBriefFormat[brief?.format];
 if(occasion)query.set('occasion',occasion);
 if(['wedding','birthday','product_launch','opening','new_year','exhibition','sports_day'].includes(brief?.format))query.set('inspiration',brief.format);
 link.textContent=occasion?'Похожие работы для вдохновения ↗':'Работы агентств для вдохновения ↗';
 link.setAttribute('aria-label',occasion?'Показать работы близкого направления; это не подтверждение идентичного кейса':'Открыть каталог работ агентств для вдохновения');
 link.href='/catalog?'+query.toString();
}
function facts(p){return [p.category,p.eventCity,p.guestLabel].filter(Boolean).join(' · ');}
function role(p){
 const text=p?.role?.trim();
 if(!text||/^(?:Проект в (?:официальном )?портфолио агентства|Работа (?:представлена в |из |в )портфолио агентства)(?: для .*)?\.?$/i.test(text))return 'Нужно уточнить';
 if(/состав работ не раскрыт|границы участия не раскрыты|независимая проверка|^Работа в портфолио;/i.test(text))return 'Нужно уточнить. '+text;
 return text;
}
function unavailableWorkMarkup(pick){
 return `<div class="project-unavailable-work"><p>${esc(pick.workStatus)}</p>${pick.s.workSlug?`${pick.work?`<p>Прежняя работа: ${esc(pick.work.fullTitle)}</p>`:''}<p class="project-saved-id">Сохранённый идентификатор работы: <code>${esc(pick.s.workSlug)}</code></p>`:''}</div>`;
}
function preservedNoteMarkup(pick){
 if(!pick.s.workSlug)return '<p>Работа не выбрана. Личная заметка к работе не указана.</p>';
 return `<div class="project-preserved-note"><p>Заметка к сохранённому выбору работы</p><div class="comparison-note-text" data-comparison-note-text="${pick.s.agencySlug}" data-note-work="${pick.s.workSlug}">${esc(pick.note||'Сохранённой заметки к этой работе нет.')}</div><p class="project-saved-id">Работа: <code>${esc(pick.s.workSlug)}</code> · команда: <code>${esc(pick.s.agencySlug)}</code></p><small>Только для чтения, пока выбор недоступен. При выборе другой работы её заметка будет отдельной; прежний текст останется сохранён.</small></div>`;
}
function projectPresentationMarkup(pick,{showWorkTitle=true}={}){
 const {scope,title,lead,fit,participation,discussionPrompts=[]}=projectPresentation(pick);
 if(scope==='unavailable')return '<p class="project-presentation-empty">Публичное описание недоступно.</p>';
 const label=scope==='work'?'Описание работы':'Описание агентства',hasLead=Boolean(lead.trim()),hasFit=Boolean(fit.trim()),hasParticipation=Boolean(participation.trim());
 const questions=scope==='work'&&discussionPrompts.length?`<details class="project-discussion-questions"><summary>Вопросы для вашего события · ${discussionPrompts.length}</summary><ol>${discussionPrompts.map((question,index)=>`<li><p>${esc(question)}</p><button type="button" data-answer-work-question="${index}" data-answer-work="${esc(pick.s.workSlug)}" data-answer-agency="${esc(pick.s.agencySlug)}">Ответить в заметке…</button></li>`).join('')}</ol><p>Ваш ответ останется в личной заметке. Добавить её в пожелания можно отдельно.</p></details>`:'';
 return `<div class="project-presentation"><p class="project-presentation-context"><strong>${label}</strong>${title&&(showWorkTitle||scope==='agency')?`<span class="project-presentation-title">${esc(title)}</span>`:''}</p>${hasLead?`<p class="project-presentation-copy">${esc(lead)}</p>`:''}${!hasLead&&!hasFit?'<p class="project-presentation-empty">Публичное описание не указано.</p>':''}${hasFit||hasParticipation?`<dl class="project-presentation-details">${hasFit?`<div><dt>Если вам близко</dt><dd>${esc(fit)}</dd></div>`:''}${hasParticipation?`<div><dt>Участие в работе</dt><dd>${esc(participation)}</dd></div>`:''}</dl>`:''}${questions}</div>`;
}
function briefRows(b){return [['Формат',formatName(b.format)],['Город',b.city||'Нужно уточнить'],['Дата или период',b.dateUnknown?'Дата пока неизвестна':b.date||'Нужно уточнить'],['Количество гостей',b.guests||'Нужно уточнить'],['Ориентировочный бюджет',b.budgetHelp?'Нужна помощь с оценкой бюджета':b.budget?b.budget+' ₽':'Нужно уточнить'],['Пожелания',b.description||'Пока не указаны']];}
function agencyPriority(slug,label,index,total){
 return `<div class="agency-priority"><span class="agency-priority-label">Ваш приоритет <b>${String(index+1).padStart(2,'0')}</b></span>${total>1?`<div class="agency-priority-actions" role="group" aria-label="Приоритет ${esc(label)}"><button type="button" data-move-agency="${slug}" data-move-direction="-1" aria-label="Поднять приоритет ${esc(label)}" title="Поднять приоритет"${index===0?' disabled':''}>↑</button><button type="button" data-move-agency="${slug}" data-move-direction="1" aria-label="Опустить приоритет ${esc(label)}" title="Опустить приоритет"${index===total-1?' disabled':''}>↓</button></div>`:''}</div>`;
}
function comparisonTeamHeader({s,a,p,label},index,total){
 const identity=a?`<a class="comparison-team-name" href="/agency/${a.slug}?from=%2Fmy-project%23project-comparison" aria-label="Открыть профиль агентства ${esc(label)}">${esc(label)} ↗</a>`:`<div class="comparison-team-unavailable"><span class="comparison-team-name">Команда недоступна в каталоге</span><p class="project-saved-id">Сохранённый идентификатор: <code>${esc(s.agencySlug)}</code></p><p>Запись занимает место в вашем выборе.</p></div>`;
 return `<th scope="col" role="columnheader" id="comparison-team-${s.agencySlug}" aria-label="Приоритет ${index+1}: ${esc(label)}">${agencyPriority(s.agencySlug,label,index,total)}${identity}<button type="button" data-remove-agency="${s.agencySlug}" data-agency-name="${esc(label)}" aria-label="Убрать ${esc(label)} из сравнения">Убрать</button>${!a?'<a class="comparison-team-catalog" href="/catalog">Выбрать замену в каталоге ↗</a>':''}${p?.source?`<a class="comparison-team-source" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer" aria-label="Источник выбранной работы · ${esc(label)} (новая вкладка)">Источник работы ↗</a>`:''}</th>`;
}
let renderVersion=0;
async function renderProject(){
 briefEditor?.reconcile();
 contactEditor?.reconcile();
 const host=document.getElementById('project-board');if(!host)return;const version=++renderVersion;
 wishesUndo?.sync();
 replacementUndo?.sync();
 try{
  const data=await getData();if(version!==renderVersion)return;
  briefUndo?.sync();
  const entries=draft.selection,b=draft.brief;
  syncCatalogFormatLink(b);
  host.dataset.count=String(entries.length);
  renderBriefSummary(b);
  document.getElementById('selection-total').textContent=entries.length+' / 3';
  host.innerHTML=entries.length?entries.map((s,index)=>{
   const pick=selectionView(data,s,draft.workNotes),{a,p,label}=pick,link=p?'/work/'+p.slug+'?from=%2Fmy-project%23project-comparison':null;
   if(!a)return `<article class="project-agency-card project-agency-unavailable">${agencyPriority(s.agencySlug,label,index,entries.length)}<div class="project-agency-head"><div><h3>Команда недоступна в каталоге</h3><p class="project-saved-id">Сохранённый идентификатор: <code>${esc(s.agencySlug)}</code></p></div></div><p class="project-unavailable-description">Запись остаётся в вашем выборе и занимает одно из трёх мест. Данные профиля и публичное описание сейчас недоступны.</p>${unavailableWorkMarkup(pick)}${preservedNoteMarkup(pick)}<div class="comparison-actions"><a class="secondary-action" href="/catalog">Выбрать замену в каталоге ↗</a><button type="button" data-remove-agency="${s.agencySlug}" data-agency-name="${esc(label)}" aria-label="Убрать ${esc(label)} из проекта">Убрать</button></div></article>`;
   const specialization=a.types.map(t=>data.types[t]).filter(Boolean).join(', ')||'Нужно уточнить';
   return `<article class="project-agency-card">
    ${agencyPriority(s.agencySlug,label,index,entries.length)}
    <div class="project-agency-head"><div><h3>${esc(a.name)}</h3><p class="project-agency-location">${esc(a.city||'Город не указан')}</p></div></div>
    <div class="project-case-reason">${p?`${p.hasPhotos?`<a class="project-case-photo" href="${link}"><img src="${p.preview||p.reelMobile||p.image}" srcset="${esc(p.previewSrcSet||'')}" sizes="(max-width:900px) 100vw, 33vw" width="${p.imageWidth||1500}" height="${p.imageHeight||1000}" decoding="async" alt="${esc(p.fullTitle)}" loading="lazy"></a>`:''}<span class="eyebrow">${p.kind==='case'?'Выбранный кейс':'Выбранная работа'}</span><h4><a href="${link}">${esc(p.fullTitle)} ↗</a></h4><p>${esc(facts(p))}</p>`:unavailableWorkMarkup(pick)}</div>
    ${projectPresentationMarkup(pick,{showWorkTitle:false})}
    <section class="work-note-block"><label for="work-choice-${a.slug}">Работа для сравнения</label><select id="work-choice-${a.slug}" data-selected-work="${a.slug}">${s.workSlug&&!p?`<option value="${esc(s.workSlug)}" selected disabled>Прежний выбор недоступен · ${esc(s.workSlug)}</option>`:''}<option value="">Без выбранной работы</option>${data.projects.filter(w=>(w.agencySlug===a.slug||w.agencySlugs?.includes(a.slug))&&(!w.duplicateOf||w.slug===s.workSlug)).map(w=>`<option value="${esc(w.slug)}" ${w.slug===s.workSlug?'selected':''}>${esc(w.fullTitle)}</option>`).join('')}</select><button class="secondary-action work-picker-opener" type="button" data-open-work-picker="${a.slug}" aria-label="Посмотреть и выбрать работу ${esc(a.name)}">Посмотреть работы…</button>${p?`<label for="note-${a.slug}">Что нравится в этой работе?</label><textarea id="note-${a.slug}" data-work-note="${a.slug}" data-note-work="${p.slug}" rows="3" maxlength="1000" aria-describedby="note-help-${a.slug} note-status-${a.slug}" placeholder="Например: тёплый свет, оформление сцены, живая музыка">${esc(draft.workNotes[workNoteKey(a.slug,p.slug)]||'')}</textarea><p id="note-help-${a.slug}">Личная заметка · только в этом браузере. Передать её можно через «Добавить в пожелания».</p><button class="secondary-action" type="button" data-add-wishes-work="${p.slug}" data-add-wishes-agency="${a.slug}">Добавить в пожелания…</button><p id="note-status-${a.slug}" role="status"></p>`:s.workSlug?preservedNoteMarkup(pick):'<p>Выберите работу выше, чтобы оставить заметку.</p>'}</section>
    <details class="project-agency-details" data-agency-details="${a.slug}"${expandedAgencies.has(a.slug)?' open':''}><summary><span>Об агентстве и условиях</span><span class="agency-details-sign" aria-hidden="true">+</span></summary>
    <section class="comparison-block"><h4>Специализация</h4><p>${esc(specialization)}</p></section>
    <section class="comparison-block"><h4>География работы</h4><p>${esc(a.geography||'Нужно уточнить')}</p><p class="comparison-detail">Город команды: ${esc(a.city||'Нужно уточнить')}</p></section>
    <section class="comparison-block"><h4>Услуги и роль в кейсе</h4><p>Услуги: ${esc(a.services||'Нужно уточнить')}.</p><p>${p?'В выбранной работе: '+esc(role(p)):esc(pick.workStatus)}</p>${p?.source?`<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Источник о работе ↗</a>`:''}</section>
    <section class="comparison-block"><h4>Бюджет</h4><p>${esc(a.budgetConditions||'Нужно уточнить')}</p></section></details>
    
    <div class="comparison-actions"><a class="secondary-action" href="/agency/${a.slug}?from=%2Fmy-project%23project-comparison">Открыть профиль ↗</a><button data-remove-agency="${a.slug}" aria-label="Убрать ${esc(a.name)} из проекта">Убрать</button></div>
   </article>`;
  }).join(''):`<div class="project-empty"><h3>Команды можно выбрать позже.</h3><p>Добавьте до трёх агентств для сравнения.</p><a class="primary-action" href="/catalog">Добавить агентство ↗</a></div>`;
  host.querySelectorAll('[data-agency-details]').forEach(details=>details.addEventListener('toggle',()=>{if(details.open)expandedAgencies.add(details.dataset.agencyDetails);else expandedAgencies.delete(details.dataset.agencyDetails);rememberProjectView();}));
  renderComparison(data,entries);
  renderHandoff(data);
 }catch{host.innerHTML='<div class="project-empty"><h3>Не удалось загрузить команды.</h3><p>Обновите страницу, чтобы повторить загрузку. Описание мероприятия можно заполнить сейчас.</p></div>';renderHandoff();}
}
function contactNeedsSaving(){return Boolean(contactEditor&&(contactEditor.unsaved||contactEditor.blocked));}
let handoffMarkup='',handoffResultMarkup='',handoffErrorKey='';
// Rendering the handoff must never read/reconcile the contact editor again.
// Its state event also uses this path while save/reconcile is still on the stack.
function renderHandoff(data=handoffData){
 const review=document.getElementById('project-review');if(!review)return;
 if(data)handoffData=data;
 const accepted=inquiries.accepted(draft),retryPending=!accepted&&inquiries.hasPending(draft),contactPending=contactNeedsSaving();
 const unavailableSelection=Boolean(data&&selectionProblems(data,draft.selection).length);
 if(data){const markup=reviewMarkup(draft,data,briefRows(draft.brief),{accepted:Boolean(accepted),retryPending});if(markup!==handoffMarkup){review.innerHTML=markup;handoffMarkup=markup;}}
 document.getElementById('project-storage-note').hidden=available;
 const result=document.getElementById('project-request-result'),receipt=lastReceipt||accepted;
 if(accepted){wishesUndo?.clear();replacementUndo?.clear();}
 result.hidden=!receipt&&(!draft.request||!available);
 const resultMarkup=receipt?receiptMarkup(receipt,briefRows(receipt.brief)):draft.request&&available?'<strong>Задача сохранена в этом браузере</strong><p>Можно продолжить редактирование.</p><div class="draft-result-actions"><button class="secondary-action" data-return-project>Вернуться к моему проекту</button><button class="secondary-action" data-download-brief>Скачать черновик</button></div>':'';
 if(resultMarkup!==handoffResultMarkup){result.innerHTML=resultMarkup;handoffResultMarkup=resultMarkup;}
 if(!result.hidden&&focusRequest){result.scrollIntoView({block:'start'});result.focus({preventScroll:true});focusRequest=false;}
 const submit=document.querySelector('[data-submit-project]');
 const blockedSelection=unavailableSelection&&(contactPending||(!retryPending&&!accepted));
 submit.textContent=sending?(sendingRecovery?'Получаем подтверждение…':'Сохраняем заявку…'):blockedSelection?'Сначала исправьте выбор выше':contactPending?(contactEditor.blocked?'Проверить контакт перед отправкой':'Сохранить контакт и передать задачу'):accepted?'Заявка принята ✓':retryPending?'Получить подтверждение предыдущей отправки':'Передать задачу EventAgencies 101';
 submit.disabled=sending||Boolean(accepted&&!contactPending)||blockedSelection;submit.setAttribute('aria-busy',String(sending));
 const descriptions=[unavailableSelection?'request-selection-warning':'',contactPending?'contact-save-status':''].filter(Boolean);
 if(descriptions.length)submit.setAttribute('aria-describedby',descriptions.join(' '));else submit.removeAttribute('aria-describedby');
 const recovery=document.getElementById('project-inquiry-recovery'),recover=recovery?.querySelector('button');
 if(recovery){recovery.hidden=!(contactPending&&(accepted||retryPending));recover.disabled=sending;recover.textContent=accepted?'Показать подтверждение прежней заявки':'Получить подтверждение прежней заявки';}
 if(contactForm){
  contactForm.setAttribute('aria-busy',String(sending));
  for(const key of ['name','value'])contactForm.elements.namedItem(key).readOnly=sending;
  contactForm.elements.namedItem('method').disabled=sending;
  contactForm.querySelectorAll('button').forEach(button=>button.disabled=sending);
 }
 const save=document.querySelector('[data-save-draft]');
 save.textContent=draft.request&&available?'Черновик сохранён ✓':'Сохранить черновик';
 save.disabled=sending||savingDraft||Boolean(draft.request&&available);
 const error=document.getElementById('project-send-error'),errorKey=JSON.stringify([sendError,selectionSendError]);error.hidden=!sendError;
 if(errorKey!==handoffErrorKey){
  error.textContent=sendError;handoffErrorKey=errorKey;
  if(sendError&&selectionSendError){const link=document.createElement('a');link.href='#project-comparison';link.dataset.editSelection='';link.textContent='Исправить выбор в сравнении';error.append(' ',link);}
 }
}
async function sendInquiry({recover=false}={}){
 if(sending)return;
 contactEditor?.reconcile();
 let accepted=inquiries.accepted(draft),retryPending=!accepted&&inquiries.hasPending(draft);
 if(recover&&accepted){lastReceipt=accepted;focusRequest=true;renderHandoff();return;}
 if(recover&&!retryPending){sendError='Прежняя попытка изменилась. Проверьте текущую заявку перед отправкой.';selectionSendError=false;renderHandoff();document.getElementById('project-send-error').focus();return;}
 if(!recover&&!contactNeedsSaving()){
  if(accepted)return;
  recover=retryPending;
 }
 let isFresh=null;
 if(!recover){
  if(!contactEditor?.flush({focus:false})){
   sendError='Контакт ещё не сохранён. Проверьте сообщение под полями и повторите сохранение.';selectionSendError=false;renderHandoff();contactEditor?.focusRecovery();return;
  }
  // Capture the fresh project before validating the values now in the form.
  isFresh=contactEditor.createFreshnessGuard();
  if(!isFresh){sendError='Проект изменился. Проверьте контакт перед новой отправкой.';selectionSendError=false;renderHandoff();contactEditor.focusRecovery();return;}
  const invalid=contactPresentation?contactPresentation.validateForSubmit():contactError(draft.contact);
  if(invalid)return;
  if(!validPayload(submissionPayload(draft))){openBrief();document.getElementById('brief-save-status').textContent='Проверьте количество гостей и бюджет: укажите целые неотрицательные числа, гостей — не меньше одного.';return;}
  accepted=inquiries.accepted(draft);retryPending=!accepted&&inquiries.hasPending(draft);
  if(accepted){renderHandoff();return;}
  recover=retryPending;
 }
 sending=true;sendingRecovery=recover;sendError='';selectionSendError=false;const snapshot=submissionPayload(draft);renderHandoff();
 try{
  lastReceipt=await inquiries.send(snapshot,{beforeNewRequest:async payload=>{
   // The client invokes this only for a new attempt, never for receipt recovery.
   if(recover)throw Error('previous_inquiry_changed');
   let data;
   if(payload.selection.length){try{data=await getData();}catch{throw Error('catalog_unavailable');}}
   // Also check empty selections, after the final await and any lock wait.
   if(!isFresh?.())throw Error('project_changed_before_send');
   if(payload.selection.length){
    if(!Array.isArray(data?.agencies)||!Array.isArray(data?.projects))throw Error('catalog_unavailable');
    if(selectionProblems(data,payload.selection).length)throw Error('unavailable_selection');
   }
  }});
  focusRequest=true;document.dispatchEvent(new Event('ea:inquiry-accepted'));
 }
 catch(error){
  const code=error.code||error.message;selectionSendError=code==='unavailable_selection'||code==='invalid_selection';
  sendError=code==='project_changed_before_send'?'Новая заявка не отправлена: проект изменился во время подготовки. Проверьте актуальные данные и повторите отправку.':code==='previous_inquiry_changed'?'Прежняя попытка изменилась. Новая заявка не создана; проверьте текущие данные.':code==='unavailable_selection'?'Новая заявка не отправлена: в выборе есть недоступная команда или работа. Исправьте выбор либо оставьте доступную команду без работы.':code==='invalid_selection'?'Сервер отклонил выбранную команду или работу. Каталог на этой странице мог устареть. Обновите страницу и исправьте выбор перед новой заявкой; прежняя попытка не получила подтверждения.':code==='catalog_unavailable'?'Новая заявка не отправлена: не удалось проверить выбранные команды по каталогу. Обновите страницу или попробуйте позже.':code==='retry_storage_unavailable'?'Не удалось отправить. Разрешите сохранение данных этого сайта и попробуйте ещё раз.':inquiries.hasPending(snapshot)?'Подтверждение заявки не получено. Повторите попытку — прежние данные отправки будут использованы повторно.':'Не удалось отправить заявку. Попробуйте ещё раз.';
 }
 finally{sending=false;sendingRecovery=false;contactEditor?.reconcile();renderHandoff();await renderProject();if(sendError){if(contactNeedsSaving())contactEditor.focusRecovery();else document.getElementById('project-send-error').focus();}}
}
function openBrief(field){
 if(editingBlocked())return;
 const dialog=document.getElementById('brief-dialog');if(!dialog){location.assign('/my-project?edit=1');return;}
 briefEditor?.open(field);
}
function focusContact(preferred=''){
 const form=document.getElementById('project-contact-form');if(!form)return;
 const fields=['name','method','value'].map(name=>form.elements.namedItem(name)).filter(node=>node&&!node.disabled);
 const field=(preferred&&form.elements.namedItem(preferred)&&!form.elements.namedItem(preferred).disabled?form.elements.namedItem(preferred):null)||fields.find(node=>!node.value?.trim())||fields[0];
 document.getElementById('project-contact')?.scrollIntoView({block:'start'});field?.focus({preventScroll:true});
}
function setHelpSelection(expanded){
 if(!helpMode)return;
 helpSelectionExpanded=expanded;
 const content=document.getElementById('project-selection-content'),button=document.querySelector('[data-toggle-help-selection]');
 if(content)content.hidden=!expanded;
 if(button){button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'Свернуть подборку':'Посмотреть подборку (необязательно)';}
}
let wishesDialog=null,wishesTrigger=null,wishesBase='',wishesWorks=[],wishesGenerated='',wishesPrompt='',wishesSkipped=0,wishesUnavailable=0,wishesAgencyOnly=false,wishesAgencyName='',wishesOpening=false;
function syncWishesOptions(){
 const changed=wishesDialog.querySelector('#wishes-addition').value!==wishesGenerated,hasNotes=wishesWorks.some(item=>item.notes?.length);
 wishesDialog.querySelector('[data-wishes-notes]').disabled=changed||!hasNotes||Boolean(wishesPrompt);
 wishesDialog.querySelector('[data-reset-wishes-text]').hidden=!changed;
 wishesDialog.querySelector('[data-wishes-options-help]').textContent=changed?'Вы изменили текст. Чтобы переключить заметки, сначала нажмите «Сбросить правки».':wishesPrompt?'Вопрос будет добавлен отдельно от личных заметок. Перед сохранением вы сможете изменить формулировку.':hasNotes?(wishesTrigger?.hasAttribute('data-add-wishes-selection')?'Можно включить все личные заметки к выбранным примерам, в том числе записи для разных команд. Текст будет показан перед добавлением.':'Включите заметку, если хотите передать её вместе с примером.'):'У выбранных примеров пока нет личных заметок.';
}
function regenerateWishes(){
 const includeNotes=wishesDialog.querySelector('[data-wishes-notes]').checked;
 const fragments=wishesAgencyOnly?[`Вопрос к агентству «${wishesAgencyName}»: ${wishesPrompt}`]:wishesWorks.flatMap(item=>{
  if(wishesPrompt)return [wishesAddition(item.work,'',location.origin,item.agencyName||'')+'\nВопрос к агентству: '+wishesPrompt];
  if(includeNotes&&item.notes?.length)return item.notes.map(entry=>wishesAddition(item.work,entry.canUseForWishes?entry.note:'Моя заметка для «'+entry.agencyName+'»: '+entry.note,location.origin,entry.canUseForWishes?entry.agencyName:''));
  return [wishesAddition(item.work,'',location.origin,item.agencyName||'')];
 }),fresh=fragments.filter(fragment=>!draft.brief.description.includes(fragment));
 wishesSkipped=fragments.length-fresh.length;wishesGenerated=fresh.join('\n\n');wishesDialog.querySelector('#wishes-addition').value=wishesGenerated;
 const noteCount=wishesWorks.reduce((total,item)=>total+item.noteCount,0);
 wishesDialog.querySelector('[data-wishes-source-count]').textContent=(wishesAgencyOnly?'Команда: '+wishesAgencyName+' · Вопрос для обсуждения: 1':wishesPrompt?'Кейсов: '+wishesWorks.length+' · Вопрос для обсуждения: 1':'Примеров: '+wishesWorks.length+' · Личных заметок: '+noteCount)+(wishesSkipped?' · Уже есть в пожеланиях: '+wishesSkipped:'')+(wishesUnavailable?' · Недоступно в каталоге: '+wishesUnavailable:'');
 syncWishesOptions();updateWishesPreview();
}
function updateWishesPreview(message=''){
 const addition=wishesDialog.querySelector('#wishes-addition').value;
 wishesBase=draft.brief.description;
 const merged=mergeWishes(wishesBase,addition);
 wishesDialog.querySelector('#wishes-preview').value=merged.text;
 wishesDialog.querySelector('[data-confirm-wishes]').disabled=merged.result!=='added';
 const messages={empty:wishesAgencyOnly&&wishesSkipped?'Этот вопрос уже есть в пожеланиях.':wishesSkipped?'Выбранный текст примеров уже есть в пожеланиях.':'Добавьте текст примера или заметки.',duplicate:'Этот текст уже есть в пожеланиях.', 'too-long':'В пожеланиях получится '+merged.text.length+' символов. Максимум — 3000; сократите добавляемый текст или выберите меньше примеров.'};
 wishesDialog.querySelector('[data-wishes-status]').textContent=messages[merged.result]||message||'В пожеланиях будет '+merged.text.length+' из 3000 символов. Проверьте текст перед добавлением.';
 return merged;
}
async function openWishes(trigger){
 if(editingBlocked()||wishesOpening||wishesDialog?.open)return;wishesOpening=true;
 try{
  const data=await getData();if(editingBlocked())return;
  const agencySlug=trigger.dataset.addWishesAgency,batch=trigger.hasAttribute('data-add-wishes-selection');wishesPrompt=(trigger.dataset.addWishesPrompt||'').trim();
  wishesAgencyOnly=trigger.hasAttribute('data-add-wishes-agency-prompt');
  wishesAgencyName=wishesAgencyOnly?data.agencies.find(agency=>agency.slug===agencySlug)?.name||'':'';
  if(wishesAgencyOnly&&!wishesAgencyName){notice('Команда не найдена','Обновите каталог и попробуйте снова.');return;}
  const slugs=batch?normalizeReferences(JSON.parse(trigger.dataset.addWishesSelection)):wishesAgencyOnly?[]:[trigger.dataset.addWishesWork];
  wishesWorks=slugs.flatMap(slug=>{
   const work=data.projects.find(p=>p.slug===slug&&(batch||p.agencySlug===agencySlug||p.agencySlugs?.includes(agencySlug)));if(!work)return [];
   if(!batch){
    const agency=data.agencies.find(item=>item.slug===agencySlug);if(!agency)return [];
    const note=draft.workNotes[workNoteKey(agencySlug,work.slug)]||'';
    return [{work,agencyName:agency.name,notes:note.trim()?[{note,agencyName:agency.name,canUseForWishes:true}]:[],noteCount:note.trim()?1:0}];
   }
   const notes=referenceNotesForWork(work,draft.workNotes,data.agencies).filter(entry=>entry.note.trim());
   return [{work,notes,noteCount:notes.length}];
  });
  wishesUnavailable=slugs.length-wishesWorks.length;
  if(!wishesWorks.length&&!wishesAgencyOnly){notice('Примеры сейчас недоступны','Откройте сохранённые примеры и выберите работы заново.');return;}
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
    if(sending){wishesDialog.querySelector('[data-wishes-status]').textContent='Заявка отправляется. Дождитесь результата, затем добавьте пожелание.';return;}
    if(wishesBase!==draft.brief.description){if(wishesDialog.querySelector('#wishes-addition').value===wishesGenerated)regenerateWishes();updateWishesPreview('Пожелания изменились. Проверьте обновлённый предпросмотр и подтвердите добавление ещё раз.');return;}
    const merged=updateWishesPreview();if(merged.result!=='added')return;const previousDescription=draft.brief.description;
    try{draft=writeDraft(localStorage,updateBrief(draft,{description:merged.text}));available=true;lastReceipt=null;sendError='';}
    catch{available=false;document.getElementById('project-storage-note')?.removeAttribute('hidden');wishesDialog.querySelector('[data-wishes-status]').textContent='Не удалось сохранить пожелания. Разрешите хранение данных сайта и попробуйте снова.';return;}
    wishesUndo?.record(previousDescription,merged.text);await renderProject();wishesDialog.close();
    const status=document.getElementById('project-wishes-status');if(status){if(!wishesUndo)status.textContent='Пожелания дополнены. Заявка ещё не отправлена.';status.focus({preventScroll:true});}else if(wishesPrompt)notice('Вопрос добавлен в пожелания','Он сохранён в описании проекта. Заявка ещё не отправлена.');
   });
  }
  wishesTrigger=trigger;
  wishesDialog.querySelector('[data-wishes-notes]').checked=!batch&&!wishesPrompt&&wishesWorks.some(item=>item.notes?.length);
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
 const dialog=document.getElementById('brief-dialog');
 briefUndo=setupBriefSessionUndo({form:briefForm,dialog,canUndo:current=>!sending&&!inquiries.hasPending(current)&&!inquiries.accepted(current),onRestored:(next,context)=>{draft=next;available=true;briefEditor?.restored(next,context);syncUnknown(briefForm);updateBriefDescriptionCount(briefForm);refresh();}});
 briefEditor=setupBriefEditor({form:briefForm,dialog,undo:briefUndo,canEdit:()=>!sending,
  getFallbackBrief:()=>draft.brief,
  updateForm:()=>{syncUnknown(briefForm);updateBriefDescriptionCount(briefForm);},
  onRead:next=>{draft=next;available=true;},
  onSaved:next=>{draft=next;available=true;orderStatus.textContent='';lastReceipt=null;sendError='';refresh();},
  onClose:()=>refresh(),
  onSubmit:()=>{if(helpMode)focusContact();}
 });
 if(new URLSearchParams(location.search).get('edit')==='1')openBrief();
}
const contactForm=document.getElementById('project-contact-form');
const contactPresentation=contactForm?setupContactPresentation(contactForm):null;
if(contactForm){
 contactEditor=setupContactEditor({form:contactForm,presentation:contactPresentation,canEdit:()=>!sending,
  onRead:next=>{draft=next;available=true;},
  onSaved:next=>{draft=next;available=true;orderStatus.textContent='';lastReceipt=null;sendError='';selectionSendError=false;refresh();},
  onStorageError:()=>{available=false;document.getElementById('project-storage-note')?.removeAttribute('hidden');}
 });
 contactForm.addEventListener('ea:contact-editor-state',()=>renderHandoff());
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
 if(sending){change.result={ok:false,code:'sending'};field.closest('.work-note-block')?.querySelector('[role="status"]')?.replaceChildren('Заявка отправляется. Дождитесь результата, затем измените заметку.');editingBlocked();return;}
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
 const status=field.closest('.work-note-block').querySelector('[role="status"]');
 if(sending){field.value=draft.workNotes[workNoteKey(field.dataset.workNote,field.dataset.noteWork)]||'';status.textContent='Заявка отправляется. Дождитесь результата, затем измените заметку.';syncComparisonNote(field);return;}
 const next=updateWorkNote(draft,field.dataset.workNote,field.dataset.noteWork,field.value);
 try{draft=writeDraft(localStorage,next);available=true;status.textContent='Сохранено · '+field.value.length+' / 1000';}
 catch{draft=next;available=false;status.textContent='Не удалось сохранить. Не закрывайте страницу: разрешите хранение данных и повторите ввод.';}
 document.getElementById('project-storage-note').hidden=available;
 document.querySelectorAll('[data-work-note]').forEach(other=>{if(other!==field&&other.dataset.workNote===field.dataset.workNote&&other.dataset.noteWork===field.dataset.noteWork)other.value=field.value;});
 syncComparisonNote(field);
});
function syncComparisonNote(field){
 if(!field?.matches?.('textarea[data-work-note]'))return;
 document.querySelectorAll('[data-comparison-note-text]').forEach(node=>{
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
 const picks=entries.map(s=>selectionView(data,s,draft.workNotes));
 // One criterion model and one table serve both layouts. Stable identifiers
 // also keep each value associated with its team when rows stack on mobile.
 const rows=[
 {id:'work',label:'Выбранная работа',render:pick=>(pick.p?`<a href="/work/${pick.p.slug}?from=%2Fmy-project%23project-comparison" aria-label="Открыть работу «${esc(pick.p.fullTitle)}» · ${esc(pick.label)}">${esc(pick.p.fullTitle)} ↗</a><p>${esc(facts(pick.p))}</p>`:unavailableWorkMarkup(pick))+(pick.a?`<div class="comparison-cell-actions"><button type="button" data-open-work-picker="${pick.s.agencySlug}" aria-label="Выбрать работу для сравнения · ${esc(pick.label)}">${pick.p?'Сменить работу…':'Выбрать работу…'}</button></div>`:'')},
 {id:'presentation',label:'Описание варианта',render:pick=>projectPresentationMarkup(pick)},
 {id:'note',label:'Моя заметка',render:pick=>{
  const {s,a,p}=pick;
  if(!p)return preservedNoteMarkup(pick);
  const note=draft.workNotes[workNoteKey(s.agencySlug,p.slug)]||'';
  return `<div class="comparison-note-text" data-comparison-note-text="${a.slug}" data-note-work="${p.slug}">${esc(note||'Пока нет заметки')}</div><div class="comparison-cell-actions"><button type="button" data-edit-comparison-note="${a.slug}" data-note-work="${p.slug}" aria-label="Открыть личную заметку к работе «${esc(p.fullTitle)}» · ${esc(a.name)}">${note.trim()?'Изменить заметку…':'Добавить заметку…'}</button></div>`;
 }},
 {id:'specialization',label:'Специализация',render:({a})=>esc(a?(a.types.map(t=>data.types[t]).filter(Boolean).join(', ')||'Нужно уточнить'):'Профиль команды недоступен')},
 {id:'city',label:'Город команды',render:({a})=>esc(a?(a.city||'Нужно уточнить'):'Профиль команды недоступен')},
 {id:'geography',label:'География работы',render:({a})=>esc(a?(a.geography||'Нужно уточнить'):'Профиль команды недоступен')},
 {id:'services',label:'Услуги',render:({a})=>esc(a?(a.services||'Нужно уточнить'):'Профиль команды недоступен')},
 {id:'role',label:'Роль в выбранной работе',render:pick=>esc(pick.p?role(pick.p):pick.workStatus)},
 {id:'budget',label:'Опубликованные условия по бюджету',render:({a})=>esc(a?(a.budgetConditions||'Нужно уточнить'):'Профиль команды недоступен')},
 {id:'event-terms',label:'Дата и стоимость вашего события',render:({a})=>a?'Нужно обсудить с командой':'Профиль команды недоступен'},
 {id:'sources',label:'Источники',render:({a,p})=>a?`${p?.source?`<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer" aria-label="Источник выбранной работы · ${esc(a.name)} (новая вкладка)">${p.kind==='case'?'Источник кейса':'Материалы проекта'} ↗</a><br>`:''}<a href="/agency/${a.slug}?from=%2Fmy-project%23project-comparison" aria-label="Открыть профиль агентства ${esc(a.name)}">Профиль агентства ↗</a>`:'Профиль команды недоступен'}
 ];
 for(const row of rows)row.equal=()=>comparisonValuesMatch(row.id,picks,{types:data.types,notes:draft.workNotes});
 const criteria=setupComparisonCriteria(host,rows);
 criteria.content.innerHTML=`<p class="comparison-scroll-hint" id="comparison-format-hint">В каждом критерии команды идут в порядке вашего приоритета.</p><div class="comparison-scroll" role="region" aria-label="Сравнение выбранных агентств" tabindex="0"><table class="agency-compare-table" role="table" aria-labelledby="comparison-caption" aria-describedby="comparison-format-hint"><caption id="comparison-caption">Сравнение ${entries.length} выбранных команд</caption><thead role="rowgroup"><tr role="row"><th class="comparison-criterion-column" scope="col" role="columnheader">Критерий</th>${picks.map((pick,index)=>comparisonTeamHeader(pick,index,entries.length)).join('')}</tr></thead><tbody role="rowgroup">${rows.map(({id,label,render})=>`<tr role="row" data-comparison-criterion="${id}"><th scope="row" role="rowheader" id="comparison-criterion-${id}">${label}</th>${picks.map((pick,index)=>`<td role="cell" headers="comparison-team-${pick.s.agencySlug} comparison-criterion-${id}" data-comparison-agency="${pick.s.agencySlug}"><span class="comparison-cell-team" aria-hidden="true"><span>${String(index+1).padStart(2,'0')}</span><strong>${esc(pick.label)}</strong></span><div class="comparison-cell-value">${render(pick)}</div></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="comparison-guide">Доступную работу и её личную заметку можно изменить прямо в сравнении. Заметки автоматически не входят в пожелания и заявку. Условия нового мероприятия уточняются индивидуально.</p>`;
 criteria.apply();
}

setupSelectionShare({getState:()=>draft,getData});
const projectExporter=setupProjectExport({getState:()=>draft,getData,briefRows,workRole:role});
wishesUndo=setupWishesUndo({getDescription:()=>draft.brief.description,canUndo:()=>!sending,restore:description=>{
 try{draft=writeDraft(localStorage,updateBrief(draft,{description}));available=true;lastReceipt=null;sendError='';refresh();return true;}
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
setupProjectNoteEditor({getData,canEdit:()=>available&&!sending,onError:message=>notice('Личная заметка',message),onSaved:async(next,{agencySlug,workSlug,value,trigger,marker,path})=>{
 const savedNotice=noticeNote?.button===trigger&&noticeNote.agencySlug===agencySlug&&noticeNote.workSlug===workSlug&&noticeNote.marker===marker?noticeNote:null;
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
 const message=value?'Личная заметка сохранена. Пожелания и заявка не изменены.':'Личная заметка очищена. Пожелания и заявка не изменены.';
 orderStatus.textContent=message;
 // Keep the live opener for focus return; another notice never inherits this result.
 if(!savedNotice||noticeNote!==savedNotice||pop.hidden||!pop.contains(trigger)||location.pathname+location.search!==path)return;
 const current=savedNoteContext({agencySlug,workSlug});
 if(!current||current.marker!==marker||current.value!==value)return;
 savedNotice.button.textContent=noteActionLabel(value);
 savedNotice.status.textContent=message;
}});
setupProjectQuestionAnswer({getData,canEdit:()=>available&&!sending,onError:message=>notice('Ответ на вопрос',message),onSaved:async(next,{agencySlug,workSlug,value})=>{
 draft=next;available=true;
 document.getElementById('project-storage-note')?.setAttribute('hidden','');
 const fields=[...document.querySelectorAll('textarea[data-work-note]')].filter(field=>field.dataset.workNote===agencySlug&&field.dataset.noteWork===workSlug);
 for(const field of fields){
  field.value=value;
  const status=field.closest('.work-note-block')?.querySelector('[role="status"]');if(status)status.textContent='Сохранено · '+value.length+' / 1000';
 }
 fields[0]?.dispatchEvent(new CustomEvent('ea:work-note-updated',{bubbles:true,detail:{agencySlug,workSlug,reapplyReferenceFilters:true}}));
 orderStatus.textContent='Ответ сохранён в личной заметке. Пожелания и заявка не изменены.';
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
for(const type of ['ea:project-copy-restored','ea:project-started'])document.addEventListener(type,()=>{
 removedAgency=null;lastReceipt=null;sendError='';selectionSendError=false;focusRequest=false;orderStatus.textContent='';
 document.getElementById('project-undo')?.setAttribute('hidden','');
 if(contactEditor){contactEditor.invalidate();contactEditor.resetFromProject({focus:false});}
 else try{draft=readDraft(localStorage);available=true;}catch{available=false;}
 refresh();
});
setupProjectSections();

document.addEventListener('change',async event=>{
 const field=event.target.closest('[data-selected-work]');if(!field)return;
 const agencySlug=field.dataset.selectedWork,workSlug=field.value||null;
 const restore=()=>{field.value=draft.selection.find(item=>item.agencySlug===agencySlug)?.workSlug||'';};
 if(editingBlocked()){restore();return;}
 const data=await getData();
 if(editingBlocked()){restore();return;}
 if(workSlug&&!data.projects.some(p=>p.slug===workSlug&&(p.agencySlug===agencySlug||p.agencySlugs?.includes(agencySlug))))return;
 persist({...draft,selection:draft.selection.map(s=>s.agencySlug===agencySlug?{...s,workSlug}:s),request:null});
 await renderProject();document.getElementById('work-choice-'+agencySlug)?.focus({preventScroll:true});
});
