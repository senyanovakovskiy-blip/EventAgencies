import {normalizeDraft,workNoteKey} from './project-store.js';
import {copySummary} from './project-copy-model.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const workLink=work=>'/work/'+esc(work.slug)+'?from=%2Fmy-project';
const photo=work=>work?.hasPhotos&&(work.preview||work.reelMobile||work.image);
const noteMarkup=note=>note?.trim()?`<details class="copy-preview-note"><summary>Моя заметка</summary><p>${esc(note)}</p></details>`:'';

export function prepareCopyPreview(snapshot,data,{preserveAll=false}={}){
 const agencies=new Map(data.agencies.map(agency=>[agency.slug,agency])),works=new Map(data.projects.map(work=>[work.slug,work]));
 const workFor=(agencySlug,workSlug)=>{const work=works.get(workSlug);return work&&(work.agencySlug===agencySlug||work.agencySlugs?.includes(agencySlug))?work:null;};
 const issues={teams:0,selectedWorks:0,references:0,notes:0};
 const teams=snapshot.draft.selection.map(selection=>{
  const agency=agencies.get(selection.agencySlug),work=workFor(selection.agencySlug,selection.workSlug);
  if(!agency)issues.teams++;else if(selection.workSlug&&!work)issues.selectedWorks++;
  return {selection,agency,work,note:snapshot.draft.workNotes[workNoteKey(selection.agencySlug,selection.workSlug)]||''};
 });
 const references=snapshot.references.map(slug=>{
  const work=works.get(slug);if(!work)issues.references++;
  const notes=Object.entries(snapshot.draft.workNotes).filter(([key,note])=>key.split('/')[1]===slug&&note.trim()).map(([key,note])=>({agency:agencies.get(key.split('/')[0])?.name,note}));
  return {slug,work,notes};
 });
 const draft=normalizeDraft(snapshot.draft);draft.request=null;
 draft.selection=teams.filter(item=>item.agency).map(item=>({...item.selection,workSlug:item.work?item.work.slug:null}));
 draft.workNotes=Object.fromEntries(Object.entries(draft.workNotes).filter(([key,note])=>{const [agencySlug,workSlug]=key.split('/');const available=agencies.has(agencySlug)&&Boolean(workFor(agencySlug,workSlug));if(!available&&note.trim())issues.notes++;return available;}));
 const loadSnapshot=preserveAll?snapshot:{...snapshot,draft,references:references.filter(item=>item.work).map(item=>item.slug)};
 return {teams,references,issues,hasMissing:Object.values(issues).some(Boolean),preserveAll,loadSnapshot,loadSummary:copySummary(loadSnapshot)};
}

export function copyAvailabilityMarkup(prepared){
 if(!prepared?.hasMissing)return '';
 const labels={teams:'Команды',selectedWorks:'Выбранные работы',references:'Сохранённые примеры',notes:'Заметки к недоступным работам'};
 return `<aside class="copy-availability-note"><strong>Часть подборки больше не доступна в каталоге</strong><ul>${Object.entries(prepared.issues).filter(([,count])=>count).map(([key,count])=>`<li>${labels[key]}: ${count}</li>`).join('')}</ul><p>${prepared.preserveAll?'Предыдущий вариант будет восстановлен целиком, как был сохранён в этом браузере.':`При загрузке останутся доступные элементы: команд — ${prepared.loadSummary.teams}, примеров — ${prepared.loadSummary.references}. Полная копия сохранится в аккаунте.`}</p></aside>`;
}

export function copyTeamsMarkup(teams){
 if(!teams.length)return '<p class="copy-preview-empty">Команды не выбраны.</p>';
 return `<ol class="copy-preview-teams">${teams.map((item,index)=>`<li><span class="copy-preview-priority">${String(index+1).padStart(2,'0')}</span><div><strong>${esc(item.agency?.name||'Команда больше недоступна')}</strong>${item.work?`<a class="copy-preview-work" href="${workLink(item.work)}" target="_blank" rel="noopener noreferrer">${photo(item.work)?`<img src="${esc(photo(item.work))}" alt="" width="80" height="60" loading="lazy">`:''}<span>${esc(item.work.fullTitle)} ↗</span></a>`:`<p class="copy-preview-empty">${item.selection.workSlug?'Выбранная работа больше недоступна.':'Работа не выбрана.'}</p>`}${noteMarkup(item.note)}</div></li>`).join('')}</ol>`;
}

export function copyReferenceCards(references,start=0,limit=6){
 return references.slice(start,start+limit).map((item,offset)=>`<article class="copy-reference-card" data-copy-reference-index="${start+offset}" tabindex="-1">${item.work?`<a href="${workLink(item.work)}" target="_blank" rel="noopener noreferrer"><div class="copy-reference-photo">${photo(item.work)?`<img src="${esc(photo(item.work))}" alt="" width="240" height="180" loading="lazy">`:'<span>Работа без фотографий</span>'}</div><h5>${esc(item.work.fullTitle)} ↗</h5></a>`:'<div class="copy-reference-photo"><span>Пример больше недоступен</span></div><h5>Сохранённый пример</h5>'}${item.notes.map(({agency,note})=>`<details class="copy-preview-note"><summary>${agency?'Заметка · '+esc(agency):'Моя заметка'}</summary><p>${esc(note)}</p></details>`).join('')}</article>`).join('');
}

export function copyReferencesMarkup(references){
 if(!references.length)return '<p class="copy-preview-empty">Примеры не сохранены.</p>';
 return `<details class="copy-preview-references"><summary>Посмотреть примеры · ${references.length}</summary><div class="copy-reference-grid" data-copy-reference-grid>${copyReferenceCards(references)}</div>${references.length>6?`<button class="secondary-action" type="button" data-more-copy-references>Показать ещё ${Math.min(6,references.length-6)}</button>`:''}</details>`;
}
