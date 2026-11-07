// Search only published copy. Operator fields and personal notes stay outside
// this module; callers may add their local notes to the picker separately.
const presentationFields=[
 ['lead','Коротко'],
 ['intro','Описание'],
 ['fit','Если вам близко'],
 ['participation','Участие команды']
];
const publicText=value=>typeof value==='string'?value:'';
const hasSlug=value=>typeof value==='string'&&value.length>0;

export function normalizeSearchText(value){
 return String(value??'').normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/\s+/gu,' ').trim();
}

// Accept either a query or terms prepared once by the caller. Matching remains
// literal AND across the record: no stemming, fuzzy matching or ranking.
export function searchTerms(query){
 const text=normalizeSearchText(Array.isArray(query)?query.join(' '):query);
 return text?[...new Set(text.split(' '))]:[];
}

function field(label,value){
 const text=publicText(value);
 return text.trim()?{label,text}:null;
}

function publicFields(record){
 return presentationFields.map(([key,label])=>field(label,record?.presentation?.[key])).filter(Boolean);
}

export function publicPresentationText(record){
 return publicFields(record).map(item=>item.text).join(' ');
}

function makeIndex(fields){
 const entries=fields.filter(Boolean).map(item=>({...item,normalized:normalizeSearchText(item.text)}));
 return {entries,text:entries.map(item=>item.normalized).join(' ')};
}

function match(index,query){
 if(!index)return {matches:false,detail:null};
 const terms=searchTerms(query);
 const matches=terms.every(term=>index.text.includes(term));
 if(!matches||!terms.length)return {matches,detail:null};
 // Prefer one field containing the whole query when possible. Otherwise this
 // is one real source of the match, not a claim that it contains every term.
 const source=index.entries.find(item=>terms.every(term=>item.normalized.includes(term)))
  ||index.entries.find(item=>terms.some(term=>item.normalized.includes(term)));
 const {normalized,...detail}=source;
 return {matches:true,detail};
}

export function buildCatalogSearch(data){
 const projects=Array.isArray(data?.projects)?data.projects:[];
 const agencies=Array.isArray(data?.agencies)?data.agencies:[];
 const workIndexes=new Map(),agencyIndexes=new Map(),ownIndexes=new Map(),linkedFields=new Map(),ownedWorkFields=new Map();

 for(const work of projects){
  if(!hasSlug(work?.slug))continue;
  const copy=publicFields(work);
  workIndexes.set(work.slug,makeIndex([
   ...copy,
   field('Название работы',work.fullTitle),
   field('В портфолио',work.client)
  ]));

  // Explicit work ownership is authoritative; an agency's stale works list
  // cannot attach an unrelated project. Do not index another team's client name.
  const slugs=new Set([work.agencySlug,...(Array.isArray(work.agencySlugs)?work.agencySlugs:[])].filter(hasSlug));
  const fields=[...copy,field('Название работы',work.fullTitle)].filter(Boolean)
   .map(item=>({...item,workTitle:publicText(work.fullTitle)}));
  for(const slug of slugs){
   if(!linkedFields.has(slug))linkedFields.set(slug,[]);
   linkedFields.get(slug).push(...fields);
   ownedWorkFields.set(JSON.stringify([slug,work.slug]),fields);
  }
 }

 for(const agency of agencies){
  if(!hasSlug(agency?.slug))continue;
  ownIndexes.set(agency.slug,makeIndex([...publicFields(agency),field('Название агентства',agency.name)]));
  agencyIndexes.set(agency.slug,makeIndex([
   ...publicFields(agency),
   ...(linkedFields.get(agency.slug)||[]),
   field('Название агентства',agency.name)
  ]));
 }

 // Each result is detached from the indexes and source records. The presence
 // of workTitle marks a linked-work source, including an unnamed public work.
 return {
  searchWork:(slug,query)=>match(workIndexes.get(slug),query),
  searchAgency:(slug,query)=>match(agencyIndexes.get(slug),query),
  searchAgencyOwn:(slug,query)=>match(ownIndexes.get(slug),query),
  searchAgencyWork:(agencySlug,workSlug,query)=>{
   const fields=ownedWorkFields.get(JSON.stringify([agencySlug,workSlug]));
   return match(fields?makeIndex([...(ownIndexes.get(agencySlug)?.entries||[]),...fields]):null,query);
  }
 };
}
