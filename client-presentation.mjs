// Build-only boundary. Never import the operator catalogue into the public site.
// Explicit field lists keep future editorial/operator fields out of browser data.
const pick=(source,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(source,key)).map(key=>[key,source[key]]));
// The last three agency fields and role/guestLabel remain the existing public
// facts used by comparison and exports; these do not come from operatorCatalog.
const agencyFields='slug name city types website works caseCount photoCount cover coverWork geography services budgetConditions duplicateOf'.split(' ');
const workFields='slug title fullTitle year eventDate category format client agencySlug agencySlugs agencyUrl types industry role source sources image imageMobile ogImage thumb hasPhotos photoCount caseId duplicateOf kind gradient curated reelTitle featured reelImage reelMobile imageRatio eventCity guestLabel occasions preview imageWidth imageHeight previewSrcSet'.split(' ');
const copy=(entries,slug)=>{
 const value=entries?.[slug];
 if(!value||['lead','intro','fit'].some(key=>typeof value[key]!=='string'||!value[key].trim()))throw Error('Client presentation missing: '+slug);
 return pick(value,['lead','intro','fit','participation','place','discussionPrompts']);
};
export function presentCatalog(catalog,presentation){
 // Keep superseded slugs in the project map so saved selections and old work links still resolve,
 // but offer each linked project only once in the catalog and agency profile.
 const duplicateSlugs=new Set(catalog.projects.filter(p=>p.duplicateOf).map(p=>p.slug));
 const projects=catalog.projects.map(p=>{
  const text=copy(presentation.works,p.slug);
  return {...pick(p,workFields),presentation:text,summary:text.lead};
 });
 const projectBySlug=new Map(projects.map(p=>[p.slug,p]));
 const publishedProjects=projects.filter(p=>!p.duplicateOf);
 const publishedAgencies=catalog.agencies.filter(a=>!a.duplicateOf);
 const sumPhotos=items=>items.reduce((total,p)=>{const count=Number(p?.photoCount);return total+(Number.isFinite(count)&&count>0?count:0);},0);
 return {
  types:catalog.types,
  stats:{agencies:publishedAgencies.length,cases:publishedProjects.filter(p=>p.kind==='case').length,photos:sumPhotos(publishedProjects),works:publishedProjects.length},
  agencies:catalog.agencies.map(a=>{
   const text=copy(presentation.agencies,a.slug);
   const works=a.works.filter(slug=>!duplicateSlugs.has(slug)&&projectBySlug.has(slug));
   const visibleProjects=works.map(slug=>projectBySlug.get(slug));
   const caseCount=visibleProjects.filter(p=>p.kind==='case').length,photoCount=sumPhotos(visibleProjects);
   return {...pick(a,agencyFields),works,caseCount,photoCount,presentation:text,description:text.lead+' '+text.intro};
  }),
  projects
 };
}
// Only photographs enter the page from the full source record, never its dossier.
export function publicGallery(project){return (project.gallery||[]).filter(item=>item.type==='image').map(item=>pick(item,['type','src','alt']));}
