import {normalizeDraft,workNoteKey} from './project-store.js';
import {canonicalWorkNoteKey} from './project-aliases.js';

const validSlug=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export function hasScopedReferenceNote(notes,agencySlug=''){
 return (Array.isArray(notes)?notes:[]).some(item=>(!agencySlug||item?.agencySlug===agencySlug)&&typeof item?.note==='string'&&Boolean(item.note.trim()));
}

export function referenceNoteLabels(entry,work){
 const shared=new Set([work?.agencySlug,...(Array.isArray(work?.agencySlugs)?work.agencySlugs:[])].filter(Boolean)).size>1;
 const named=shared||!entry.isPrimary;
 return {
  label:named?'Моя заметка · '+entry.agencyName:'Моя заметка к примеру',
  context:named?'Личная запись для команды «'+entry.agencyName+'». Сохраняется в этом браузере.':'Личная заметка · сохраняется в этом браузере.'
 };
}

/** Describe an editor only for a real team linked to this work. */
export function referenceNoteForTeam(work,agencySlug,notes,agencies=[]){
 const workSlug=work?.slug;
 if(!validSlug(workSlug)||!validSlug(agencySlug))return null;
 const isPrimary=work.agencySlug===agencySlug;
 if(!isPrimary&&!(Array.isArray(work.agencySlugs)&&work.agencySlugs.includes(agencySlug)))return null;
 const agencyMap=new Map((Array.isArray(agencies)?agencies:[]).filter(agency=>validSlug(agency?.slug)).map(agency=>[agency.slug,agency]));
 const agency=agencyMap.get(agencySlug);if(!agency)return null;
 const key=workNoteKey(agencySlug,workSlug),workNotes=normalizeDraft({version:1,workNotes:notes}).workNotes;
 const agencyName=typeof agency.name==='string'?agency.name:agencySlug;
 const note=workNotes[key]??'',legacyKey='intelsport-bb868/portfolio-intelsport-bb868-8bf1feb',legacyNote=canonicalWorkNoteKey(legacyKey)===canonicalWorkNoteKey(key)?workNotes[legacyKey]||'':'';
 return {key,agencySlug,workSlug,note:note||legacyNote,legacyNote:note&&legacyNote&&note!==legacyNote?legacyNote:'',agencyName,isPrimary,canUseForWishes:true};
}

/** Describe personal notes without removing entries missing from today's catalog. */
export function referenceNotesForWork(work,notes,agencies=[],{includeEmptyKeys=[]}={}){
 const workSlug=work?.slug;
 if(!validSlug(workSlug))return [];
 const workNotes=normalizeDraft({version:1,workNotes:notes}).workNotes;
 const retainedKeys=new Set(Array.isArray(includeEmptyKeys)?includeEmptyKeys:[]);
 const primarySlug=validSlug(work.agencySlug)?work.agencySlug:null;
 const primaryKey=primarySlug?workNoteKey(primarySlug,workSlug):null;
 const agencyMap=new Map((Array.isArray(agencies)?agencies:[]).filter(agency=>validSlug(agency?.slug)).map(agency=>[agency.slug,agency]));
 const linkedAgencies=new Set((Array.isArray(work.agencySlugs)?work.agencySlugs:[]).filter(validSlug));
 if(primarySlug)linkedAgencies.add(primarySlug);
 const describe=(key,note)=>{
  const agencySlug=key.split('/')[0],agency=agencyMap.get(agencySlug);
  const agencyName=agency?(typeof agency.name==='string'?agency.name:agencySlug):'Команда вне каталога · '+agencySlug;
  return {key,agencySlug,workSlug,note,agencyName,isPrimary:key===primaryKey,canUseForWishes:Boolean(agency&&linkedAgencies.has(agencySlug))};
 };
 const others=Object.entries(workNotes)
  .filter(([key,note])=>key!==primaryKey&&key.split('/')[1]===workSlug&&(note.trim()||retainedKeys.has(key)))
  .map(([key,note])=>describe(key,note))
  .sort((left,right)=>left.agencyName.localeCompare(right.agencyName,'ru')||left.key.localeCompare(right.key,'ru'));
 if(!primaryKey)return others;
 const primary=describe(primaryKey,workNotes[primaryKey]??''),legacyKey='intelsport-bb868/portfolio-intelsport-bb868-8bf1feb',legacyNote=canonicalWorkNoteKey(legacyKey)===canonicalWorkNoteKey(primaryKey)?workNotes[legacyKey]||'':'';
 primary.legacyNote=primary.note&&legacyNote&&primary.note!==legacyNote?legacyNote:'';
 return [primary,...others];
}
