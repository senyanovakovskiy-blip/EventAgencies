const agencyAliases=Object.freeze({'intelsport-bb868':'intelsport'});
const workAliases=Object.freeze({'portfolio-intelsport-bb868-8bf1feb':'mts-sport'});

export const canonicalAgencySlug=slug=>agencyAliases[slug]||slug;
export const canonicalWorkSlug=slug=>workAliases[slug]||slug;
export const canonicalWorkNoteKey=key=>{
 const parts=String(key||'').split('/');
 return parts.length===2?canonicalAgencySlug(parts[0])+'/'+canonicalWorkSlug(parts[1]):key;
};
export function hasLegacyDraftIdentifiers(value){
 if(!value||value.version!==1)return false;
 if(Array.isArray(value.selection)&&value.selection.some(item=>canonicalAgencySlug(item?.agencySlug)!==item?.agencySlug||canonicalWorkSlug(item?.workSlug)!==item?.workSlug))return true;
 return Boolean(value.workNotes&&typeof value.workNotes==='object'&&!Array.isArray(value.workNotes)&&Object.keys(value.workNotes).some(key=>canonicalWorkNoteKey(key)!==key));
}
