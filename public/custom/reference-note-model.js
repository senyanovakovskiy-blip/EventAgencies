import {normalizeDraft,workNoteKey} from './project-store.js';

const validSlug=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** Describe personal notes without removing entries missing from today's catalog. */
export function referenceNotesForWork(work,notes,agencies=[]){
 const workSlug=work?.slug;
 if(!validSlug(workSlug))return [];
 const workNotes=normalizeDraft({version:1,workNotes:notes}).workNotes;
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
  .filter(([key,note])=>key!==primaryKey&&key.split('/')[1]===workSlug&&note.trim())
  .map(([key,note])=>describe(key,note))
  .sort((left,right)=>left.agencyName.localeCompare(right.agencyName,'ru')||left.key.localeCompare(right.key,'ru'));
 return primaryKey?[describe(primaryKey,workNotes[primaryKey]??''),...others]:others;
}
