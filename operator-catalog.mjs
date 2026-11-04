import caseDetails from './content/case-details.json' with {type:'json'};

// Server-only projection. Never import this module into a public page/bundle or
// copy this payload to public/custom/catalog-data.json.
export function operatorCatalog(catalog,details=caseDetails){
 const text=value=>typeof value==='string'?value:'';
 return {
  types:catalog.types,
  agencies:catalog.agencies.map(a=>({
   slug:a.slug,name:a.name,city:a.city,types:a.types||[],website:text(a.website),
   geography:a.geography||'',services:a.services||'',budgetConditions:a.budgetConditions||'',
   rawDescription:text(a.description),
   works:catalog.projects.filter(p=>p.agencySlug===a.slug||p.agencySlugs?.includes(a.slug)).map(p=>p.slug)
  })),
  projects:catalog.projects.map(p=>{
   const detail=details[p.slug]||{};
   return {
    slug:p.slug,agencySlug:p.agencySlug,agencySlugs:p.agencySlugs||[],fullTitle:p.fullTitle,
    kind:p.kind,category:p.category,eventCity:text(p.eventCity),source:text(p.source),
    rawDescription:text(p.description),format:text(p.format),venue:text(p.industry),eventDate:text(p.eventDate),
    year:text(p.year),guestLabel:text(p.guestLabel),role:text(p.role),
    details:Object.fromEntries(['task','idea','role','result','source','reviewedAt'].map(key=>[key,text(detail[key])]))
   };
  })
 };
}
