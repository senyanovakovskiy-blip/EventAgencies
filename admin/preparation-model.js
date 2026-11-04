export const preparationDraftFields={
 attraction:{label:'Что привлекло клиента / его ожидание',max:1500},
 strengths:{label:'Возможные сильные стороны для этой задачи',max:1500},
 unknowns:{label:'Ограничения и неизвестное',max:1500},
 questions:{label:'Вопросы для разговора',max:2000},
 scenario:{label:'Черновой сценарий / идея',max:4000},
 nextStep:{label:'Следующий шаг',max:1000}
};
export const preparationFollowUpFields={
 clientFeedback:{label:'Что сказал клиент после обсуждения',max:2000},
 scenarioChanges:{label:'Что меняем в сценарии после разговора',max:2000}
};
export const preparationFields={...preparationDraftFields,...preparationFollowUpFields};
export const PREPARATION_LIMIT=24000;
export const PREPARATION_MAX_ITEMS=30;
const slug=value=>typeof value==='string'&&value.length<=200&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const preparationKey=value=>value.agencySlug+'/'+(value.workSlug||'');
export const emptyPreparation=(agencySlug,workSlug=null)=>({agencySlug,workSlug,...Object.fromEntries(Object.keys(preparationFields).map(key=>[key,'']))});
export function normalizePreparation(value){
 const seen=new Set();
 return (Array.isArray(value)?value:[]).filter(item=>{
  if(!item||!slug(item.agencySlug)||item.workSlug!=null&&!slug(item.workSlug))return false;
  const key=preparationKey(item);if(seen.has(key))return false;seen.add(key);return true;
 }).map(item=>({...emptyPreparation(item.agencySlug,item.workSlug||null),...Object.fromEntries(Object.keys(preparationFields).map(key=>[key,typeof item[key]==='string'?item[key]:'']))}));
}
export const preparationLength=items=>items.reduce((sum,item)=>sum+Object.keys(preparationFields).reduce((n,key)=>n+item[key].length,0),0);
// Only omitted follow-up fields inherit the exact pair's saved values. An own
// property, including '' or an invalid type, must reach normal validation.
const withPreviousFollowUp=(item,previous)=>({...item,...Object.fromEntries(Object.keys(preparationFollowUpFields).filter(field=>!Object.hasOwn(item,field)).map(field=>[field,previous?.[field]??'']))});
// Match validation's legacy-field inheritance and server trimming when checking
// a repeated save before validation. This key does not replace validation.
export function preparationContentKey(value,previous=[]){
 const old=new Map(normalizePreparation(previous).map(item=>[preparationKey(item),item]));
 const input=Array.isArray(value)?value.map(item=>item&&typeof item==='object'?withPreviousFollowUp(item,old.get(preparationKey(item))):item):value;
 return JSON.stringify(normalizePreparation(input).map(item=>({...item,...Object.fromEntries(Object.keys(preparationFields).map(key=>[key,item[key].trim()]))})));
}
export function validatePreparation(input,previous,catalog,selection=[]){
 const fail=code=>{throw Object.assign(new Error(code),{status:400,code});};
 if(input===undefined)return normalizePreparation(previous);
 if(!Array.isArray(input)||input.length>PREPARATION_MAX_ITEMS)fail('invalid_preparation');
 const old=normalizePreparation(previous),oldByKey=new Map(old.map(item=>[preparationKey(item),item])),seen=new Set();
 const result=input.map(item=>{
  if(!item||!slug(item.agencySlug)||item.workSlug!==null&&!slug(item.workSlug))fail('invalid_preparation');
  const key=preparationKey(item);if(seen.has(key))fail('invalid_preparation');seen.add(key);
  const preserved=[...old,...selection].some(entry=>preparationKey(entry)===key||!item.workSlug&&entry.agencySlug===item.agencySlug);
  const agency=catalog.agencies.some(a=>a.slug===item.agencySlug),work=!item.workSlug||catalog.projects.some(p=>p.slug===item.workSlug&&(p.agencySlug===item.agencySlug||p.agencySlugs?.includes(item.agencySlug)));
  // A disappeared source selection remains discussable; never rewrite a receipt.
  if(!preserved&&(!agency||!work))fail('invalid_preparation');
  const next=emptyPreparation(item.agencySlug,item.workSlug),values=withPreviousFollowUp(item,oldByKey.get(key));
  for(const [field,{max}]of Object.entries(preparationFields)){
   if(typeof values[field]!=='string'||values[field].length>max)fail('invalid_preparation');
   next[field]=values[field].trim();
  }
  return next;
 });
 if(old.some(entry=>!seen.has(preparationKey(entry))))fail('keep_preparation_history');
 if(preparationLength(result)>PREPARATION_LIMIT)fail('preparation_too_large');
 return result;
}
