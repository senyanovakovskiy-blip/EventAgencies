import {canonicalWorkSlug} from './project-aliases.js';
export const REFERENCE_KEY='eventagencies-work-references-v1';
const validSlug=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export function normalizeReferences(value){return Array.isArray(value)?[...new Set(value.filter(validSlug).map(canonicalWorkSlug))].slice(0,200):[];}
export function hasLegacyReferenceAliases(value){return Array.isArray(value)&&value.length<=200&&value.every(validSlug)&&new Set(value).size===value.length&&value.some(slug=>canonicalWorkSlug(slug)!==slug);}
export function readStoredReferences(storage){
  const raw=storage.getItem(REFERENCE_KEY),value=raw?JSON.parse(raw):[],references=normalizeReferences(value);
 if(hasLegacyReferenceAliases(value)){
  const next=JSON.stringify(references);
  if(next!==raw)try{if(storage.getItem(REFERENCE_KEY)===raw)storage.setItem(REFERENCE_KEY,next);}catch{}
 }
 return references;
}
