import {searchTerms} from './catalog-search.js';

const workFits=(work,filters)=>(!filters.format||work.types?.includes(filters.format))&&(!filters.occasion||work.occasions?.includes(filters.occasion))&&(!filters.photos||work.hasPhotos);

// Agency location means the team's city; project location means the event's city.
// Format, occasion, photographs and query must be supported by the SAME work.
export function buildCatalogMatches(data,search){
 const worksByAgency=new Map();
 for(const work of data.projects){
  for(const slug of new Set([work.agencySlug,...(work.agencySlugs||[])].filter(Boolean))){
   if(!worksByAgency.has(slug))worksByAgency.set(slug,[]);
   worksByAgency.get(slug).push(work);
  }
 }
 return {
  agency(agency,filters){
   const terms=searchTerms(filters.query),hasWorkFilters=Boolean(filters.format||filters.occasion||filters.photos);
   const works=(worksByAgency.get(agency.slug)||[]).filter(work=>workFits(work,filters)&&(!terms.length||search.searchAgencyWork(agency.slug,work.slug,terms).matches));
   const direct=search.searchAgencyOwn(agency.slug,terms).matches;
   const matches=(!filters.scope||filters.scope===agency.slug)&&(!filters.city||filters.city===agency.city)&&(hasWorkFilters?works.length>0:!terms.length||direct||works.length>0);
   return {matches,works,contextual:Boolean(terms.length||hasWorkFilters)};
  },
  work(work,filters){
   return (!filters.scope||[work.agencySlug,...(work.agencySlugs||[])].includes(filters.scope))&&(!filters.city||work.eventCity===filters.city)&&workFits(work,filters)&&search.searchWork(work.slug,filters.query).matches;
  }
 };
}
