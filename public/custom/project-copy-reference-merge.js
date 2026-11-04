import {normalizeDraft} from './project-store.js';
import {normalizeReferences} from './reference-store.js';

const REFERENCE_LIMIT=200;
// Validate each slug without the store's list cap so overflow stays visible.
const allReferences=value=>Array.isArray(value)?[...new Set(value.flatMap(slug=>normalizeReferences([slug])))]:[];

/** Add available copy references and missing notes without replacing current work. */
export function mergeCopyReferences({current,currentReferences,incoming,referenceSelection=null,includeReferenceNotes=true,referenceNoteSelection=null}){
 const draft=normalizeDraft(current),source=normalizeDraft(incoming?.draft);
 const references=allReferences(currentReferences),sourceReferences=allReferences(incoming?.references);
 const selectedSlugs=referenceSelection==null?null:new Set(allReferences(referenceSelection));
 const incomingReferences=selectedSlugs?sourceReferences.filter(slug=>selectedSlugs.has(slug)):sourceReferences;
 const currentSlugs=new Set(references),incomingSlugs=new Set(incomingReferences);
 let addedReferences=0,existingReferences=0,addedNotes=0,conflictingNotes=0;
 for(const slug of incomingReferences){
  if(currentSlugs.has(slug)){existingReferences++;continue;}
  references.push(slug);
  currentSlugs.add(slug);
  addedReferences++;
 }
 if(includeReferenceNotes===true&&incoming?.includeNotes===true){
  const selectedNoteKeys=referenceNoteSelection==null?null:new Set(Array.isArray(referenceNoteSelection)?referenceNoteSelection.filter(key=>typeof key==='string'&&Object.hasOwn(source.workNotes,key)):[]);
  for(const [key,note] of Object.entries(source.workNotes)){
   if(!note.trim()||!incomingSlugs.has(key.split('/')[1])||(selectedNoteKeys&&!selectedNoteKeys.has(key)))continue;
   if(Object.hasOwn(draft.workNotes,key)){
    if(draft.workNotes[key]!==note)conflictingNotes++;
    continue;
   }
   draft.workNotes[key]=note;
   addedNotes++;
  }
 }
 const mergeSummary={addedReferences,existingReferences,addedNotes,conflictingNotes,totalReferences:references.length,limit:REFERENCE_LIMIT,overflowCount:Math.max(0,references.length-REFERENCE_LIMIT)};
 if(mergeSummary.overflowCount)throw Object.assign(new Error('copy_references_limit'),{code:'copy_references_limit',summary:mergeSummary});
 draft.request=null;
 return {version:1,draft,references,includeNotes:true,includeContact:false,mergeSummary};
}
