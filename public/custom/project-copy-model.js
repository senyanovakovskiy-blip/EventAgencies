import {emptyDraft,normalizeDraft} from './project-store.js';
import {normalizeReferences} from './reference-store.js';

export function makeProjectCopy(draft,references,{includeNotes=true,includeContact=false}={}){
 const normalized=normalizeDraft(draft),saved=normalizeReferences(references),works=new Set(saved);
 normalized.request=null;
 normalized.workNotes=includeNotes?Object.fromEntries(Object.entries(normalized.workNotes).filter(([key])=>{const [agencySlug,workSlug]=key.split('/');return works.has(workSlug)||normalized.selection.some(item=>item.agencySlug===agencySlug&&item.workSlug===workSlug);})):{};
 if(!includeContact)normalized.contact=emptyDraft().contact;
 return {version:1,draft:normalized,references:saved,includeNotes:Boolean(includeNotes),includeContact:Boolean(includeContact)};
}
export function normalizeProjectCopy(value){
 if(!value||value.version!==1||typeof value.includeNotes!=='boolean'||typeof value.includeContact!=='boolean'||!value.draft||value.draft.version!==1||value.draft.request!==null||!Array.isArray(value.references)||value.references.length>200||!Array.isArray(value.draft.selection)||value.draft.selection.length>3)return null;
 const draft=value.draft;
 if(!draft.brief||!draft.contact||!draft.workNotes||typeof draft.workNotes!=='object'||Array.isArray(draft.workNotes)||Object.keys(draft.workNotes).length>400)return null;
 const copy=makeProjectCopy(draft,value.references,value),clean=copy.draft;
 if(copy.references.length!==value.references.length||copy.references.some((slug,index)=>slug!==value.references[index])||clean.selection.length!==draft.selection.length)return null;
 if(clean.selection.some((item,index)=>item.agencySlug!==draft.selection[index]?.agencySlug||item.workSlug!==draft.selection[index]?.workSlug))return null;
 if(Object.keys(clean.brief).some(key=>clean.brief[key]!==draft.brief[key])||Object.keys(clean.contact).some(key=>clean.contact[key]!==draft.contact[key]))return null;
 if(Object.keys(clean.workNotes).length!==Object.keys(draft.workNotes).length||Object.entries(draft.workNotes).some(([key,note])=>typeof note!=='string'||clean.workNotes[key]!==note))return null;
 return copy;
}
export function copySummary(copy){
 return {format:copy.draft.brief.format,city:copy.draft.brief.city,date:copy.draft.brief.date,dateUnknown:copy.draft.brief.dateUnknown,teams:copy.draft.selection.length,references:copy.references.length,notes:Object.values(copy.draft.workNotes).filter(note=>note.trim()).length,includeContact:copy.includeContact};
}
