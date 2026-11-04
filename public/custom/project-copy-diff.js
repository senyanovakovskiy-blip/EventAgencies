import {normalizeDraft,occasions,contactMethods} from './project-store.js';
import {normalizeReferences} from './reference-store.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sameOrder=(left,right)=>left.length===right.length&&left.every((value,index)=>value===right[index]);
const orderChanged=(before,after)=>{
 const previous=new Set(before),next=new Set(after);
 return !sameOrder(before.filter(value=>next.has(value)),after.filter(value=>previous.has(value)));
};
const list=(items,empty)=>items.length?`<ol class="copy-change-list">${items.map(item=>`<li>${item}</li>`).join('')}</ol>`:`<p class="copy-change-note">${esc(empty)}</p>`;
const rows=values=>`<dl>${values.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
const columns=(before,after)=>`<div class="copy-change-grid"><div class="copy-change-side"><h5>Сейчас</h5>${before}</div><div class="copy-change-side"><h5>После загрузки</h5>${after}</div></div>`;
const group=(title,body)=>`<details class="copy-change-group"><summary>${esc(title)}</summary>${body}</details>`;
const textValue=(value,empty)=>`<p class="copy-change-value" tabindex="0">${esc(value||empty)}</p>`;

function catalogLabels(data){
 const hasCatalog=Array.isArray(data?.agencies)&&Array.isArray(data?.projects);
 const agencies=new Map((hasCatalog?data.agencies:[]).map(agency=>[agency.slug,agency]));
 const works=new Map((hasCatalog?data.projects:[]).map(work=>[work.slug,work]));
 const agency=slug=>agencies.get(slug)?.name||(hasCatalog?'Команда не найдена в каталоге · ':'Название команды недоступно · ')+slug;
 const work=(slug,agencySlug=null)=>{
  if(!slug)return 'Работа не выбрана';
  const item=works.get(slug);
  if(!item)return (hasCatalog?'Работа не найдена в каталоге · ':'Название работы недоступно · ')+slug;
  if(agencySlug&&item.agencySlug!==agencySlug&&!item.agencySlugs?.includes(agencySlug))return 'Работа не подтверждена для этой команды · '+slug;
  return item.fullTitle||'Название работы не указано · '+slug;
 };
 return {hasCatalog,agency,work};
}

function eventChanges(before,after,briefRows){
 const fallback=brief=>[
  ['Формат',brief.format==='other'?'Другой формат':occasions[brief.format]||'Нужно уточнить'],
  ['Город',brief.city||'Нужно уточнить'],
  ['Дата или период',brief.dateUnknown?'Дата пока неизвестна':brief.date||'Нужно уточнить'],
  ['Количество гостей',brief.guests||'Нужно уточнить'],
  ['Ориентировочный бюджет',brief.budgetHelp?'Нужна помощь с оценкой бюджета':brief.budget?brief.budget+' ₽':'Нужно уточнить'],
  ['Пожелания',brief.description||'Пока не указаны']
 ];
 const describe=brief=>new Map(typeof briefRows==='function'?briefRows({...brief}):fallback(brief));
 const previous=describe(before),next=describe(after),fallbackBefore=new Map(fallback(before)),fallbackAfter=new Map(fallback(after));
 const fields=[
  {label:'Формат',keys:['format']},
  {label:'Город',keys:['city']},
  {label:'Дата или период',keys:['date','dateUnknown']},
  {label:'Количество гостей',keys:['guests']},
  {label:'Ориентировочный бюджет',keys:['budget','budgetHelp']}
 ];
 const changed=fields.filter(field=>field.keys.some(key=>before[key]!==after[key]));
 const values=(brief,rendered,defaults)=>changed.flatMap(({label,keys})=>{
  const output=[[label,rendered.get(label)??defaults.get(label)]];
  // A selected "unknown/help" option can conceal a stored value that is also replaced.
  if(keys.includes('date')&&(before.dateUnknown||after.dateUnknown)&&before.date!==after.date)output.push(['Сохранённая дата или период',brief.date||'Не указаны']);
  if(keys.includes('budget')&&(before.budgetHelp||after.budgetHelp)&&before.budget!==after.budget)output.push(['Сохранённая сумма бюджета',brief.budget?brief.budget+' ₽':'Не указана']);
  return output;
 });
 const wishesChanged=before.description!==after.description;
 return {
  count:changed.length+(wishesChanged?1:0),
  html:(changed.length?group('Параметры события · '+changed.length,columns(rows(values(before,previous,fallbackBefore)),rows(values(after,next,fallbackAfter)))):'')+
   (wishesChanged?group('Пожелания к событию',columns(textValue(before.description,'Пока не указаны'),textValue(after.description,'Пока не указаны'))):'')
 };
}

/** Describe the effective loadSnapshot; never reads storage or changes either input. */
export function describeCopyChanges({current,currentReferences,incoming,data,briefRows}){
 const before=normalizeDraft(current),after=normalizeDraft(incoming?.draft);
 const previousReferences=normalizeReferences(currentReferences),nextReferences=normalizeReferences(incoming?.references);
 const includeNotes=Boolean(incoming?.includeNotes),includeContact=Boolean(incoming?.includeContact);
 // Match restoreProjectCopy: omitted fields retain all current values, even for removed works.
 if(!includeNotes)after.workNotes={...before.workNotes};
 if(!includeContact)after.contact={...before.contact};
 const labels=catalogLabels(data),summary=[],details=[],preserved=[];
 const event=eventChanges(before.brief,after.brief,briefRows);
 if(event.count){summary.push('Изменятся параметры события и пожелания: '+event.count+'.');details.push(event.html);}

 const previousTeams=before.selection.map(item=>item.agencySlug),nextTeams=after.selection.map(item=>item.agencySlug);
 const previousByTeam=new Map(before.selection.map(item=>[item.agencySlug,item])),nextByTeam=new Map(after.selection.map(item=>[item.agencySlug,item]));
 const teamsAdded=nextTeams.filter(slug=>!previousByTeam.has(slug)),teamsRemoved=previousTeams.filter(slug=>!nextByTeam.has(slug));
 const worksChanged=after.selection.filter(item=>previousByTeam.has(item.agencySlug)&&previousByTeam.get(item.agencySlug).workSlug!==item.workSlug);
 const teamsReordered=orderChanged(previousTeams,nextTeams);
 if(teamsAdded.length||teamsRemoved.length||worksChanged.length||teamsReordered){
  const changes=[teamsAdded.length?'добавятся: '+teamsAdded.length:'',teamsRemoved.length?'будут убраны: '+teamsRemoved.length:'',worksChanged.length?'изменится выбранная работа: '+worksChanged.length:'',teamsReordered?'изменится порядок':''].filter(Boolean);
  summary.push('Команды — '+changes.join('; ')+'.');
  const teamList=(selection,isAfter)=>list(selection.map(item=>{
   const other=(isAfter?previousByTeam:nextByTeam).get(item.agencySlug);
   const status=!other?(isAfter?'Добавится':'Будет убрана'):other.workSlug!==item.workSlug?'Выбранная работа изменится':'';
   return `<strong>${esc(labels.agency(item.agencySlug))}</strong><p class="copy-change-note">${esc(labels.work(item.workSlug,item.agencySlug))}</p>${status?`<p class="copy-change-note">${esc(status)}</p>`:''}`;
  }),'Команды не выбраны.');
  details.push(group('Команды и выбранные работы',columns(teamList(before.selection,false),teamList(after.selection,true))));
 }

 const previousReferenceSet=new Set(previousReferences),nextReferenceSet=new Set(nextReferences);
 const referencesAdded=nextReferences.filter(slug=>!previousReferenceSet.has(slug)),referencesRemoved=previousReferences.filter(slug=>!nextReferenceSet.has(slug));
 const referencesReordered=orderChanged(previousReferences,nextReferences);
 if(!sameOrder(previousReferences,nextReferences)){
  const changes=[referencesAdded.length?'добавятся: '+referencesAdded.length:'',referencesRemoved.length?'будут убраны: '+referencesRemoved.length:'',referencesReordered?'изменится порядок':''].filter(Boolean);
  summary.push('Сохранённые примеры — '+changes.join('; ')+'.');
  const referenceList=(references,isAfter)=>list(references.map(slug=>{
   const changed=!(isAfter?previousReferenceSet:nextReferenceSet).has(slug);
   return `${esc(labels.work(slug))}${changed?`<p class="copy-change-note">${isAfter?'Добавится':'Будет убран'}</p>`:''}`;
  }),'Сохранённых примеров нет.');
  details.push(group('Сохранённые примеры и их порядок',columns(referenceList(previousReferences,false),referenceList(nextReferences,true))));
 }

 const noteKeys=[...new Set([...Object.keys(before.workNotes),...Object.keys(after.workNotes)])];
 const notes=noteKeys.map(key=>({key,before:before.workNotes[key]||'',after:after.workNotes[key]||''})).filter(note=>note.before!==note.after);
 if(includeNotes&&notes.length){
  const added=notes.filter(note=>!note.before).length,removed=notes.filter(note=>!note.after).length,changed=notes.length-added-removed;
  const changes=[added?'добавятся: '+added:'',changed?'изменятся: '+changed:'',removed?'будут убраны: '+removed:''].filter(Boolean);
  summary.push('Заметки — '+changes.join('; ')+'.');
  details.push(group('Заметки к работам · '+notes.length,list(notes.map(note=>{
   const [agencySlug,workSlug]=note.key.split('/'),status=!note.before?'Добавится':!note.after?'Будет убрана':'Изменится';
   return `<details><summary>${esc(status+' · '+labels.work(workSlug,agencySlug)+' · '+labels.agency(agencySlug))}</summary>${columns(textValue(note.before,'Заметки нет'),textValue(note.after,'Заметки нет'))}</details>`;
  }),'')));
 }else if(!includeNotes)preserved.push('При этой загрузке все текущие заметки сохранятся, в том числе к работам вне выбранной подборки.');

 const contactChanged=['name','method','value'].some(key=>before.contact[key]!==after.contact[key]);
 if(includeContact&&contactChanged){
  summary.push('Изменятся имя или контакт для ответа.');
  const contactRows=contact=>rows([['Имя',contact.name||'Не указано'],['Способ связи',contactMethods[contact.method]],['Контакт',contact.value||'Не указан']]);
  details.push(group('Имя и контакт для ответа',columns(contactRows(before.contact),contactRows(after.contact))));
 }else if(!includeContact)preserved.push('При этой загрузке текущие имя, способ связи и контакт сохранятся.');

 const hasChanges=summary.length>0;
 const html=`<section class="copy-changes"><h4 class="copy-changes-heading">Что изменится в текущем проекте</h4><p class="copy-changes-intro">${hasChanges?'Сравнение текущего проекта с результатом загрузки. Раскройте раздел, чтобы увидеть значения до и после.':'Описание события, команды, примеры, заметки и контакт останутся такими же.'}</p>${hasChanges?`<ul class="copy-changes-summary">${summary.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}${details.join('')}${preserved.map(value=>`<p class="copy-change-preserved">${esc(value)}</p>`).join('')}${!labels.hasCatalog&&(previousTeams.length||nextTeams.length||previousReferences.length||nextReferences.length||notes.length)?'<p class="copy-change-note">Каталог сейчас недоступен. Для команд и работ показаны идентификаторы; их наличие в каталоге не подтверждено.</p>':''}</section>`;
 return {html,hasChanges};
}
