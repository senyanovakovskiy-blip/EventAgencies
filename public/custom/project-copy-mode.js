import {emptyDraft,normalizeDraft} from './project-store.js';
import {normalizeReferences} from './reference-store.js';

/** Build an effective snapshot for restoreProjectCopy without changing either source. */
export function copyForLoad({current,currentReferences,incoming,scope='full'}){
 const source=normalizeDraft(incoming?.draft);
 source.request=null;
 const references=normalizeReferences(incoming?.references);
 if(scope==='event'){
  const original=normalizeDraft(current);
  return {
   version:1,
   draft:{...emptyDraft(),brief:source.brief,selection:original.selection},
   references:normalizeReferences(currentReferences),
   includeNotes:false,
   includeContact:false
  };
 }
 return {
  version:1,
  draft:source,
  references,
  includeNotes:Boolean(incoming?.includeNotes),
  includeContact:Boolean(incoming?.includeContact)
 };
}
