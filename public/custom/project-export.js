import {normalizeDraft,contactMethods,workNoteKey} from './project-store.js';
import {REFERENCE_KEY,normalizeReferences} from './reference-store.js';
import {exportReferenceSection,referenceExport} from './project-export-references.js';
import {normalizeProjectCopy} from './project-copy-model.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}};
const link=(url,label)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
const details=rows=>`<dl>${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;

export function projectExport(state,data,{rows,workRole,includeNotes=false,includeContact=false,includeReferences=false,referenceSlugs=[],origin='',createdAt=new Date(),copyName='',savedAt=null}){
 const agencyMap=new Map(data.agencies.map(agency=>[agency.slug,agency]));
 const entries=state.selection.map(item=>{
  const agency=agencyMap.get(item.agencySlug);
  const work=data.projects.find(project=>project.slug===item.workSlug&&(project.agencySlug===item.agencySlug||project.agencySlugs?.includes(item.agencySlug)));
  const fields=agency?[['Специализация',(agency.types||[]).map(type=>data.types[type]).filter(Boolean).join(', ')||'Нужно уточнить'],['Город команды',agency.city||'Нужно уточнить'],['География работы',agency.geography||'Нужно уточнить'],['Услуги',agency.services||'Нужно уточнить'],['Условия по бюджету',agency.budgetConditions||'Нужно уточнить']]:[['Состояние','Профиль выбранной команды больше недоступен в текущем каталоге.']];
  if(work){const facts=[work.category,work.eventCity,work.guestLabel].filter(Boolean).join(' · ');if(facts)fields.push(['О работе',facts]);fields.push(['Роль команды',workRole(work)]);}
  const noteKey=item.workSlug?workNoteKey(item.agencySlug,item.workSlug):'',rawNote=includeNotes&&noteKey?state.workNotes[noteKey]||'':'',note=rawNote.trim()?rawNote:'';
  return {name:agency?.name||'Команда недоступна в каталоге',work:work?.fullTitle||(item.workSlug?'Выбранная работа больше недоступна в каталоге':'Работа пока не выбрана'),fields,note,noteKey,profile:agency?safeUrl(origin+'/agency/'+agency.slug):'',workUrl:work?safeUrl(origin+'/work/'+work.slug):'',source:safeUrl(work?.source),website:safeUrl(agency?.website),unavailableTeam:!agency,unavailableWork:Boolean(item.workSlug&&!work)};
 });
 const referenceSection=includeReferences?exportReferenceSection(state,data,{referenceSlugs,includeNotes,origin,excludedNotes:entries.filter(entry=>entry.note).map(entry=>entry.noteKey)}):{lines:[],html:'',count:0,noteCount:0,unavailableCount:0};
 const date=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(createdAt);
 const copyTitle=String(copyName||'').trim().slice(0,120),savedDate=savedAt&&Number.isFinite(Date.parse(savedAt))?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(savedAt)):'';
 const identity=copyTitle?['Сохранённая копия: '+copyTitle,...(savedDate?['Сохранена в аккаунте: '+savedDate]:[]),'Сведения об агентствах и работах приведены по текущему каталогу.']:[];
 const contactRows=includeContact?[['Имя',state.contact.name||'Не указано'],[contactMethods[state.contact.method],state.contact.value||'Не указан']]:[];
 const footer='Это копия черновика, а не подтверждение отправки заявки. Доступность даты, стоимость и состав работ нужно уточнить у команд.';
 const scope='В копии — описание события и выбранные команды с их работами. '+(includeReferences?'Также включены сохранённые примеры: '+referenceSection.count+'.':'Остальные сохранённые примеры не включены.');
 const text=['МОЙ ПРОЕКТ · EventAgencies',...identity,'Файл от '+date,'',...rows.map(([label,value])=>label+': '+value),'','ВЫБРАННЫЕ КОМАНДЫ · В ПОРЯДКЕ ВАШЕГО ПРИОРИТЕТА',...entries.flatMap((entry,index)=>['',`${index+1}. ${entry.name}`,'Выбранная работа: '+entry.work,...entry.fields.map(([label,value])=>label+': '+value),...(entry.note?['Личная заметка: '+entry.note]:[]),...(entry.profile?['Профиль: '+entry.profile]:[]),...(entry.workUrl?['Работа: '+entry.workUrl]:[]),...(entry.source?['Источник работы: '+entry.source]:[]),...(entry.website?['Сайт команды: '+entry.website]:[])]),...(!entries.length?['Команды пока не выбраны. Нужна помощь с подбором.']:[]),...referenceSection.lines,...(includeContact?['','КОНТАКТ ДЛЯ ОТВЕТА',...contactRows.map(([label,value])=>label+': '+value)]:[]),'',scope,footer].join('\n');
 const cards=entries.map((entry,index)=>`<article class="team"><header><span class="number">${String(index+1).padStart(2,'0')}</span><div><p class="eyebrow">Ваш приоритет ${index+1}</p><h3>${esc(entry.name)}</h3></div></header><p class="work"><span>Выбранная работа</span><strong>${esc(entry.work)}</strong></p>${details(entry.fields)}${entry.note?`<aside class="note"><h4>Моя заметка</h4><p>${esc(entry.note)}</p></aside>`:''}<div class="links">${link(entry.profile,'Профиль команды')}${link(entry.workUrl,'Работа')}${link(entry.source,'Источник работы')}${link(entry.website,'Сайт команды')}</div></article>`).join('');
 const eventRows=rows.filter(([label])=>label!=='Пожелания');
 const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Мой проект — EventAgencies</title><style>
 *{box-sizing:border-box}body{margin:0;background:#eee8dc;color:#292721;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1000px;margin:40px auto;padding:48px;background:#fffdf8;border:1px solid #d6cebf;border-radius:12px}.eyebrow{margin:0;color:#776e60;font-size:11px;letter-spacing:.08em;text-transform:uppercase}.masthead{display:flex;justify-content:space-between;gap:24px;padding-bottom:26px;border-bottom:1px solid #d6cebf;font-size:13px}.masthead strong{font-weight:600}.masthead span{color:#776e60}h1{font-size:clamp(36px,6vw,62px);line-height:1.05;letter-spacing:-.05em;font-weight:500;margin:36px 0 14px}.intro{margin:0 0 34px;color:#776e60}h2{font-size:25px;line-height:1.25;font-weight:500;letter-spacing:-.025em;margin:0 0 24px}section+section{margin-top:36px;padding-top:30px;border-top:1px solid #d6cebf}dl{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin:0}dl>div{min-width:0}dt{font-size:12px;color:#776e60;margin-bottom:5px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}p{overflow-wrap:anywhere}.wishes{margin-top:28px;padding:22px;background:#f3eee5;border-radius:8px}.wishes h3,.note h4{margin:0 0 10px;font-size:14px;font-weight:600}.wishes p,.note p{margin:0;white-space:pre-wrap}.team{border:1px solid #d6cebf;padding:26px;border-radius:8px;margin-top:20px}.team>header{display:flex;gap:18px;align-items:center;margin-bottom:22px}.number{font-size:32px;line-height:1;color:#98603c;font-variant-numeric:tabular-nums}.team h3{font-size:25px;line-height:1.25;margin:5px 0 0;font-weight:500}.work{padding-bottom:22px;border-bottom:1px solid #ded8cd}.work span{display:block;color:#776e60;font-size:12px;margin-bottom:5px}.work strong{font-size:18px;font-weight:500}.note{margin-top:22px;padding:18px;background:#f3eee5;border-left:3px solid #98603c}.links{display:flex;gap:12px 20px;flex-wrap:wrap;margin-top:22px;font-size:13px}a{color:#80502f;text-underline-offset:3px}footer{margin-top:36px;padding-top:24px;border-top:1px solid #d6cebf;color:#776e60;font-size:12px}.print-help{font-size:12px;color:#776e60;margin-bottom:0}@media(max-width:650px){main{margin:0;padding:28px 20px;border:0;border-radius:0}.masthead{flex-direction:column;gap:8px}dl{grid-template-columns:1fr;gap:18px}.team{padding:20px}.wishes{padding:18px}.team h3{font-size:22px}}@media print{@page{size:A4;margin:18mm}body{background:white;color:#111;font-size:11pt}main{max-width:none;margin:0;padding:0;border:0;background:white}.masthead{font-size:9pt}h1{font-size:34pt;margin-top:24px}h2{font-size:19pt}.team{break-inside:avoid;padding:18px}.team h3{font-size:18pt}h2,h3,h4,dt{break-after:avoid}dl{grid-template-columns:1fr 1fr;gap:14px}.wishes,.note{background:#f4f1eb;print-color-adjust:exact}.print-help{display:none}footer{font-size:9pt}a{color:#333}}
 .reference h3{font-size:20px}.reference>header{margin-bottom:14px}.reference>p{font-size:14px;margin:10px 0}.reference .number{font-size:25px}.reference-unavailable{color:#776e60}@media print{.reference h3{font-size:14pt}.reference>p{font-size:10pt}.reference .number{font-size:18pt}}
 </style></head><body><main><div class="masthead"><strong>EventAgencies ↗</strong><span>Файл от ${esc(date)}</span></div><h1 style="overflow-wrap:anywhere">${esc(copyTitle||'Моё мероприятие')}</h1><p class="intro">${copyTitle?identity.map(esc).join('<br>'):'Описание события, выбранные команды'+(includeReferences?' и сохранённые примеры':'')}</p><section><h2>О событии</h2>${details(eventRows)}<div class="wishes"><h3>Пожелания</h3><p>${esc(state.brief.description||'Пока не указаны.')}</p></div></section><section><h2>Команды в вашем порядке</h2>${cards||'<p>Команды пока не выбраны. Нужна помощь с подбором.</p>'}</section>${referenceSection.html}${includeContact?`<section><h2>Контакт для ответа</h2>${details(contactRows)}</section>`:''}<footer><p>${esc(scope)}</p><p>${esc(footer)}</p><p class="print-help">Для печати или сохранения в PDF выберите «Печать» в меню браузера. Ссылки на закрытый проект могут потребовать входа.</p></footer></main></body></html>`;
 return {text,html,teamCount:entries.length,noteCount:entries.filter(entry=>entry.note.trim()).length+referenceSection.noteCount,referenceCount:referenceSection.count,unavailableReferenceCount:referenceSection.unavailableCount,unavailableTeamCount:entries.filter(entry=>entry.unavailableTeam).length,unavailableWorkCount:entries.filter(entry=>entry.unavailableWork).length};
}

export function setupProjectExport({getState,getData,briefRows,workRole}){
 if(!document.getElementById('project-board'))return;
 const dialog=document.createElement('dialog');dialog.id='project-export-dialog';dialog.setAttribute('aria-labelledby','project-export-title');
 dialog.innerHTML=`<button class="brief-close" type="button" data-close-project-export aria-label="Закрыть скачивание проекта">×</button><span class="eyebrow">Копия для себя или обсуждения</span><h2 id="project-export-title">Скачать мой проект</h2><p>Описание события и выбранные команды входят в каждый файл. Выберите, что добавить к ним.</p><fieldset class="project-export-options"><legend>Дополнительно включить</legend><label><input type="checkbox" data-export-notes><span>Личные заметки к выбранным работам</span></label><label><input type="checkbox" data-export-contact><span>Имя и контакт для ответа</span></label></fieldset><p class="project-export-summary" data-project-export-summary></p><details class="project-export-preview"><summary>Посмотреть содержимое файла</summary><label class="share-preview-label" for="project-export-preview">Текст вашей копии</label><textarea id="project-export-preview" rows="9" readonly></textarea><button class="project-export-copy" type="button" data-copy-project disabled>Скопировать текст</button></details><div class="project-export-formats"><button class="primary-action" type="button" data-project-export-format="html" disabled><strong>Оформленный файл</strong><span>HTML · чтение и печать</span></button><button class="secondary-action" type="button" data-project-export-format="txt" disabled><strong>Обычный текст</strong><span>TXT · для редактора</span></button></div><p class="project-export-help">HTML откроется без входа на сайт. Для PDF выберите «Печать» в браузере.</p><p class="brief-local-note" role="status" data-project-export-status></p>`;
 document.body.append(dialog);
 const referenceOption=document.createElement('label');referenceOption.innerHTML='<input type="checkbox" data-export-references disabled><span>Сохранённые примеры<small class="project-export-reference-help" data-export-reference-count></small></span>';dialog.querySelector('fieldset').prepend(referenceOption);
 dialog.querySelector('[data-export-notes]').nextElementSibling.textContent='Личные заметки к работам в файле';
 const references=dialog.querySelector('[data-export-references]'),referenceCount=dialog.querySelector('[data-export-reference-count]');
 const notes=dialog.querySelector('[data-export-notes]'),contact=dialog.querySelector('[data-export-contact]'),preview=dialog.querySelector('textarea'),status=dialog.querySelector('[data-project-export-status]'),summary=dialog.querySelector('[data-project-export-summary]'),actions=[...dialog.querySelectorAll('[data-project-export-format],[data-copy-project]')];
 const title=dialog.querySelector('#project-export-title'),intro=title.nextElementSibling;
 let snapshot=null,data=null,prepared=null,createdAt=null,trigger=null,version=0,savedReferences=[],referencesOnly=false,referenceWarning='',savedCopy=null;
 function render(){
  if(!snapshot||!data)return;
  const options={rows:briefRows(snapshot.brief),workRole,includeNotes:notes.checked,includeContact:contact.checked,includeReferences:references.checked,referenceSlugs:savedReferences,origin:location.origin,createdAt,copyName:savedCopy?.name,savedAt:savedCopy?.createdAt};
  prepared=referencesOnly?referenceExport(snapshot,data,options):projectExport(snapshot,data,options);
  preview.value=prepared.text;actions.forEach(button=>button.disabled=false);
  summary.textContent=(referencesOnly?'Примеров: '+prepared.referenceCount:'Команд: '+prepared.teamCount+(references.checked?' · Примеров: '+prepared.referenceCount:''))+' · '+(notes.checked?'Заметок: '+prepared.noteCount:'Без личных заметок')+' · '+(contact.checked?'С контактом':'Без контакта')+(prepared.unavailableReferenceCount?'. Недоступных в каталоге примеров: '+prepared.unavailableReferenceCount+' — они отмечены в файле.':'');
  if(prepared.unavailableTeamCount||prepared.unavailableWorkCount)summary.textContent+=' Недоступных команд: '+prepared.unavailableTeamCount+', выбранных работ: '+prepared.unavailableWorkCount+' — они отмечены в файле.';
  status.textContent=referenceWarning+(savedCopy?'Файл из сохранённой копии. Текущий проект не изменяется.':referencesOnly?'Файл содержит только отмеченные примеры и выбранные дополнения.':'Файл содержит копию текущего черновика.')+' Скачивание не отправляет заявку.';
 }
 async function openExport(button,record=null){
  if(dialog.open)return;
  trigger=button;notes.checked=false;contact.checked=false;notes.disabled=false;contact.disabled=false;references.checked=false;references.disabled=true;referenceCount.textContent='';savedReferences=[];snapshot=null;data=null;prepared=null;createdAt=new Date();
  savedCopy=record?{name:String(record.name||'Сохранённая копия').slice(0,120),createdAt:record.createdAt,snapshot:normalizeProjectCopy(record.snapshot)}:null;
  referencesOnly=!savedCopy&&button.hasAttribute('data-export-reference-selection');referenceWarning='';referenceOption.hidden=referencesOnly;
  title.textContent=savedCopy?'Скачать сохранённую копию':referencesOnly?'Скачать выбранные примеры':'Скачать мой проект';intro.textContent=savedCopy?'Копия «'+savedCopy.name+'». Выберите содержимое файла перед скачиванием.':referencesOnly?'В файл войдут только отмеченные примеры в текущем порядке. Выберите, что добавить к ним.':'Описание события и выбранные команды входят в каждый файл. Выберите, что добавить к ним.';
  notes.nextElementSibling.textContent=referencesOnly?'Личные заметки к выбранным примерам':'Личные заметки к работам в файле';
  contact.nextElementSibling.textContent='Имя и контакт для ответа';
  preview.value='';dialog.querySelector('details').open=false;actions.forEach(action=>action.disabled=true);summary.textContent='';status.textContent='Готовим копию проекта…';dialog.showModal();
  const current=++version;
  try{
   if(savedCopy&&!savedCopy.snapshot)throw Error('invalid_copy');
   const loaded=await getData();if(current!==version||!dialog.open)return;data=loaded;snapshot=normalizeDraft(savedCopy?savedCopy.snapshot.draft:getState());
   if(savedCopy){
    savedReferences=[...savedCopy.snapshot.references];references.checked=Boolean(savedReferences.length);references.disabled=!savedReferences.length;
    referenceCount.textContent=savedReferences.length?'В сохранённой копии: '+savedReferences.length+'. В файл войдут названия, команды и ссылки.':'В этой копии нет сохранённых примеров.';
    notes.disabled=!savedCopy.snapshot.includeNotes||!Object.values(snapshot.workNotes).some(note=>note.trim());contact.disabled=!savedCopy.snapshot.includeContact;
    if(notes.disabled)notes.nextElementSibling.textContent='Личные заметки в этой копии отсутствуют';
    if(contact.disabled)contact.nextElementSibling.textContent='Контакт в эту копию не включён';
    render();return;
   }
   try{
    const stored=JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]');if(!Array.isArray(stored))throw Error('invalid_references');const available=normalizeReferences(stored);
    if(referencesOnly){const requested=normalizeReferences(JSON.parse(button.dataset.exportReferenceSelection));savedReferences=requested.filter(slug=>available.includes(slug));if(!savedReferences.length)throw Object.assign(new Error('selection_empty'),{code:'selection_empty'});if(savedReferences.length<requested.length)referenceWarning='Часть отмеченных примеров уже убрана из проекта. В файл войдут оставшиеся: '+savedReferences.length+'. ';references.checked=true;}
    else savedReferences=available;
    references.disabled=referencesOnly||!savedReferences.length;referenceCount.textContent=savedReferences.length?'Примеров: '+savedReferences.length+'. В файл войдут названия, команды и ссылки.':'Сохранённых примеров пока нет.';
   }
   catch(error){if(referencesOnly)throw error;references.disabled=true;referenceCount.textContent='Не удалось прочитать примеры в этом браузере. Откройте окно заново, чтобы повторить.';}
   render();
  }
  catch(error){if(current===version&&dialog.open){snapshot=null;prepared=null;savedReferences=[];actions.forEach(action=>action.disabled=true);status.textContent=error.code==='selection_empty'?'Отмеченных примеров уже нет в проекте. Закройте окно и выберите примеры заново.':'Не удалось подготовить файл. Закройте окно и попробуйте снова.';}}
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-download-brief]');if(button){event.preventDefault();openExport(button);}});
 notes.addEventListener('change',render);contact.addEventListener('change',render);references.addEventListener('change',render);
 dialog.querySelector('[data-close-project-export]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{version++;prepared=null;snapshot=null;data=null;savedReferences=[];savedCopy=null;(trigger?.isConnected?trigger:document.querySelector('.project-intro [data-download-brief]'))?.focus({preventScroll:true});});
 dialog.querySelectorAll('[data-project-export-format]').forEach(button=>button.addEventListener('click',()=>{
  if(!prepared)return;const html=button.dataset.projectExportFormat==='html';
  const url=URL.createObjectURL(new Blob([html?prepared.html:'\ufeff'+prepared.text],{type:html?'text/html;charset=utf-8':'text/plain;charset=utf-8'}));
  const fileName=savedCopy?(savedCopy.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').trim().replace(/[. ]+$/,'').slice(0,90)||'сохранённая копия'):referencesOnly?'выбранные примеры':'мой проект';
  const anchor=document.createElement('a');anchor.href=url;anchor.download='EventAgencies — '+fileName+'.'+(html?'html':'txt');anchor.hidden=true;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent=html?'Оформленный файл подготовлен для скачивания. Откройте его в браузере для чтения или печати.':'Текстовый файл подготовлен для скачивания.';
 }));
 dialog.querySelector('[data-copy-project]').addEventListener('click',async()=>{
  if(!prepared)return;const current=version,text=prepared.text;
  try{await navigator.clipboard.writeText(text);if(dialog.open&&current===version)status.textContent=referencesOnly?'Текст подборки скопирован.':'Текст проекта скопирован.';}
  catch{if(dialog.open&&current===version){dialog.querySelector('details').open=true;preview.focus();preview.select();status.textContent='Скопируйте выделенный текст через меню браузера или клавиатуру.';}}
 });
 return {openSavedCopy:(record,button)=>openExport(button,record)};
}
