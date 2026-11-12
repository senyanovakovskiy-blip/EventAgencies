import {workNoteKey} from './project-store.js';
import {canonicalWorkNoteKey} from './project-aliases.js';

/** Resolve a saved choice without replacing or fabricating catalog entities. */
export function selectionView(data,s,notes={}){
 const a=data.agencies.find(agency=>agency.slug===s.agencySlug)||null;
 const work=s.workSlug?data.projects.find(work=>work.slug===s.workSlug)||null:null;
 const linked=Boolean(work&&(work.agencySlug===s.agencySlug||work.agencySlugs?.includes(s.agencySlug)));
 const p=a&&linked?work:null;
 const workStatus=!s.workSlug?'Работа не выбрана':!a?'Профиль команды недоступен. Сохранённый выбор работы остаётся в проекте.':!work?'Выбранная работа недоступна в каталоге':!linked?'Прежняя работа больше не связана с этой командой':'';
 const note=s.workSlug?notes[workNoteKey(s.agencySlug,s.workSlug)]||'':'';
 const legacyKey='intelsport-bb868/portfolio-intelsport-bb868-8bf1feb',legacyNote=s.workSlug&&canonicalWorkNoteKey(legacyKey)===canonicalWorkNoteKey(workNoteKey(s.agencySlug,s.workSlug))?notes[legacyKey]||'':'';
 return {s,a,p,work,workStatus,label:a?.name||'Недоступная команда · '+s.agencySlug,note:note||legacyNote,legacyNote:note&&legacyNote&&note!==legacyNote?legacyNote:''};
}

/** A missing work is invalid only when a work was actually selected. */
export function selectionProblems(data,selection){
 return selection.map((s,index)=>({...selectionView(data,s),priority:index+1})).filter(({s,a,p})=>!a||Boolean(s.workSlug&&!p));
}
