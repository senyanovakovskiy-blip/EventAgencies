import {emptyDraft,normalizeDraft,normalizeSelection} from './project-store.js';
import {normalizeReferences} from './reference-store.js';
import {canonicalWorkNoteKey,canonicalWorkSlug} from './project-aliases.js';
const validSlug=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const validSelectionInput=selection=>{
 const seen=new Set();
 return selection.every(item=>{
  if(!item||!validSlug(item.agencySlug)||seen.has(item.agencySlug))return false;
  seen.add(item.agencySlug);
  return item.workSlug===null||validSlug(item.workSlug);
 });
};
const validReferenceInput=references=>{
 const seen=new Set();
 return references.every(slug=>{if(!validSlug(slug)||seen.has(slug))return false;seen.add(slug);return true;});
};

export function makeProjectCopy(draft,references,{includeNotes=true,includeContact=false}={}){
 const normalized=normalizeDraft(draft),saved=normalizeReferences(references),works=new Set(saved);
 normalized.request=null;
 const selectedNotes=new Set(normalized.selection.filter(item=>item.workSlug).map(item=>canonicalWorkNoteKey(item.agencySlug+'/'+item.workSlug)));
 normalized.workNotes=includeNotes?Object.fromEntries(Object.entries(normalized.workNotes).filter(([key])=>{const canonicalKey=canonicalWorkNoteKey(key),workSlug=canonicalWorkSlug(key.split('/')[1]);return works.has(workSlug)||selectedNotes.has(canonicalKey);})):{};
 if(!includeContact)normalized.contact=emptyDraft().contact;
 return {version:1,draft:normalized,references:saved,includeNotes:Boolean(includeNotes),includeContact:Boolean(includeContact)};
}
export function normalizeProjectCopy(value){
 if(!value||value.version!==1||typeof value.includeNotes!=='boolean'||typeof value.includeContact!=='boolean'||!value.draft||value.draft.version!==1||value.draft.request!==null||!Array.isArray(value.references)||value.references.length>200||!Array.isArray(value.draft.selection)||value.draft.selection.length>3)return null;
 const draft=value.draft;
 if(!draft.brief||!draft.contact||!draft.workNotes||typeof draft.workNotes!=='object'||Array.isArray(draft.workNotes)||Object.keys(draft.workNotes).length>400)return null;
 const rawSelection=draft.selection,rawReferences=value.references;
 if(!validSelectionInput(rawSelection)||!validReferenceInput(rawReferences))return null;
 const noteEntries=Object.entries(draft.workNotes);
 if(!noteEntries.every(([key,note])=>{const parts=key.split('/');return parts.length===2&&parts.every(validSlug)&&typeof note==='string'&&note.length<=1000;}))return null;
 if(!value.includeNotes&&noteEntries.length)return null;
 const canonicalSelection=normalizeSelection(rawSelection),canonicalReferences=normalizeReferences(rawReferences);
 const selectedNotes=new Set(canonicalSelection.filter(item=>item.workSlug).map(item=>canonicalWorkNoteKey(item.agencySlug+'/'+item.workSlug)));
 const referenceWorks=new Set(canonicalReferences);
 const noteIsIncluded=key=>{const canonicalKey=canonicalWorkNoteKey(key),workSlug=canonicalWorkSlug(key.split('/')[1]);return referenceWorks.has(workSlug)||selectedNotes.has(canonicalKey);};
 if(value.includeNotes&&noteEntries.some(([key])=>!noteIsIncluded(key)))return null;
 const copy=makeProjectCopy(draft,value.references,value),clean=copy.draft;
 if(copy.references.length!==canonicalReferences.length||copy.references.some((slug,index)=>slug!==canonicalReferences[index])||clean.selection.length!==canonicalSelection.length)return null;
 if(clean.selection.some((item,index)=>item.agencySlug!==canonicalSelection[index]?.agencySlug||item.workSlug!==canonicalSelection[index]?.workSlug))return null;
 if(Object.keys(clean.brief).some(key=>clean.brief[key]!==draft.brief[key])||Object.keys(clean.contact).some(key=>clean.contact[key]!==draft.contact[key]))return null;
 const expectedNotes=value.includeNotes?Object.fromEntries(Object.entries(normalizeDraft(draft).workNotes).filter(([key])=>noteIsIncluded(key))):{};
 if(Object.keys(clean.workNotes).length!==Object.keys(expectedNotes).length||Object.entries(expectedNotes).some(([key,note])=>clean.workNotes[key]!==note))return null;
 return copy;
}
export function copySummary(copy){
 return {format:copy.draft.brief.format,city:copy.draft.brief.city,date:copy.draft.brief.date,dateUnknown:copy.draft.brief.dateUnknown,teams:copy.draft.selection.length,references:copy.references.length,notes:Object.values(copy.draft.workNotes).filter(note=>note.trim()).length,includeContact:copy.includeContact};
}
