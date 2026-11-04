import {readDraft,workNoteKey} from './project-store.js';
import {escapeHtml as esc} from './work-presentation.js';
import {REFERENCE_KEY,normalizeReferences} from './reference-store.js';
import {setupReferenceBatch,syncReferenceBatch} from './reference-batch.js';
import {referenceNotesForWork,referenceNoteForTeam} from './reference-note-model.js';
import {setupReferenceNoteCopy} from './reference-note-copy.js';
import {setupReferenceNoteClear} from './reference-note-clear.js';
import {findReferenceNoteMatch} from './reference-note-search.js';
export {REFERENCE_KEY,normalizeReferences};
const noteCopyController=setupReferenceNoteCopy();
const noteClearController=setupReferenceNoteClear();
let saved=[];try{saved=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]'));}catch{}
const status=document.createElement('div');status.className='reference-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);
let timer,removedReferences=null;
function announce(text,undo=false){
 clearTimeout(timer);status.replaceChildren();
 const copy=document.createElement('span');copy.textContent=text;status.append(copy);
 if(undo){
  const restore=document.createElement('button');restore.type='button';restore.dataset.undoReference='';restore.textContent=removedReferences?.length===1?'Вернуть пример':'Вернуть примеры';status.append(restore);
  const close=document.createElement('button');close.type='button';close.dataset.dismissReference='';close.setAttribute('aria-label','Закрыть уведомление');close.textContent='×';status.append(close);
 }else timer=setTimeout(()=>status.replaceChildren(),4500);
}
function sync(){document.querySelectorAll('[data-workspace-reference-count]').forEach(node=>node.textContent=String(saved.length));document.querySelectorAll('[data-reference-work]').forEach(b=>{const active=saved.includes(b.dataset.referenceWork);const label=active?'Пример сохранён ✓':'Сохранить как пример';if(b.textContent!==label)b.textContent=label;b.setAttribute('aria-pressed',String(active));});}
let data,renderVersion=0,shownReferences=false;
const VIEW_KEY='eventagencies-reference-view-v1';
let referenceView={query:'',agency:'',mode:'photos',sort:'recent',onlyNotes:false};
try{const view=JSON.parse(sessionStorage.getItem(VIEW_KEY)||'null');if(view)referenceView={query:typeof view.query==='string'?view.query.slice(0,200):'',agency:typeof view.agency==='string'?view.agency:'',mode:view.mode==='notes'?'notes':'photos',sort:['earliest','title','agency'].includes(view.sort)?view.sort:'recent',onlyNotes:view.onlyNotes===true};}catch{}
const normalizeSearch=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
const workAgencies=work=>[...new Set([work.agencySlug,...(Array.isArray(work.agencySlugs)?work.agencySlugs:[])].filter(Boolean))];
function rememberView(){try{sessionStorage.setItem(VIEW_KEY,JSON.stringify(referenceView));}catch{}}
function noteEntryMarkup(entry){
 const id='reference-note-'+entry.workSlug+(entry.isPrimary?'':'--'+entry.agencySlug);
 const label=entry.isPrimary?'Моя заметка к примеру':'Моя заметка · '+entry.agencyName;
 const context=entry.isPrimary?'Личная заметка · сохраняется в этом браузере.':'Личная запись для команды «'+entry.agencyName+'». Сохраняется в этом браузере.';
 return `<section class="work-note-block reference-note-entry" data-reference-note-entry="${esc(entry.key)}" data-reference-note-agency-name="${esc(entry.agencyName)}"><label for="${esc(id)}">${esc(label)}</label><textarea id="${esc(id)}" data-work-note="${esc(entry.agencySlug)}" data-note-work="${esc(entry.workSlug)}" rows="3" maxlength="1000" aria-describedby="${esc(id)}-help ${esc(id)}-status" placeholder="Что нравится в этой работе?">${esc(entry.note)}</textarea><p class="reference-note-context" id="${esc(id)}-help">${esc(context)}</p><div class="reference-note-actions">${entry.canUseForWishes?`<button class="secondary-action" type="button" data-add-wishes-work="${esc(entry.workSlug)}" data-add-wishes-agency="${esc(entry.agencySlug)}">Добавить в пожелания…</button>`:''}<button class="secondary-action" type="button" data-copy-reference-note aria-describedby="${esc(id)}-copy-status"${entry.note.trim()?'':' disabled'}>Скопировать заметку</button><button class="secondary-action" type="button" data-clear-reference-note aria-describedby="${esc(id)}-clear-status"${entry.note.length?'':' disabled'}>Очистить заметку</button><button class="secondary-action" type="button" data-undo-reference-note-clear aria-describedby="${esc(id)}-clear-status" hidden>Вернуть текст</button></div><p id="${esc(id)}-status" role="status"></p><p id="${esc(id)}-copy-status" data-reference-note-copy-status role="status"></p><p id="${esc(id)}-clear-status" data-reference-note-clear-status role="status"></p></section>`;
}
function noteFields(card){return [...card.querySelectorAll('.reference-notes [data-work-note]')];}
function syncReferenceNoteMark(card){
 const count=noteFields(card).filter(field=>field.value.trim()).length;
 const mark=card.querySelector('[data-reference-note-mark]');if(mark)mark.textContent=count?'· '+count:'+';
}
function referenceNoteSearchItems(card){
 return noteFields(card).map(field=>({key:workNoteKey(field.dataset.workNote,field.dataset.noteWork),agencyName:field.closest('.reference-note-entry')?.dataset.referenceNoteAgencyName||field.dataset.workNote,note:field.value}));
}
function syncReferenceNoteMatch(card){
 const host=card.querySelector('.reference-note-match');if(!host)return;
 const match=!card.hidden&&referenceView.query.trim()?findReferenceNoteMatch(referenceNoteSearchItems(card),referenceView.query,{limit:180}):null;
 host.hidden=!match;if(!match)return;
 let button=host.querySelector('[data-open-reference-note-match]');
 if(!button){
  button=host.ownerDocument.createElement('button');button.type='button';button.className='reference-note-match-button';button.dataset.openReferenceNoteMatch='';
  for(const className of ['reference-note-match-label','reference-note-match-text','reference-note-match-action']){const span=host.ownerDocument.createElement('span');span.className=className;button.append(span);}
  host.append(button);
 }
 button.dataset.referenceNoteMatchKey=match.key;
 const field=noteFields(card).find(field=>workNoteKey(field.dataset.workNote,field.dataset.noteWork)===match.key);if(field)button.setAttribute('aria-controls',field.id);
 const values={
  'reference-note-match-label':'Найдено в заметке · '+match.agencyName+(match.matchingNotes>1?' · Заметок с совпадениями: '+match.matchingNotes:''),
  'reference-note-match-text':match.snippet.replace(/\s+/g,' ').trim(),
  'reference-note-match-action':'Открыть заметку →'
 };
 for(const [className,value] of Object.entries(values)){const span=button.querySelector('.'+className);if(span.textContent!==value)span.textContent=value;}
}
function noteChooserMarkup(work){
 const id='reference-note-team-'+work.slug;
 return `<div class="reference-note-add" data-reference-note-add hidden><label for="${esc(id)}">Добавить заметку для команды</label><select id="${esc(id)}" data-reference-note-team aria-describedby="${esc(id)}-help" disabled><option value="">Выберите команду</option></select><button class="secondary-action" type="button" data-add-reference-team-note disabled>Добавить заметку</button><p class="reference-note-add-help" id="${esc(id)}-help">Текст сохранится после ввода. Состав сравнения останется прежним.</p></div>`;
}
function syncReferenceNoteChooser(card,work){
 const chooser=card.querySelector('[data-reference-note-add]');if(!chooser||!work)return;
 const select=chooser.querySelector('[data-reference-note-team]'),button=chooser.querySelector('[data-add-reference-team-note]');
 const present=new Set(noteFields(card).map(field=>field.dataset.workNote)),linked=new Set(workAgencies(work));
 const candidates=data.agencies.filter(agency=>linked.has(agency.slug)&&!present.has(agency.slug)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
 const signature=JSON.stringify(candidates.map(agency=>[agency.slug,agency.name]));
 const choice=candidates.some(agency=>agency.slug===select.value)?select.value:candidates.length===1?candidates[0].slug:'';
 if(chooser.dataset.noteCandidates!==signature){
  select.innerHTML=(candidates.length===1?'':'<option value="">Выберите команду</option>')+candidates.map(agency=>`<option value="${esc(agency.slug)}">${esc(agency.name)}</option>`).join('');
  chooser.dataset.noteCandidates=signature;
 }
 if(select.value!==choice)select.value=choice;
 chooser.hidden=!candidates.length;select.disabled=!candidates.length;button.disabled=!choice;
}
function currentNoteValues(workSlug,source=null){
 let notes={};try{notes={...readDraft(localStorage).workNotes};}catch{}
 document.querySelectorAll('[data-work-note]').forEach(field=>{if(field.dataset.noteWork===workSlug)notes[workNoteKey(field.dataset.workNote,workSlug)]=field.value;});
 if(source)notes[workNoteKey(source.dataset.workNote,workSlug)]=source.value;
 return notes;
}
function insertReferenceNote(card,entry){
 const container=card.querySelector('.reference-notes'),chooser=container?.querySelector('[data-reference-note-add]');if(!container)return null;
 const existing=noteFields(card).find(field=>field.dataset.workNote===entry.agencySlug&&field.dataset.noteWork===entry.workSlug);if(existing)return existing;
 if(chooser)chooser.insertAdjacentHTML('beforebegin',noteEntryMarkup(entry));else container.insertAdjacentHTML('beforeend',noteEntryMarkup(entry));
 return noteFields(card).find(field=>field.dataset.workNote===entry.agencySlug&&field.dataset.noteWork===entry.workSlug)||null;
}
function sortReferences(host,works){
 const sorted=[...works];
 if(referenceView.sort==='recent')sorted.reverse();
 if(referenceView.sort==='title')sorted.sort((a,b)=>a.fullTitle.localeCompare(b.fullTitle,'ru'));
 if(referenceView.sort==='agency')sorted.sort((a,b)=>String(a.client||'').localeCompare(String(b.client||''),'ru')||a.fullTitle.localeCompare(b.fullTitle,'ru'));
 const grid=host.querySelector('#saved-reference-grid'),cards=new Map([...grid.querySelectorAll('[data-saved-reference]')].map(card=>[card.dataset.savedReference,card]));
 const fragment=document.createDocumentFragment();sorted.forEach(work=>fragment.append(cards.get(work.slug)));grid.append(fragment);
}
function showReferenceMode(host){
 host.dataset.referenceMode=referenceView.mode;
 host.querySelectorAll('[data-reference-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.referenceView===referenceView.mode)));
 host.querySelectorAll('[data-saved-reference]').forEach(card=>{
  const notes=card.querySelector('.reference-notes'),toggle=card.querySelector('[data-toggle-reference-note]');
  const expanded=referenceView.mode==='notes'||card.dataset.noteOpen==='true';
  notes.hidden=!expanded;toggle.hidden=referenceView.mode==='notes';toggle.setAttribute('aria-expanded',String(expanded));
 });
}
function filterReferences(host,works){
 const words=normalizeSearch(referenceView.query).trim().split(/\s+/).filter(Boolean);
 let visible=0;
 host.querySelectorAll('[data-saved-reference]').forEach(card=>{
  const work=works.find(work=>work.slug===card.dataset.savedReference);
  const fields=noteFields(card),notes=fields.map(field=>field.value);
  const agencies=data.agencies.filter(agency=>workAgencies(work).includes(agency.slug)).map(agency=>agency.name);
  const noteAgencies=[...card.querySelectorAll('[data-reference-note-agency-name]')].map(entry=>entry.dataset.referenceNoteAgencyName);
  const text=normalizeSearch([work.fullTitle,work.client,work.category,work.eventCity,...agencies,...noteAgencies,...notes].join(' '));
  const matches=(!referenceView.agency||workAgencies(work).includes(referenceView.agency))&&(!referenceView.onlyNotes||notes.some(note=>note.trim()))&&words.every(word=>text.includes(word));
  card.hidden=!matches;if(matches)visible++;
  syncReferenceNoteMatch(card);
 });
 host.querySelector('[data-reference-count]').textContent=`Показано ${visible} из ${works.length}`;
 host.querySelector('[data-reference-empty]').hidden=visible!==0;
 host.querySelector('[data-clear-references]').disabled=!referenceView.query&&!referenceView.agency&&!referenceView.onlyNotes;
 syncReferenceBatch(host);
}
async function removeReferenceBatch(slugs){
 try{
  const current=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]')),selected=new Set(slugs),removed=current.flatMap((slug,index)=>selected.has(slug)?[{slug,index}]:[]);
  if(!removed.length){saved=current;sync();await renderReferences();announce('Выбранных примеров уже нет в подборке.');return true;}
  const next=current.filter(slug=>!selected.has(slug));localStorage.setItem(REFERENCE_KEY,JSON.stringify(next));saved=next;removedReferences=removed;sync();await renderReferences();
  if(removedReferences===removed){announce('Убрано примеров: '+removed.length+'. Заметки сохранены.',true);status.querySelector('[data-undo-reference]')?.focus({preventScroll:true});}
  return true;
 }catch{announce('Не удалось убрать примеры. Проверьте доступ к хранилищу браузера.');return false;}
}
async function renderReferences(){
 if(location.pathname.replace(/\/$/,'')!=='/my-project')return;
 let host=document.getElementById('work-references');if(!host){host=document.createElement('section');host.id='work-references';host.className='saved-references';document.querySelector('main').append(host);}
 const version=++renderVersion;
 try{data ||= await fetch('/custom/catalog-data.json').then(r=>{if(!r.ok)throw Error();return r.json();});
 if(version!==renderVersion)return;
 let notes={},selection=[];try{const draft=readDraft(localStorage);notes=draft.workNotes;selection=draft.selection;}catch{}
 const pendingNoteKeys=Object.keys(noteClearController.getPendingNotes()),noteDescriptions={...notes};
 for(const key of pendingNoteKeys)if(!Object.hasOwn(noteDescriptions,key))noteDescriptions[key]='';
 const noteMarkup=p=>`<div class="reference-notes" id="reference-note-block-${esc(p.slug)}">${referenceNotesForWork(p,noteDescriptions,data.agencies,{includeEmptyKeys:pendingNoteKeys}).map(noteEntryMarkup).join('')}${noteChooserMarkup(p)}</div>`;
 const works=saved.map(slug=>data.projects.find(p=>p.slug===slug)).filter(Boolean);
 const agencySlugs=new Set(works.flatMap(workAgencies));
 const agencies=data.agencies.filter(agency=>agencySlugs.has(agency.slug)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
 if(referenceView.agency&&!agencies.some(agency=>agency.slug===referenceView.agency)){referenceView.agency='';rememberView();}
 const workLink=work=>'/work/'+esc(work.slug)+'?from=%2Fmy-project%23work-references';
 const teamAction=work=>{
  const teams=data.agencies.filter(agency=>workAgencies(work).includes(agency.slug));if(!teams.length)return '';
  const chosen=teams.length===1?teams[0].slug:selection.find(item=>item.workSlug===work.slug&&teams.some(team=>team.slug===item.agencySlug))?.agencySlug||'',name=teams.find(team=>team.slug===chosen)?.name||'';
  return `<div class="reference-team-choice">${teams.length>1?`<label for="reference-team-${esc(work.slug)}">Команда для сравнения</label><select id="reference-team-${esc(work.slug)}" data-reference-team-select><option value="">Выберите команду</option>${teams.map(team=>`<option value="${esc(team.slug)}"${team.slug===chosen?' selected':''}>${esc(team.name)}</option>`).join('')}</select>`:''}<button class="reference-team-add" type="button" data-reference-team data-save-agency="${esc(chosen)}" data-save-work="${esc(work.slug)}" data-agency-name="${esc(name)}" data-reference-note-agency="${esc(work.agencySlug)}"${chosen?'':' disabled'}>Добавить в сравнение</button></div>`;
 };
 host.innerHTML=`<div class="reference-heading"><div><span class="eyebrow">Вдохновение</span><h2 id="reference-title">Примеры для моего события</h2></div><a class="text-link" href="/catalog?view=projects">Найти ещё примеры ↗</a></div><p>Соберите настроение события: сохраняйте работы и отмечайте, что в них нравится. Чтобы передать пример вместе с заявкой, добавьте его в пожелания.</p>`+(works.length?`
  <div class="reference-filters" role="search" aria-label="Поиск в сохранённых примерах">
   <label class="reference-search">Найти в моих примерах<input id="reference-search" type="search" maxlength="200" placeholder="Название, агентство или ваша заметка" value="${esc(referenceView.query)}" aria-controls="saved-reference-grid"></label>
   <label>Агентство<select id="reference-agency" aria-controls="saved-reference-grid"><option value="">Все агентства</option>${agencies.map(agency=>`<option value="${esc(agency.slug)}"${agency.slug===referenceView.agency?' selected':''}>${esc(agency.name)}</option>`).join('')}</select></label>
   <button type="button" class="text-button" data-clear-references>Сбросить</button>
  </div>
  <div class="reference-view-bar"><div class="reference-view-switch" role="group" aria-label="Вид сохранённых примеров"><button type="button" data-reference-view="photos" aria-controls="saved-reference-grid">Фотосетка</button><button type="button" data-reference-view="notes" aria-controls="saved-reference-grid">С заметками</button></div><label class="reference-sort">Порядок<select id="reference-sort" aria-controls="saved-reference-grid">${[['recent','Сначала новые'],['earliest','Сначала добавленные'],['title','По названию'],['agency','По агентству']].map(([value,label])=>`<option value="${value}"${referenceView.sort===value?' selected':''}>${label}</option>`).join('')}</select></label><label class="reference-notes-filter"><input id="reference-only-notes" type="checkbox"${referenceView.onlyNotes?' checked':''} aria-controls="saved-reference-grid">Только с моими заметками</label><p class="reference-count" data-reference-count role="status" aria-live="polite" aria-atomic="true"></p></div>
  <div class="reference-grid" id="saved-reference-grid">${works.map(p=>`<article data-saved-reference="${esc(p.slug)}"><a class="reference-cover${p.hasPhotos?'':' reference-cover-empty'}" href="${workLink(p)}">${p.hasPhotos?`<img src="${esc(p.preview||p.thumb||p.image)}" alt="${esc(p.fullTitle)}" loading="lazy">`:'<span aria-hidden="true">↗</span><span>Работа без фотографий</span>'}</a><h3><a href="${workLink(p)}">${esc(p.fullTitle)}</a></h3><p class="reference-team">${esc(p.client)}</p>${teamAction(p)}<button type="button" class="reference-note-toggle" data-toggle-reference-note aria-controls="reference-note-block-${esc(p.slug)}" aria-expanded="false">Мои заметки <span data-reference-note-mark>+</span></button><div class="reference-note-match" hidden></div>${noteMarkup(p)}<button class="reference-remove" data-remove-reference="${esc(p.slug)}">Убрать пример</button></article>`).join('')}</div>
  <div class="reference-empty" data-reference-empty hidden><h3>Таких примеров пока нет</h3><p>Попробуйте другое слово, выберите все агентства или снимите фильтр заметок.</p><button class="secondary-action" type="button" data-reset-references>Показать все сохранённые</button></div>`:
  '<div class="reference-empty"><h3>Начните с того, что нравится</h3><p>Откройте любую работу в каталоге и нажмите «Сохранить как пример». Она появится здесь вместе с вашей личной заметкой.</p><a class="secondary-action" href="/catalog?view=projects">Выбрать первый пример ↗</a></div>');
 setupReferenceBatch(host,removeReferenceBatch);
 noteCopyController.sync(host);
 noteClearController.sync(host);
 if(works.length){
  const search=host.querySelector('#reference-search'),agency=host.querySelector('#reference-agency'),sort=host.querySelector('#reference-sort'),onlyNotes=host.querySelector('#reference-only-notes');
  host.querySelectorAll('[data-reference-team-select]').forEach(select=>select.addEventListener('change',()=>{const button=select.closest('.reference-team-choice').querySelector('[data-reference-team]');button.dataset.saveAgency=select.value;button.dataset.agencyName=data.agencies.find(agency=>agency.slug===select.value)?.name||'';button.disabled=!select.value;}));
  const apply=()=>{referenceView={...referenceView,query:search.value,agency:agency.value,sort:sort.value,onlyNotes:onlyNotes.checked};rememberView();filterReferences(host,works);};
  search.addEventListener('input',apply);agency.addEventListener('change',apply);onlyNotes.addEventListener('change',apply);
  sort.addEventListener('change',()=>{apply();sortReferences(host,works);});
  const reset=()=>{search.value='';agency.value='';onlyNotes.checked=false;apply();search.focus({preventScroll:true});};
  host.querySelector('[data-clear-references]').addEventListener('click',reset);
  host.querySelector('[data-reset-references]').addEventListener('click',reset);
  host.querySelectorAll('[data-reference-view]').forEach(button=>button.addEventListener('click',()=>{referenceView.mode=button.dataset.referenceView;rememberView();showReferenceMode(host);}));
  host.querySelectorAll('[data-toggle-reference-note]').forEach(button=>button.addEventListener('click',()=>{
   const card=button.closest('[data-saved-reference]');card.dataset.noteOpen=String(card.dataset.noteOpen!=='true');showReferenceMode(host);
   if(card.dataset.noteOpen==='true')card.querySelector('[data-work-note]')?.focus({preventScroll:true});
  }));
  host.querySelector('#saved-reference-grid').addEventListener('focusout',event=>{const card=event.target.closest('[data-saved-reference]');if(card&&!card.contains(event.relatedTarget)&&(referenceView.onlyNotes||referenceView.query))filterReferences(host,works);});
  host.querySelectorAll('[data-saved-reference]').forEach(card=>{syncReferenceNoteMark(card);syncReferenceNoteChooser(card,works.find(work=>work.slug===card.dataset.savedReference));});
  showReferenceMode(host);
  sortReferences(host,works);
  filterReferences(host,works);
 }
 if(!shownReferences&&location.hash==='#work-references')host.scrollIntoView({block:'start'});
 shownReferences=true;
 }catch{host.innerHTML='<h2 id="reference-title">Примеры для моего события</h2><p>Не удалось загрузить работы.</p><button data-retry-references>Попробовать снова</button>';}
}
function handleReferenceNoteUpdate(event){
 const field=event.target.closest('[data-work-note]');if(!field||!data||location.pathname.replace(/\/$/,'')!=='/my-project')return;
 const workSlug=field.dataset.noteWork,agencySlug=field.dataset.workNote;
 // Wait for the shared note editor to save and synchronize matching fields first.
 queueMicrotask(()=>{
  const host=document.getElementById('work-references'),card=[...(host?.querySelectorAll('[data-saved-reference]')||[])].find(item=>item.dataset.savedReference===workSlug);
  const work=data.projects.find(item=>item.slug===workSlug),container=card?.querySelector('.reference-notes');if(!work||!container)return;
  const notes=currentNoteValues(workSlug,field);
  const present=new Set(noteFields(card).map(other=>workNoteKey(other.dataset.workNote,other.dataset.noteWork)));
  referenceNotesForWork(work,notes,data.agencies).forEach(entry=>{if(!present.has(entry.key)){insertReferenceNote(card,entry);present.add(entry.key);}});
  noteFields(card).forEach(other=>{if(other!==field&&other.dataset.workNote===agencySlug&&other.value!==field.value)other.value=field.value;});
  syncReferenceNoteMark(card);
  noteCopyController.sync(card);
  noteClearController.sync(card);
  syncReferenceNoteChooser(card,work);
  syncReferenceNoteMatch(card);
 });
}
document.addEventListener('input',handleReferenceNoteUpdate);
document.addEventListener('ea:work-note-updated',handleReferenceNoteUpdate);

document.addEventListener('change',event=>{
 const select=event.target.closest('[data-reference-note-team]');if(!select||!data)return;
 const card=select.closest('[data-saved-reference]'),work=data.projects.find(item=>item.slug===card?.dataset.savedReference);
 if(card&&work)syncReferenceNoteChooser(card,work);
});

document.addEventListener('click',async event=>{
 const openMatch=event.target.closest('[data-open-reference-note-match]');
 if(openMatch){
  event.preventDefault();const card=openMatch.closest('[data-saved-reference]'),host=card?.closest('#work-references');if(!card||!host||card.hidden)return;
  const key=openMatch.dataset.referenceNoteMatchKey,field=noteFields(card).find(field=>workNoteKey(field.dataset.workNote,field.dataset.noteWork)===key);
  const item=referenceNoteSearchItems(card).find(item=>item.key===key),match=item?findReferenceNoteMatch([item],referenceView.query,{limit:180}):null;
  if(!field||!match){syncReferenceNoteMatch(card);return;}
  card.dataset.noteOpen='true';showReferenceMode(host);field.scrollIntoView({block:'nearest'});field.focus({preventScroll:true});field.setSelectionRange(match.start,match.end);return;
 }
 const addNote=event.target.closest('[data-add-reference-team-note]');
 if(addNote){
  event.preventDefault();const card=addNote.closest('[data-saved-reference]'),work=data?.projects.find(item=>item.slug===card?.dataset.savedReference),select=card?.querySelector('[data-reference-note-team]');
  if(!card||!work||!select)return;
  const agencySlug=select.value,existing=noteFields(card).find(field=>field.dataset.workNote===agencySlug&&field.dataset.noteWork===work.slug);
  if(existing){syncReferenceNoteChooser(card,work);existing.scrollIntoView({block:'nearest'});existing.focus({preventScroll:true});return;}
  const entry=referenceNoteForTeam(work,agencySlug,currentNoteValues(work.slug),data.agencies);
  if(!entry){syncReferenceNoteChooser(card,work);return;}
  const field=insertReferenceNote(card,entry);syncReferenceNoteMark(card);noteCopyController.sync(card);noteClearController.sync(card);syncReferenceNoteChooser(card,work);syncReferenceNoteMatch(card);field?.scrollIntoView({block:'nearest'});field?.focus({preventScroll:true});return;
 }
 if(event.target.closest('[data-dismiss-reference]')){clearTimeout(timer);status.replaceChildren();removedReferences=null;return;}
 if(event.target.closest('[data-undo-reference]')&&removedReferences){
  try{
   const current=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]')),removed=removedReferences.filter(item=>!current.includes(item.slug));
   if(!removed.length){saved=current;removedReferences=null;sync();announce('Эти примеры уже сохранены.');return;}
   if(current.length+removed.length>200){announce('Для возврата примеров освободите ещё '+(current.length+removed.length-200)+' мест в подборке.',true);return;}
   const next=[...current];removed.sort((a,b)=>a.index-b.index).forEach(item=>next.splice(Math.min(item.index,next.length),0,item.slug));
   localStorage.setItem(REFERENCE_KEY,JSON.stringify(next));saved=next;removedReferences=null;sync();await renderReferences();announce(removed.length===1?'Пример возвращён вместе с личной заметкой.':'Примеры возвращены вместе с личными заметками: '+removed.length+'.');
   const heading=document.querySelector('#work-references h2');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
  }catch{announce('Не удалось вернуть пример. Попробуйте ещё раз.',true);}
  return;
 }
 if(event.target.closest('[data-retry-references]')){renderReferences();return;}
 const b=event.target.closest('[data-reference-work],[data-remove-reference]');if(!b)return;
 event.preventDefault();const slug=b.dataset.referenceWork||b.dataset.removeReference,index=saved.indexOf(slug);const remove=index>=0;const next=remove?saved.filter(s=>s!==slug):normalizeReferences([...saved,slug]);
 if(!remove&&!next.includes(slug)){announce('Сохранено 200 примеров. Уберите один, чтобы добавить новый.');return;}
 try{localStorage.setItem(REFERENCE_KEY,JSON.stringify(next));saved=next;removedReferences=remove?[{slug,index}]:null;sync();await renderReferences();announce(remove?'Пример убран.':'Работа сохранена в «Моём проекте». Агентство не добавлено.',remove);if(b.dataset.removeReference)status.querySelector('[data-undo-reference]')?.focus({preventScroll:true});}catch{announce('Не удалось сохранить пример. Проверьте доступ к хранилищу браузера.');}
});
addEventListener('storage',event=>{if(event.key===REFERENCE_KEY||event.key===null){try{saved=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]'));sync();renderReferences();}catch{}}});
document.addEventListener('ea:project-copy-restored',()=>{
 try{saved=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]'));removedReferences=null;clearTimeout(timer);status.replaceChildren();referenceView={...referenceView,query:'',agency:'',onlyNotes:false};rememberView();sync();renderReferences();}catch{}
});
new MutationObserver(changes=>{if(changes.some(c=>[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-reference-work]')||n.querySelector?.('[data-reference-work]')))))sync();}).observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
const back=document.querySelector('[data-case-back]');if(back){try{const from=new URLSearchParams(location.search).get('from');const url=new URL(from||'/catalog?view=projects',location.origin);url.pathname=url.pathname.replace(/\/$/,'')||'/';if(url.origin===location.origin&&(/^\/agency\/[a-z0-9-]+$/.test(url.pathname)||url.pathname==='/catalog'||url.pathname==='/my-project')){back.href=url.pathname+url.search+url.hash;back.textContent=url.pathname.startsWith('/agency/')?'← К работам агентства':url.pathname==='/my-project'?'← В мой проект':'← К работам';}}catch{}}
sync();renderReferences();
