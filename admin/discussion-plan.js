import {briefFields} from './workflow-model.js';
import {preparationDraftFields,preparationFollowUpFields} from './preparation-model.js';
import {getPreparationComparisonOptions,buildPreparationComparison} from './preparation-comparison.js';

const title='Внутренний план разговора';
const comparisonTitle='Внутренний план обсуждения вариантов';
const planNotice='Собрано из текущих данных страницы, включая возможные несохранённые правки. Это внутренний рабочий план, не подтверждённый сценарий и не сообщение клиенту.';
const presentationFields={lead:'Краткое описание',intro:'Описание',fit:'Если вам близко',participation:'Участие команды и его границы'};
const valueBlock=(label,value,empty='Не заполнено.')=>label+'\n'+(typeof value==='string'&&value.length?value:empty);

function safeOrigin(value){
 // Accept an origin, not an arbitrary URL: credentials, path/query/hash and
 // control characters must not enter copied links. Invalid input is not echoed.
 if(typeof value!=='string'||!/^https?:\/\//i.test(value)||/[\s\u0000-\u001f\u007f\\?#]/.test(value))return null;
 try{
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.origin==='null')return null;
  return url.origin;
 }catch{return null;}
}
function pageSection(heading,copy){
 return [heading,...Object.entries(presentationFields).map(([key,label])=>valueBlock(label,copy?.[key],'В текущей подаче не передано.'))].join('\n\n');
}
function requireCurrentInputs(preparation,workflow){
 if(!Array.isArray(preparation))throw new TypeError('Pass current readPreparation(form) values as preparation');
 if(!workflow||!workflow.brief||typeof workflow.brief!=='object'||Array.isArray(workflow.brief))throw new TypeError('Pass current readEditor(form).workflow as workflow');
}
const formatSections=sections=>sections.filter(section=>section!=='').join('\n\n');
function briefSection(workflow){
 return 'Задача — полный рабочий бриф со страницы\n\n'+Object.entries(briefFields).map(([key,label])=>valueBlock(label,workflow.brief[key])).join('\n\n');
}
function planLinks(column,origin){
 return [
  {kind:'agency',label:'Профиль агентства',href:column.agency.href},
  {kind:'work',label:column.work.status==='unlinked'?'Страница работы — связь с агентством не подтверждена':'Страница работы',href:column.work.href}
 ].filter(link=>link.href).map(link=>({...link,href:origin?origin+link.href:link.href}));
}
function contextSections(column,links){
 return [
  'Контекст разговора\nАгентство: '+column.agency.name+'\nРабота: '+column.work.title,
  column.warnings.length?'Состояние выбранного варианта\n'+column.warnings.map(warning=>warning.message).join('\n'):'',
  links.length?'Ссылки на доступные страницы сайта\n'+links.map(link=>link.label+': '+link.href).join('\n'):'Ссылки на актуальные страницы этого варианта недоступны.'
 ];
}
function variantSections(column){
 const workHeading=column.work.status==='unlinked'?'Подача работы при составлении плана — отдельно от агентства':column.work.status==='not_selected'?'Подача работы — конкретная работа не выбрана':'Подача работы при составлении плана';
 return [
  'Как вариант представлен на сайте при составлении плана\nЭто редакционные тексты сайта на момент составления плана, не слова клиента и не подтверждение его интереса. Неизвестно, видел ли клиент именно этот текст при выборе.',
  pageSection('Подача агентства при составлении плана — '+column.agency.name,column.presentation.agency),
  pageSection(workHeading+' — '+column.work.title,column.presentation.work),
  'Рабочие записи и гипотезы по выбранному варианту\nНиже — записанный на странице текст оператора. Его формулировки не подтверждают условия, интерес команды или согласие клиента.',
  ...Object.entries(preparationDraftFields).map(([key,{label}])=>valueBlock(label,column.fields[key],'Пока не записано.')),
  'После обсуждения — записи оператора\nРучные записи отдельно от исходных гипотез. Они не меняют отметки подтверждения брифа, согласий сторон и состоявшегося разговора. Условия и изменения сценария согласуются отдельно.',
  ...Object.entries(preparationFollowUpFields).map(([key,{label}])=>valueBlock(label,column.fields[key],'Пока не записано.'))
 ];
}

/**
 * Pure, deterministic plain-text projection for ONE active agency/work pair.
 * `preparation` must be a fresh readPreparation(form) array; `workflow` must be
 * readEditor(form).workflow. Missing inputs throw TypeError rather than silently
 * using a saved workflow/receipt brief. An invalid pair returns null; a valid but
 * missing/unlinked catalogue entry remains usable with comparison warnings.
 *
 * Returns {key, title, contextTitle, text, warnings:[{code,message}],
 *          links:[{kind:'agency'|'work', label, href}]}.
 * All eight preparation strings, briefFields and presentation strings are included
 * without trimming, shortening, rewriting or generating missing content. Empty
 * values receive explicit labels in the text. Comparison's exact-pair receipt
 * fallback and last-duplicate-preparation-row semantics are preserved.
 *
 * siteOrigin is optional. A safe http(s) origin makes available page links
 * absolute; otherwise they remain root-relative. No source URLs, contacts,
 * consent/history metadata or tokens are selected from the input objects.
 * Explicit free text is carried verbatim, not inspected or redacted. UI must
 * render `text` as plain text, not innerHTML; this module performs no DOM, I/O,
 * clipboard, save, clock or random operations. Equality of text can detect stale
 * previews; selection and preview state stay outside the workflow.
 */
export function buildDiscussionPlan({entry,preparation,workflow,catalog,receipt,siteOrigin}={}){
 requireCurrentInputs(preparation,workflow);
 const option=getPreparationComparisonOptions([entry],catalog,receipt)[0];
 if(!option)return null;
 const comparison=buildPreparationComparison({selectedKeys:[option.key],contexts:[entry],preparation,catalog,receipt});
 const column=comparison.columns[0],origin=safeOrigin(siteOrigin);
 const links=planLinks(column,origin);
 const sections=[title,planNotice,...contextSections(column,links),briefSection(workflow),...variantSections(column)];
 return {key:column.key,title,contextTitle:column.label,text:formatSections(sections),warnings:column.warnings,links};
}

/**
 * Whole plan for 1–3 explicitly selected contexts, not concatenated single plans.
 * Inputs and plain-text/privacy guarantees match buildDiscussionPlan. `contexts`
 * accepts the comparison model's Map or iterable of context values; selectedKeys
 * accepts an iterable of strings. Non-string entries are ignored and duplicate
 * keys are removed in first-seen order, exactly as in comparison. Iterables are
 * consumed once. The preparation/workflow freshness requirements still throw
 * TypeError when omitted, including when there is no selection.
 *
 * Common result: {status, reason, reasons, message, key, title, contextTitle,
 * requestedKeys, selectedKeys, unknownKeys, overflowKeys, limit, text, variants}.
 * - ready: reason:null, reasons:[], message:'', full text, variants in selected
 *   order as {key, contextTitle, warnings, links}. The brief appears once.
 * - unavailable: text:'', variants:[], reason is the first item of reasons:
 *   empty_selection, unknown_context, too_many_variants (in that priority).
 *   No truncated/partial plan is exposed. selectedKeys is only the comparison
 *   model's resolved prefix for diagnostics, NOT a usable fallback selection.
 *
 * requestedKeys is the complete normalized selection, including unknown and
 * overflow keys. key = 'comparison:' + JSON.stringify(requestedKeys) therefore
 * tracks order as well as membership. Use key AND text for stale detection;
 * neither is a stored receipt/version. Missing catalogue records are distinct
 * from unknown contexts: known contexts remain ready with explicit warnings.
 */
export function buildComparisonDiscussionPlan({selectedKeys=[],contexts,preparation,workflow,catalog,receipt,siteOrigin}={}){
 requireCurrentInputs(preparation,workflow);
 const iterable=selectedKeys&&typeof selectedKeys!=='string'&&typeof selectedKeys[Symbol.iterator]==='function'?selectedKeys:[];
 const requestedKeys=[...new Set([...iterable].filter(key=>typeof key==='string'))];
 const comparison=buildPreparationComparison({selectedKeys:requestedKeys,contexts,preparation,catalog,receipt});
 const {selectedKeys:resolvedKeys,unknownKeys,overflowKeys,limit}=comparison;
 const reasons=[];
 if(!requestedKeys.length)reasons.push('empty_selection');
 if(unknownKeys.length)reasons.push('unknown_context');
 if(requestedKeys.length>limit)reasons.push('too_many_variants');
 const result={
  status:reasons.length?'unavailable':'ready',reason:reasons[0]||null,reasons,message:'',
  key:'comparison:'+JSON.stringify(requestedKeys),title:comparisonTitle,contextTitle:'План вариантов недоступен',
  requestedKeys,selectedKeys:resolvedKeys,unknownKeys,overflowKeys,limit,text:'',variants:[]
 };
 if(reasons.length){
  const messages={
   empty_selection:'Выберите от одного до трёх вариантов для общего плана.',
   unknown_context:'Часть выбранных контекстов больше недоступна в сравнении. Обновите выбор; общий план не составлен.',
   too_many_variants:'Выбрано больше трёх разных вариантов. Сократите выбор; общий план не составлен.'
  };
  result.message=reasons.map(reason=>messages[reason]).join(' ');return result;
 }
 const origin=safeOrigin(siteOrigin);
 result.variants=comparison.columns.map(column=>({key:column.key,contextTitle:column.label,warnings:column.warnings,links:planLinks(column,origin)}));
 result.contextTitle=result.variants.map((variant,index)=>(index+1)+'. '+variant.contextTitle).join(' | ');
 result.text=formatSections([
  comparisonTitle,planNotice,
  'Варианты перечислены в порядке выбора в сравнении. Включение в план не подтверждает согласие клиента или команды.',
  briefSection(workflow),
  ...comparison.columns.flatMap((column,index)=>[
   'Вариант '+(index+1)+' — '+column.label,
   ...contextSections(column,result.variants[index].links),...variantSections(column)
  ])
 ]);
 return result;
}
