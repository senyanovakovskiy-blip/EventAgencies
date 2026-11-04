import {workNoteKey} from './project-store.js';

// Missing or qualified information is never evidence that two teams are equal.
const unknown=/(?:уточн|неизвест|не\s+(?:извест|раскры|указан|назван|опубликован|представлен|подтвержд|определ[её]н|заявлен|описан|сообщ|привед[её]н)|нет\s+(?:данных|информации|сведений)|(?:данные|информация|сведения)\s+отсутств|независим(?:ая|ой)\s+проверк|нужно\s+обсудить|обсужд|по\s+(?:запросу|согласованию)|индивидуальн)/iu;
function knownText(value){
 if(typeof value!=='string')return null;
 const text=value.normalize('NFC').replace(/\r\n?/g,'\n').trim();
 return !text||unknown.test(text)||/…|\.{3}/.test(text)||/^[-—–?.\s]+$/.test(text)||/^(?:н\/д|n\/a|unknown|tbd)$/i.test(text)?null:text;
}
const complete=values=>values.every(value=>value!==null)?values:null;
const availableWork=({s,p})=>Boolean(p&&p.slug===s.workSlug&&(p.agencySlug===s.agencySlug||p.agencySlugs?.includes(s.agencySlug)));
function valueFor(id,pick,{types,notes}){
 const {s,a,p}=pick;
 switch(id){
  case 'work':
   // Include every displayed fact, not just a possibly repeated work title.
   return availableWork(pick)?complete([knownText(p.slug),knownText(p.fullTitle),knownText(p.category),knownText(p.eventCity),knownText(p.guestLabel)]):null;
  case 'note':return availableWork(pick)?knownText(notes[workNoteKey(s.agencySlug,p.slug)]):null;
  case 'specialization':{
   if(!Array.isArray(a.types)||!a.types.length||a.types.some(type=>typeof type!=='string'||!knownText(types[type])))return null;
   // Specializations are a set; their publication order is not a difference.
   return [...new Set(a.types)].sort().map(type=>[type,knownText(types[type])]);
  }
  case 'city':return knownText(a.city);
  case 'geography':return knownText(a.geography);
  case 'services':return knownText(a.services);
  case 'budget':return knownText(a.budgetConditions);
  case 'role':{
   if(!availableWork(pick))return null;
   const role=knownText(p.role);
   if(!role||/^(?:Проект|Работа)\s+.*портфолио|состав работ не раскрыт|границы участия не раскрыты/iu.test(role))return null;
   return role;
  }
  // Future event terms are unknown; source links stay available to inspect.
  default:return null;
 }
}

/** Compare original values only. No markup, action labels or visual styles. */
export function comparisonValuesMatch(id,picks,{types={},notes={}}={}){
 if(picks.length<2||id==='sources'||id==='event-terms')return false;
 const values=picks.map(pick=>valueFor(id,pick,{types,notes}));
 if(values.some(value=>value===null))return false;
 const first=JSON.stringify(values[0]);
 return values.every(value=>JSON.stringify(value)===first);
}
