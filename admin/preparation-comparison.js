import {preparationFields,preparationKey} from './preparation-model.js';

export const PREPARATION_COMPARISON_LIMIT=3;
export const PREPARATION_COMPARISON_NOTICE='Описания агентства и работы — текущая редакционная подача сайта, не слова клиента и не подтверждение его интереса. Неизвестно, видел ли клиент именно этот текст при выборе.';

const slug=value=>typeof value==='string'&&value.length<=200&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const nonblank=value=>typeof value==='string'&&Boolean(value.trim());
const iterable=value=>value&&typeof value!=='string'&&typeof value[Symbol.iterator]==='function'?value:[];
const fields=Object.keys(preparationFields);
function pair(value){
 if(!value||!slug(value.agencySlug))return null;
 const workSlug=value.workSlug==null||value.workSlug===''?null:value.workSlug;
 return workSlug===null||slug(workSlug)?{agencySlug:value.agencySlug,workSlug}:null;
}
function currentPresentation(entity){
 const value=entity?.presentation;
 const copy=Object.fromEntries(['lead','intro','fit','participation'].map(key=>[key,typeof value?.[key]==='string'?value[key]:'']));
 const discussionPrompts=Array.isArray(value?.discussionPrompts)?value.discussionPrompts.filter(prompt=>typeof prompt==='string'&&prompt.trim()).slice(0,3):[];
 if(discussionPrompts.length)copy.discussionPrompts=discussionPrompts.join('\n');
 return Object.values(copy).some(nonblank)?copy:null;
}
function optionFor(entry,catalog,receipt){
 const agency=(catalog?.agencies||[]).find(item=>item.slug===entry.agencySlug);
 const work=entry.workSlug?(catalog?.projects||[]).find(item=>item.slug===entry.workSlug):null;
 const selection=Array.isArray(receipt?.selection)?receipt.selection:[];
 // The receipt may contain several works of one agency. A work title must be
 // tied to this exact pair, never the first same-agency receipt entry.
 const originalWork=entry.workSlug?selection.find(item=>item.agencySlug===entry.agencySlug&&item.work?.slug===entry.workSlug&&(!item.workSlug||item.workSlug===entry.workSlug)):null;
 const originalAgency=nonblank(originalWork?.name)?originalWork:selection.find(item=>item.agencySlug===entry.agencySlug&&nonblank(item.name));
 const nameSource=nonblank(agency?.name)?'catalog':nonblank(originalAgency?.name)?'receipt':'identifier';
 const name=nameSource==='catalog'?agency.name:nameSource==='receipt'?originalAgency.name:(agency?'Название агентства не указано · ':'Недоступное агентство · ')+entry.agencySlug;
 const currentTitle=nonblank(work?.fullTitle)?work.fullTitle:nonblank(work?.title)?work.title:'';
 const titleSource=!entry.workSlug?'none':currentTitle?'catalog':nonblank(originalWork?.work?.title)?'receipt':'identifier';
 const title=titleSource==='none'?'Без конкретной работы':titleSource==='catalog'?currentTitle:titleSource==='receipt'?originalWork.work.title:(work?'Название работы не указано · ':'Недоступная работа · ')+entry.workSlug;
 const linked=Boolean(work&&(work.agencySlug===entry.agencySlug||work.agencySlugs?.includes(entry.agencySlug)));
 const workStatus=!entry.workSlug?'not_selected':!work?'missing':linked?'available':'unlinked';
 const warnings=[];
 if(!agency)warnings.push({code:'agency_missing',message:'Агентство отсутствует в текущем каталоге. Название из исходной заявки, если оно есть, не подтверждает актуальность профиля.'});
 if(workStatus==='not_selected')warnings.push({code:'work_not_selected',message:'Конкретная работа не выбрана. Эти поля относятся к подготовке по агентству.'});
 if(workStatus==='missing')warnings.push({code:'work_missing',message:'Работа отсутствует в текущем каталоге. Сохранённое название не заменяет актуальные сведения о ней.'});
 if(workStatus==='unlinked')warnings.push({code:'work_unlinked',message:'Текущий каталог не связывает эту работу с выбранным агентством. Текст страницы работы показан отдельно; её опыт и участие нельзя приписывать этой команде.'});
 return {
  key:preparationKey(entry),agencySlug:entry.agencySlug,workSlug:entry.workSlug,
  label:name+' · '+title,origins:[...entry.origins],
  agency:{slug:entry.agencySlug,name,nameSource,available:Boolean(agency),href:agency?'/agency/'+entry.agencySlug:null},
  work:{slug:entry.workSlug,title,titleSource,status:workStatus,available:Boolean(work),linked,href:work?'/work/'+entry.workSlug:null},
  // No raw-description or receipt fallback: these are current page fields only.
  presentation:{agency:currentPresentation(agency),work:currentPresentation(work)},
  warnings
 };
}

/**
 * contexts: Map<key, {agencySlug, workSlug, origins:string[]}> OR any iterable
 * (including an array / map.values()) of those values. Map keys are not trusted:
 * pair keys are derived using preparationKey. Duplicate pairs merge origins in
 * first-seen order. Invalid pairs are ignored; catalogue absence does not drop
 * a valid context. The result and its nested data are detached from all inputs.
 *
 * Returns Option[]: {key, agencySlug, workSlug, label, origins, agency, work,
 * presentation:{agency,work}, warnings:[{code,message}]}.
 */
export function getPreparationComparisonOptions(contexts,catalog,receipt){
 const grouped=new Map();
 for(const value of iterable(contexts instanceof Map?contexts.values():contexts)){
  const identity=pair(value);if(!identity)continue;
  const key=preparationKey(identity),entry=grouped.get(key)||{...identity,origins:[]};
  for(const origin of iterable(value.origins))if(nonblank(origin)&&!entry.origins.includes(origin))entry.origins.push(origin);
  grouped.set(key,entry);
 }
 return [...grouped.values()].map(entry=>optionFor(entry,catalog,receipt));
}

/**
 * Call with a FRESH readPreparation(form) array for every render. There is no
 * fallback to a saved workflow, no generation and no input normalization/trims.
 * `fields` contains all eight preparation strings; missing/non-string values
 * become ''. Duplicate preparation rows use the last supplied row, never merge
 * fields from different rows. Selection is view state only, in requested order.
 *
 * Returns {columns: Array<Option & {fields}>, selectedKeys, unknownKeys,
 * overflowKeys, limit, presentationNotice}. `selectedKeys` lists the displayed
 * columns; unknown keys are not available contexts, overflow keys are additional
 * valid selections beyond three. No replacement columns are chosen implicitly.
 */
export function buildPreparationComparison({selectedKeys=[],contexts,preparation,catalog,receipt}){
 if(!Array.isArray(preparation))throw new TypeError('Pass current readPreparation(form) values as preparation');
 const options=new Map(getPreparationComparisonOptions(contexts,catalog,receipt).map(option=>[option.key,option]));
 const current=new Map();
 for(const value of preparation){const identity=pair(value);if(identity)current.set(preparationKey(identity),value);}
 const seen=new Set(),columns=[],unknownKeys=[],overflowKeys=[];
 for(const key of iterable(selectedKeys)){
  if(typeof key!=='string'||seen.has(key))continue;
  seen.add(key);const option=options.get(key);
  if(!option){unknownKeys.push(key);continue;}
  if(columns.length===PREPARATION_COMPARISON_LIMIT){overflowKeys.push(key);continue;}
  const value=current.get(key);
  columns.push({...option,fields:Object.fromEntries(fields.map(field=>[field,typeof value?.[field]==='string'?value[field]:'']))});
 }
 return {columns,selectedKeys:columns.map(column=>column.key),unknownKeys,overflowKeys,limit:PREPARATION_COMPARISON_LIMIT,presentationNotice:PREPARATION_COMPARISON_NOTICE};
}
