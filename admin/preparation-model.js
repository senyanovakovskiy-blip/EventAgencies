export const preparationFields={
 attraction:{label:'Что привлекло клиента / его ожидание',max:1500},
 strengths:{label:'Возможные сильные стороны для этой задачи',max:1500},
 unknowns:{label:'Ограничения и неизвестное',max:1500},
 questions:{label:'Вопросы для разговора',max:2000},
 scenario:{label:'Черновой сценарий / идея',max:4000},
 nextStep:{label:'Следующий шаг',max:1000}
};
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
// Match server trimming when recognizing a repeated identical save.
export const preparationContentKey=value=>JSON.stringify(normalizePreparation(value).map(item=>({...item,...Object.fromEntries(Object.keys(preparationFields).map(key=>[key,item[key].trim()]))})));
export function validatePreparation(input,previous,catalog,selection=[]){
 const fail=code=>{throw Object.assign(new Error(code),{status:400,code});};
 if(input===undefined)return normalizePreparation(previous);
 if(!Array.isArray(input)||input.length>PREPARATION_MAX_ITEMS)fail('invalid_preparation');
 const old=normalizePreparation(previous),seen=new Set();
 const result=input.map(item=>{
  if(!item||!slug(item.agencySlug)||item.workSlug!==null&&!slug(item.workSlug))fail('invalid_preparation');
  const key=preparationKey(item);if(seen.has(key))fail('invalid_preparation');seen.add(key);
  const preserved=[...old,...selection].some(entry=>preparationKey(entry)===key||!item.workSlug&&entry.agencySlug===item.agencySlug);
  const agency=catalog.agencies.some(a=>a.slug===item.agencySlug),work=!item.workSlug||catalog.projects.some(p=>p.slug===item.workSlug&&(p.agencySlug===item.agencySlug||p.agencySlugs?.includes(item.agencySlug)));
  // A disappeared source selection remains discussable; never rewrite a receipt.
  if(!preserved&&(!agency||!work))fail('invalid_preparation');
  const next=emptyPreparation(item.agencySlug,item.workSlug);
  for(const [field,{max}]of Object.entries(preparationFields)){
   if(typeof item[field]!=='string'||item[field].length>max)fail('invalid_preparation');
   next[field]=item[field].trim();
  }
  return next;
 });
 if(old.some(entry=>!seen.has(preparationKey(entry))))fail('keep_preparation_history');
 if(preparationLength(result)>PREPARATION_LIMIT)fail('preparation_too_large');
 return result;
}
