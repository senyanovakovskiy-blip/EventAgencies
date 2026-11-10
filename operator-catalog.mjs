// Server-only projection. Never import this module into a public page/bundle or
// copy this payload to public/custom/catalog-data.json.
// Overlays must belong to the supplied catalogue. In particular, a fixture or a
// replacement catalogue must never inherit our production text by slug alone.
// The second argument keeps the existing explicit case-details contract; the
// third is the separate client-presentation document ({agencies, works}).
export function operatorCatalog(catalog,details={},presentation={}){
 const text=value=>typeof value==='string'?value:'';
 const publicCopy=(entries,slug)=>{
  const entry=entries&&Object.hasOwn(entries,slug)?entries[slug]:null;
  const copy=Object.fromEntries(['lead','intro','fit','participation'].map(key=>[key,text(entry?.[key])]));
  const discussionPrompts=Array.isArray(entry?.discussionPrompts)?entry.discussionPrompts.filter(value=>typeof value==='string'&&value.trim()).slice(0,3):[];
  return Object.values(copy).some(value=>value.trim())||discussionPrompts.length?{...copy,...(discussionPrompts.length?{discussionPrompts}:{})}:null;
 };
 return {
  types:catalog.types,
  agencies:catalog.agencies.map(a=>({
   slug:a.slug,name:a.name,city:a.city,types:a.types||[],website:text(a.website),
   geography:a.geography||'',services:a.services||'',budgetConditions:a.budgetConditions||'',
   rawDescription:text(a.description),
   presentation:publicCopy(presentation?.agencies,a.slug),
   works:catalog.projects.filter(p=>p.agencySlug===a.slug||p.agencySlugs?.includes(a.slug)).map(p=>p.slug)
  })),
  projects:catalog.projects.map(p=>{
   const detail=details&&Object.hasOwn(details,p.slug)?details[p.slug]||{}:{};
   return {
    slug:p.slug,agencySlug:p.agencySlug,agencySlugs:p.agencySlugs||[],fullTitle:p.fullTitle,
    kind:p.kind,category:p.category,eventCity:text(p.eventCity),source:text(p.source),
    rawDescription:text(p.description),format:text(p.format),venue:text(p.industry),eventDate:text(p.eventDate),
    presentation:publicCopy(presentation?.works,p.slug),
    year:text(p.year),guestLabel:text(p.guestLabel),role:text(p.role),
    details:Object.fromEntries(['task','idea','role','result','source','reviewedAt'].map(key=>[key,text(detail[key])]))
   };
  })
 };
}
