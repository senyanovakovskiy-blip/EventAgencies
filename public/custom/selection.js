import {setupSelectionShare} from './share-selection.js';
import {KEY,workNoteKey,updateWorkNote,occasions,contactMethods,emptyDraft,normalizeDraft,readDraft,writeDraft,addAgency,replaceAgency,removeAgency,updateBrief,updateContact,submitLocal} from './project-store.js';
import {reviewMarkup,receiptMarkup} from './request-review.js';
import {createInquiryClient} from './inquiry-client.js';
import {INQUIRY_KEY,contactError,validPayload,submissionPayload} from './inquiry-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let draft=emptyDraft(),available=true,dataPromise,focusRequest=false,pendingReplacement=null,savingDraft=false,sending=false,sendError='',lastReceipt=null;
const inquiries=createInquiryClient({storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)}});
try{draft=readDraft(localStorage);}catch{available=false;}
const getData=()=>dataPromise||(dataPromise=(async()=>{
 const embedded=document.getElementById('project-reference-data');
 if(embedded)return JSON.parse(embedded.textContent);
 const response=await fetch('/custom/catalog-data.json');if(!response.ok)throw Error('data');return response.json();
})().catch(error=>{dataPromise=null;throw error;}));
function persist(next,{quiet=false}={}){
 lastReceipt=null;sendError='';
 try{draft=writeDraft(localStorage,next);available=true;refresh();return true;}
 catch{draft=normalizeDraft({...next,request:null});available=false;refresh();document.getElementById('project-storage-note')?.removeAttribute('hidden');if(!quiet)notice('Не удалось сохранить изменения','В браузере недоступно сохранение. Разрешите хранение данных сайта и попробуйте ещё раз.');return false;}
}
const pop=document.createElement('aside');pop.className='ea-selection-notice';pop.hidden=true;pop.setAttribute('aria-label','Ваша подборка');document.body.append(pop);
function notice(title,copy){pop.innerHTML=`<button class="ea-notice-close" aria-label="Закрыть уведомление">×</button><div role="status"><strong>${esc(title)}</strong><p>${esc(copy)}</p></div><div class="ea-notice-actions"><button data-continue>Продолжить выбор</button><a href="/my-project">Мой проект${draft.selection.length?' · '+draft.selection.length:''} ↗</a></div>`;pop.hidden=false;}
const replacement=document.createElement('dialog');replacement.id='replacement-dialog';replacement.setAttribute('aria-labelledby','replacement-title');document.body.append(replacement);
replacement.addEventListener('close',()=>{pendingReplacement=null;});
async function offerReplacement(agencySlug,workSlug){
 try{
  const data=await getData(),candidate=data.agencies.find(a=>a.slug===agencySlug);if(!candidate)return;
  pendingReplacement={agencySlug,workSlug};
  replacement.innerHTML=`<button class="brief-close" data-cancel-replacement aria-label="Закрыть замену агентства">×</button><span class="eyebrow">До трёх команд в одном проекте</span><h2 id="replacement-title">Кого заменить на ${esc(candidate.name)}?</h2><p>Описание мероприятия сохранится. Вместо выбранной ниже команды появится ${esc(candidate.name)}${workSlug?' с выбранной работой':''}.</p><div class="replacement-options">${draft.selection.map(s=>{const a=data.agencies.find(a=>a.slug===s.agencySlug);return `<button class="secondary-action" data-replace-agency="${esc(s.agencySlug)}">Заменить ${esc(a?.name||s.agencySlug)}</button>`;}).join('')}</div><button class="replacement-cancel" data-cancel-replacement>Оставить подборку</button>`;
  pop.hidden=true;replacement.showModal();
 }catch{notice('Не удалось загрузить варианты замены','Подборка не изменилась. Попробуйте ещё раз.');}
}
function refresh(){
 document.querySelectorAll('[data-save-agency]').forEach(button=>{const selected=draft.selection.some(s=>s.agencySlug===button.dataset.saveAgency);button.textContent=selected?'Добавлено':'В мой проект';button.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-project-count]').forEach(node=>node.textContent=draft.selection.length?String(draft.selection.length):'');
 document.querySelectorAll('[data-my-project-link]').forEach(node=>node.setAttribute('aria-label','Мой проект'+(draft.selection.length?', агентств: '+draft.selection.length:'')));
 if(document.getElementById('project-board'))renderProject();
}
document.addEventListener('click',async event=>{
 const view=event.target.closest('[data-comparison-view]');if(view){comparisonView=view.dataset.comparisonView;renderProject();return;}
 const save=event.target.closest('[data-save-agency]');
 if(save){
  event.preventDefault();const result=addAgency(draft,save.dataset.saveAgency,save.dataset.saveWork||null);
  if(result.result==='full'){await offerReplacement(save.dataset.saveAgency,save.dataset.saveWork||null);return;}
  if(result.result==='invalid')return;
  if(result.result!=='existing'&&!persist(result.state))return;
  const left=3-draft.selection.length;
  notice(result.result==='updated'?'Выбранная работа обновлена':result.result==='existing'?'Агентство уже в вашем проекте':'Агентство добавлено в ваш проект',left===2?'Можно добавить ещё две команды для сравнения или перейти к описанию мероприятия.':left===1?'Можно добавить ещё одну команду для сравнения или перейти к описанию мероприятия.':'Три команды выбраны. Перейдите к сравнению и описанию мероприятия.');return;
 }
 const replace=event.target.closest('[data-replace-agency]');
 if(replace&&pendingReplacement){
  const next=replaceAgency(draft,replace.dataset.replaceAgency,pendingReplacement.agencySlug,pendingReplacement.workSlug);
  if(next.result==='replaced'&&persist(next.state)){replacement.close();notice('Агентство заменено','В подборке по-прежнему три команды. Описание мероприятия сохранено.');}
  else if(next.result!=='replaced'){replacement.close();notice('Подборка уже изменилась','Проверьте выбранные команды в «Моём проекте».');}
  return;
 }
 if(event.target.closest('[data-cancel-replacement]')){replacement.close();return;}
 if(event.target.closest('[data-continue],.ea-notice-close')){pop.hidden=true;return;}
 const remove=event.target.closest('[data-remove-agency]');if(remove){persist(removeAgency(draft,remove.dataset.removeAgency));return;}
 const occasion=event.target.closest('[data-occasion]');if(occasion&&!draft.brief.format&&Object.hasOwn(occasions,occasion.dataset.occasion))persist(updateBrief(draft,{format:occasion.dataset.occasion}),{quiet:true});
 const editBrief=event.target.closest('[data-edit-brief]');if(editBrief)openBrief(editBrief.dataset.briefField);
 if(event.target.closest('[data-edit-selection]')){event.preventDefault();const section=document.getElementById('project-comparison');section?.scrollIntoView({block:'start'});section?.focus({preventScroll:true});}
 if(event.target.closest('[data-return-project]')){document.querySelector('.project-intro')?.scrollIntoView({block:'start'});document.querySelector('.project-intro [data-edit-brief]')?.focus({preventScroll:true});}
 if(event.target.closest('[data-submit-project]')){
  await sendInquiry();return;
 }
 if(event.target.closest('[data-save-draft]')){
  if(savingDraft||(available&&draft.request))return;
  savingDraft=true;const button=document.querySelector('[data-save-draft]');button.disabled=true;
  try{const result=submitLocal(draft,'EA-LOCAL-'+Date.now().toString(36).toUpperCase(),new Date().toISOString());focusRequest=true;if(!persist(result.state))focusRequest=false;}
  finally{savingDraft=false;button.disabled=Boolean(available&&draft.request);}
 }

 if(event.target.closest('[data-download-brief]'))downloadBrief();
});
addEventListener('storage',e=>{if(e.key===INQUIRY_KEY)refresh();if(e.key===KEY||e.key===null){try{draft=readDraft(localStorage);refresh();if(briefForm&&document.getElementById('brief-dialog').open)fillBrief(briefForm);if(contactForm)fillContact();}catch{}}});
new MutationObserver(changes=>{if(changes.some(c=>c.type==='attributes'||[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-save-agency],[data-project-count]')||n.querySelector?.('[data-save-agency],[data-project-count]')))))refresh();}).observe(document.getElementById('root')||document.getElementById('content'),{childList:true,subtree:true,attributes:true,attributeFilter:['data-save-agency','data-save-work']});
for(const type of ['wheel','pointerdown','touchstart'])document.addEventListener(type,event=>{if(matchMedia('(max-width:900px)').matches&&event.target.closest('.home.is-landing .ws'))event.stopPropagation();},{capture:true,passive:true});
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
let comparisonView='cards';
let renderVersion=0;
async function renderProject(){
 const host=document.getElementById('project-board');if(!host)return;const version=++renderVersion;
 try{
  const data=await getData();if(version!==renderVersion)return;
  const agencyMap=new Map(data.agencies.map(a=>[a.slug,a]));
  const entries=draft.selection.filter(s=>agencyMap.has(s.agencySlug)),b=draft.brief;
  host.dataset.count=String(entries.length);
  document.getElementById('project-summary').innerHTML=[b.format&&formatName(b.format),b.city,b.dateUnknown?'Дата пока неизвестна':b.date,b.guests&&b.guests+' гостей',b.budgetHelp?'Нужна помощь с оценкой бюджета':b.budget&&'Бюджет: '+b.budget+' ₽'].filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('');
  document.getElementById('project-description').textContent=b.description;
  document.querySelector('.project-intro [data-edit-brief]').textContent=b.format||b.city||b.description?'Изменить описание':'Описать мероприятие';
  document.getElementById('selection-total').textContent=entries.length+' / 3';
  host.innerHTML=entries.length?entries.map(s=>{
   const a=agencyMap.get(s.agencySlug),p=selectedWork(data,s),link=p?'/work/'+p.slug+'?from=%2Fmy-project':null;
   const specialization=a.types.map(t=>data.types[t]).filter(Boolean).join(', ')||'Нужно уточнить';
   return `<article class="project-agency-card">
    <div class="project-agency-head"><h3>${esc(a.name)}</h3></div>
    <div class="project-case-reason">${p?`${p.hasPhotos?`<a class="project-case-photo" href="${link}"><img src="${p.reelMobile||p.image}" alt="${esc(p.fullTitle)}" loading="lazy"></a>`:''}<span class="eyebrow">${p.kind==='case'?'Выбранный кейс':'Выбранная работа'}</span><h4><a href="${link}">${esc(p.fullTitle)} ↗</a></h4><p>${esc(facts(p))}</p>`:'<div class="project-no-case"><span>Кейс не выбран</span><p>Агентство добавлено без конкретного проекта.</p></div>'}</div>
    <section class="work-note-block">${p?`<label for="note-${a.slug}">Что нравится в этой работе?</label><textarea id="note-${a.slug}" data-work-note="${a.slug}" data-note-work="${p.slug}" rows="3" maxlength="1000" aria-describedby="note-help-${a.slug} note-status-${a.slug}" placeholder="Например: тёплый свет, оформление сцены, живая музыка">${esc(draft.workNotes[workNoteKey(a.slug,p.slug)]||'')}</textarea><p id="note-help-${a.slug}">Личная заметка · только в этом браузере. В заявку не отправляется.</p><p id="note-status-${a.slug}" role="status"></p>`:'<p>Выберите работу в профиле агентства, чтобы оставить заметку.</p>'}</section>
    <section class="comparison-block"><h4>Специализация</h4><p>${esc(specialization)}</p></section>
    <section class="comparison-block"><h4>География работы</h4><p>${esc(a.geography||'Нужно уточнить')}</p><p class="comparison-detail">Город команды: ${esc(a.city||'Нужно уточнить')}. Это не ограничение географии работы.</p></section>
    <section class="comparison-block"><h4>Услуги и роль в кейсе</h4><p>Услуги: ${esc(a.services||'Нужно уточнить')}.</p><p>${p?'В выбранной работе: '+esc(role(p)): 'Роль в кейсе: нужно уточнить после выбора проекта.'}</p>${p?.source?`<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Источник о работе ↗</a>`:''}</section>
    <section class="comparison-block"><h4>Опубликованные условия по бюджету</h4><p>${esc(a.budgetConditions||'Нужно уточнить')}</p><p class="comparison-detail">Стоимость нового мероприятия рассчитывается по вашей задаче.</p></section>
    <section class="comparison-block questions"><h4>Что обсудить с командой</h4><ul><li>Свободна ли ваша дата?</li><li>Что входит в предложение?</li><li>Каковы стоимость и условия работы?</li></ul></section>
    <div class="comparison-actions"><a class="secondary-action" href="/agency/${a.slug}">Открыть профиль ↗</a><button data-remove-agency="${a.slug}" aria-label="Убрать ${esc(a.name)} из проекта">Убрать</button></div>
   </article>`;
  }).join(''):`<div class="project-empty"><h3>Команды можно выбрать позже.</h3><p>Опишите мероприятие сейчас или добавьте до трёх агентств из каталога. Здесь появится сравнение их опыта и условий.</p><a class="primary-action" href="/catalog">Добавить агентство ↗</a></div>`;
  renderComparison(data,entries);
  document.getElementById('project-review').innerHTML=reviewMarkup(draft,data,briefRows(b));
  document.getElementById('project-storage-note').hidden=available;
  const result=document.getElementById('project-request-result');
  const accepted=inquiries.accepted(draft),receipt=lastReceipt||accepted;
  result.hidden=!receipt&&(!draft.request||!available);
  if(receipt)result.innerHTML=receiptMarkup(receipt,briefRows(receipt.brief));
  else if(draft.request&&available)result.innerHTML='<strong>Задача сохранена в этом браузере</strong><p>Этот черновик ещё не передан. Можно продолжить редактирование или передать задачу EventAgencies.</p><div class="draft-result-actions"><button class="secondary-action" data-return-project>Вернуться к моему проекту</button><button class="secondary-action" data-download-brief>Скачать черновик</button></div>';
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
 if(invalid){document.getElementById('contact-save-status').textContent=invalid.message;contactForm.elements.namedItem(invalid.field)?.focus();return;}
 if(!validPayload(submissionPayload(draft))){openBrief();document.getElementById('brief-save-status').textContent='Проверьте количество гостей и бюджет: укажите целые неотрицательные числа, гостей — не меньше одного.';return;}
 sending=true;sendError='';const snapshot=submissionPayload(draft);refresh();
 try{lastReceipt=await inquiries.send(snapshot);focusRequest=true;}
 catch(error){sendError=error.message==='retry_storage_unavailable'?'Не удалось отправить. Разрешите сохранение данных этого сайта и попробуйте ещё раз.':'Не удалось отправить. Попробуйте ещё раз';}
 finally{sending=false;await renderProject();if(sendError){const node=document.getElementById('project-send-error');node.focus();}}
}
function fillBrief(form){
 for(const [key,value]of Object.entries(draft.brief)){const field=form.elements.namedItem(key);if(field){if(field.type==='checkbox')field.checked=value;else field.value=value;}}
 syncUnknown(form);
}
function openBrief(field){
 const dialog=document.getElementById('brief-dialog');if(!dialog){location.assign('/my-project?edit=1');return;}
 fillBrief(dialog.querySelector('form'));dialog.showModal();if(field)dialog.querySelector('form').elements.namedItem(field)?.focus();
}
function syncUnknown(form){form.elements.budget.disabled=form.elements.budgetHelp.checked;form.elements.date.disabled=form.elements.dateUnknown.checked;}
const briefForm=document.getElementById('event-brief-form');
if(briefForm){
 const saveForm=()=>{
  syncUnknown(briefForm);
  const values={};for(const key of Object.keys(emptyDraft().brief)){const field=briefForm.elements.namedItem(key);values[key]=field.type==='checkbox'?field.checked:field.value;}
  const saved=persist(updateBrief(draft,values),{quiet:true});
  document.getElementById('brief-save-status').textContent=saved?'Изменения сохранены в этом браузере.':'Не удалось сохранить. Разрешите хранение данных сайта и попробуйте снова.';
  return saved;
 };
 briefForm.addEventListener('input',saveForm);briefForm.addEventListener('change',saveForm);
 briefForm.addEventListener('submit',event=>{event.preventDefault();if(saveForm())document.getElementById('brief-dialog').close();});
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
  syncContact();
  const values={name:contactForm.elements.name.value,method:contactForm.elements.method.value,value:contactForm.elements.value.value};
  const saved=persist(updateContact(draft,values),{quiet:true});
  document.getElementById('contact-save-status').textContent=saved?'Контакт сохранён в этом браузере.':'Не удалось сохранить контакт. Он остаётся на этой странице; разрешите хранение данных сайта и попробуйте снова.';
 };
 contactForm.addEventListener('input',saveContact);contactForm.addEventListener('change',saveContact);
 contactForm.addEventListener('submit',event=>{event.preventDefault();saveContact();});
}
async function downloadBrief(){
 try{const data=await getData(),b=draft.brief;const lines=['МОЁ МЕРОПРИЯТИЕ',...briefRows(b).map(([k,v])=>k+': '+v),'','ВЫБРАННЫЕ КОМАНДЫ'];for(const s of draft.selection){const a=data.agencies.find(a=>a.slug===s.agencySlug),p=selectedWork(data,s);if(!a)continue;lines.push('',a.name,p?.fullTitle||'Кейс не выбран',p?location.origin+'/work/'+p.slug:'',p?facts(p):'',p?'Роль: '+role(p):'',p&&draft.workNotes[workNoteKey(s.agencySlug,p.slug)]?'Личная заметка: '+draft.workNotes[workNoteKey(s.agencySlug,p.slug)]:'','Специализация: '+a.types.map(t=>data.types[t]).filter(Boolean).join(', '),'Город команды: '+(a.city||'Нужно уточнить'),'География: '+(a.geography||'Нужно уточнить'),'Услуги: '+(a.services||'Нужно уточнить'),'Условия по бюджету: '+(a.budgetConditions||'Нужно уточнить'),'Источник: '+(p?.source||a.website||'Нужно уточнить'),'Уточнить: доступность даты, стоимость и состав предложения.');}if(!draft.selection.length)lines.push('Пока не выбраны.');lines.push('','КОНТАКТ ДЛЯ ОТВЕТА','Имя: '+(draft.contact.name||'Не указано'),contactMethods[draft.contact.method]+': '+(draft.contact.value||'Не указан'),'','Это копия текущего черновика. Подтверждение передачи и номер заявки показаны в «Моём проекте» после записи на сервер.','Сообщения агентствам не отправляются.');const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='EventAgencies — мой проект.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{notice('Не удалось подготовить файл','Обновите страницу и попробуйте ещё раз.');}
}
refresh();

document.addEventListener('input',event=>{
 const field=event.target.closest('[data-work-note]');if(!field)return;
 const next=updateWorkNote(draft,field.dataset.workNote,field.dataset.noteWork,field.value);
 const status=document.getElementById('note-status-'+field.dataset.workNote);
 try{draft=writeDraft(localStorage,next);available=true;status.textContent='Сохранено · '+field.value.length+' / 1000';}
 catch{draft=next;available=false;status.textContent='Не удалось сохранить. Не закрывайте страницу: разрешите хранение данных и повторите ввод.';}
 document.getElementById('project-storage-note').hidden=available;
});
function renderComparison(data,entries){
 const host=document.getElementById('comparison-table');if(!host)return;
 const enough=entries.length>=2;
 if(!enough)comparisonView='cards';
 const tableMode=comparisonView==='table';
 document.getElementById('project-board').hidden=tableMode;
 host.hidden=!tableMode;
 document.querySelectorAll('[data-comparison-view]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.comparisonView===comparisonView));if(button.dataset.comparisonView==='table')button.disabled=!enough;});
 document.getElementById('comparison-hint').textContent=enough?'Одинаковые критерии для '+entries.length+' команд':'Добавьте хотя бы два агентства для сравнения';
 if(!tableMode)return;
 const picks=entries.map(s=>({s,a:data.agencies.find(a=>a.slug===s.agencySlug),p:selectedWork(data,s)}));
 const rows=[
 ['Выбранная работа',({p})=>p?`<a href="/work/${p.slug}?from=%2Fmy-project">${esc(p.fullTitle)} ↗</a><p>${esc(facts(p))}</p>`:'Кейс не выбран'],
 ['Моя заметка',({s,p})=>esc(p&&draft.workNotes[workNoteKey(s.agencySlug,p.slug)]||'Пока нет заметки')],
 ['Специализация',({a})=>esc(a.types.map(t=>data.types[t]).filter(Boolean).join(', ')||'Нужно уточнить')],
 ['Город команды',({a})=>esc(a.city||'Нужно уточнить')],
 ['География работы',({a})=>esc(a.geography||'Нужно уточнить')],
 ['Услуги',({a})=>esc(a.services||'Нужно уточнить')],
 ['Роль в выбранной работе',({p})=>esc(p?role(p):'Кейс не выбран')],
 ['Опубликованные условия по бюджету',({a})=>esc(a.budgetConditions||'Нужно уточнить')],
 ['Дата и стоимость вашего события',()=> 'Нужно обсудить с командой'],
 ['Источники',({a,p})=>`${p?.source?`<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Источник кейса ↗</a><br>`:''}<a href="/agency/${a.slug}">Профиль агентства ↗</a>`]
 ];
 host.innerHTML=`<p class="comparison-scroll-hint">На узком экране прокрутите таблицу вправо, чтобы увидеть все команды.</p><div class="comparison-scroll" role="region" aria-label="Сравнение выбранных агентств" tabindex="0"><table class="agency-compare-table"><caption>Сравнение ${entries.length} агентств</caption><thead><tr><th scope="col">Критерий</th>${picks.map(({a})=>`<th scope="col"><a href="/agency/${a.slug}">${esc(a.name)} ↗</a><button data-remove-agency="${a.slug}" aria-label="Убрать ${esc(a.name)} из сравнения">Убрать</button></th>`).join('')}</tr></thead><tbody>${rows.map(([label,render])=>`<tr><th scope="row">${label}</th>${picks.map(pick=>`<td>${render(pick)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="comparison-guide">Личные заметки можно изменить во вкладке «Работы и заметки». Условия нового мероприятия уточняются индивидуально.</p>`;
}

setupSelectionShare({getState:()=>draft,getData});
